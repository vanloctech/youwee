//! Metadata command - fetches video metadata without downloading
//!
//! Supports: info.json, description, comments, thumbnail

use rusqlite::{params_from_iter, Connection};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::database::{add_history_internal, add_log_internal};
use crate::services::{
    get_deno_path, get_ffmpeg_path, get_ytdlp_path, get_ytdlp_source,
    run_ytdlp_with_stderr_and_cookies, system_ytdlp_not_found_message,
};
use crate::types::{BackendError, DependencySource};
use crate::utils::{normalize_url, sanitize_output_path, validate_url, CommandExt};

pub static METADATA_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);
pub static DATA_EXPORT_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

#[derive(Clone, serde::Serialize)]
pub struct MetadataProgress {
    pub id: String,
    pub status: String, // "fetching", "finished", "error"
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub error_message: Option<String>,
    pub error_code: Option<String>,
    pub error_params: Option<serde_json::Value>,
}

#[tauri::command]
pub fn cancel_metadata_fetch() {
    METADATA_CANCEL_FLAG.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn cancel_data_export() {
    DATA_EXPORT_CANCEL_FLAG.store(true, Ordering::SeqCst);
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportSource {
    Auto,
    YoutubePlaylist,
    YoutubeChannel,
    UrlList,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractDataRowsInput {
    pub source: ExportSource,
    pub text: String,
    pub limit: Option<u32>,
    pub detail_mode: bool,
    pub cookie_mode: Option<String>,
    pub cookie_browser: Option<String>,
    pub cookie_browser_profile: Option<String>,
    pub cookie_file_path: Option<String>,
    pub proxy_url: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRow {
    pub id: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub platform: Option<String>,
    pub uploader: Option<String>,
    pub thumbnail: Option<String>,
    pub duration_seconds: Option<f64>,
    pub upload_date: Option<String>,
    pub timestamp: Option<i64>,
    pub view_count: Option<i64>,
    pub like_count: Option<i64>,
    pub comment_count: Option<i64>,
    pub share_count: Option<i64>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub playlist_index: Option<i64>,
    pub extractor: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractDataRowsOutput {
    pub source: String,
    pub title: Option<String>,
    pub rows: Vec<ExportRow>,
    pub warnings: Vec<String>,
}

fn export_source_key(source: &ExportSource) -> &'static str {
    match source {
        ExportSource::Auto => "auto",
        ExportSource::YoutubePlaylist => "youtube_playlist",
        ExportSource::YoutubeChannel => "youtube_channel",
        ExportSource::UrlList => "url_list",
    }
}

fn parse_input_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| line.to_string())
        .collect()
}

fn detect_platform(source: &ExportSource, extractor: Option<&str>, url: Option<&str>) -> String {
    let haystack = format!(
        "{} {}",
        extractor.unwrap_or_default().to_lowercase(),
        url.unwrap_or_default().to_lowercase()
    );

    if haystack.contains("youtube") || haystack.contains("youtu.be") {
        "youtube".to_string()
    } else {
        match source {
            ExportSource::Auto => "other".to_string(),
            ExportSource::YoutubePlaylist | ExportSource::YoutubeChannel => "youtube".to_string(),
            ExportSource::UrlList => "other".to_string(),
        }
    }
}

fn string_field(json: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| json.get(*key).and_then(|value| value.as_str()))
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn i64_field(json: &serde_json::Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .find_map(|key| json.get(*key).and_then(|value| value.as_i64()))
}

fn f64_field(json: &serde_json::Value, keys: &[&str]) -> Option<f64> {
    keys.iter()
        .find_map(|key| json.get(*key).and_then(|value| value.as_f64()))
}

fn tags_field(json: &serde_json::Value) -> Option<Vec<String>> {
    json.get("tags")
        .and_then(|value| value.as_array())
        .map(|tags| {
            tags.iter()
                .filter_map(|tag| tag.as_str())
                .filter(|tag| !tag.is_empty())
                .map(|tag| tag.to_string())
                .collect::<Vec<_>>()
        })
        .filter(|tags| !tags.is_empty())
}

fn thumbnail_field(json: &serde_json::Value) -> Option<String> {
    string_field(json, &["thumbnail"])
        .or_else(|| {
            json.get("thumbnails")
                .and_then(|value| value.as_array())
                .and_then(|thumbnails| thumbnails.iter().rev().find_map(|item| item.get("url")))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
        .map(|url| url.replace("http://", "https://"))
}

fn fallback_url(id: &str) -> Option<String> {
    if id.is_empty() {
        return None;
    }
    Some(format!("https://www.youtube.com/watch?v={}", id))
}

fn detect_export_source(url: &str, selected_source: &ExportSource) -> ExportSource {
    if !matches!(selected_source, ExportSource::Auto) {
        return selected_source.clone();
    }

    let lower = url.to_lowercase();
    if lower.contains("youtube.com") || lower.contains("youtu.be") {
        if lower.contains("list=") || lower.contains("/playlist") {
            return ExportSource::YoutubePlaylist;
        }

        if lower.contains("/@")
            || lower.contains("/channel/")
            || lower.contains("/c/")
            || lower.contains("/user/")
        {
            return ExportSource::YoutubeChannel;
        }
    }

    ExportSource::UrlList
}

fn row_from_json(
    source: &ExportSource,
    json: &serde_json::Value,
    _source_url: &str,
) -> Option<ExportRow> {
    let id = string_field(json, &["id", "display_id"])?;
    let extractor = string_field(json, &["extractor_key", "extractor"]);
    let webpage_url = string_field(json, &["webpage_url", "original_url"])
        .or_else(|| {
            string_field(json, &["url"]).and_then(|url| {
                if url.starts_with("http://") || url.starts_with("https://") {
                    Some(url)
                } else {
                    fallback_url(&id)
                }
            })
        })
        .or_else(|| fallback_url(&id));
    let uploader = string_field(json, &["channel", "uploader", "creator", "artist"]);

    Some(ExportRow {
        id,
        title: string_field(json, &["title", "fulltitle"]),
        url: webpage_url.clone(),
        platform: Some(detect_platform(
            source,
            extractor.as_deref(),
            webpage_url.as_deref(),
        )),
        uploader,
        thumbnail: thumbnail_field(json),
        duration_seconds: f64_field(json, &["duration"]),
        upload_date: string_field(json, &["upload_date", "release_date"]),
        timestamp: i64_field(
            json,
            &["timestamp", "release_timestamp", "modified_timestamp"],
        ),
        view_count: i64_field(json, &["view_count", "play_count"]),
        like_count: i64_field(json, &["like_count", "repost_count"]),
        comment_count: i64_field(json, &["comment_count"]),
        share_count: i64_field(json, &["share_count"]),
        description: string_field(json, &["description"]),
        tags: tags_field(json),
        playlist_index: i64_field(json, &["playlist_index"]),
        extractor,
    })
}

fn parse_ytdlp_rows(
    source: &ExportSource,
    output: &str,
    source_url: &str,
) -> (Vec<ExportRow>, Option<String>) {
    let mut rows = Vec::new();
    let mut title = None;

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            if title.is_none() {
                title = string_field(
                    &json,
                    &["playlist_title", "playlist", "channel", "uploader"],
                );
            }
            if let Some(row) = row_from_json(source, &json, source_url) {
                rows.push(row);
            }
        }
    }

    (rows, title)
}

async fn run_export_ytdlp(
    app: &AppHandle,
    source: &ExportSource,
    url: &str,
    limit: Option<u32>,
    detail_mode: bool,
    input: &ExtractDataRowsInput,
) -> Result<(Vec<ExportRow>, Option<String>), String> {
    validate_url(url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let normalized_url = normalize_url(url);
    let is_youtube = normalized_url.contains("youtube.com") || normalized_url.contains("youtu.be");

    let mut args = vec![
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "30".to_string(),
    ];

    if matches!(source, ExportSource::UrlList) {
        args.push("--no-playlist".to_string());
    } else if is_youtube && !detail_mode {
        args.push("--flat-playlist".to_string());
    }

    if let Some(limit) = limit.filter(|value| *value > 0) {
        args.push("--playlist-end".to_string());
        args.push(limit.to_string());
    }

    if is_youtube {
        if let Some(deno_path) = get_deno_path(app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.push("--".to_string());
    args.push(normalized_url.clone());

    let arg_refs: Vec<&str> = args.iter().map(|arg| arg.as_str()).collect();
    let output = run_ytdlp_with_stderr_and_cookies(
        app,
        &arg_refs,
        input.cookie_mode.as_deref(),
        input.cookie_browser.as_deref(),
        input.cookie_browser_profile.as_deref(),
        input.cookie_file_path.as_deref(),
        input.proxy_url.as_deref(),
    )
    .await?;

    if !output.success && output.stdout.trim().is_empty() {
        let detail = output
            .stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("yt-dlp exited with error");
        return Err(BackendError::from_message(detail).to_wire_string());
    }

    Ok(parse_ytdlp_rows(source, &output.stdout, &normalized_url))
}

#[tauri::command]
pub async fn extract_data_rows(
    app: AppHandle,
    input: ExtractDataRowsInput,
) -> Result<ExtractDataRowsOutput, String> {
    DATA_EXPORT_CANCEL_FLAG.store(false, Ordering::SeqCst);

    let lines = parse_input_lines(&input.text);
    if lines.is_empty() {
        return Err(BackendError::from_message("No input URLs found").to_wire_string());
    }

    let mut all_rows = Vec::new();
    let mut title = None;
    let mut warnings = Vec::new();

    for line in lines {
        if DATA_EXPORT_CANCEL_FLAG.load(Ordering::SeqCst) {
            warnings.push("Export stopped by user".to_string());
            break;
        }

        let effective_source = detect_export_source(&line, &input.source);

        match run_export_ytdlp(
            &app,
            &effective_source,
            &line,
            input.limit,
            input.detail_mode,
            &input,
        )
        .await
        {
            Ok((mut rows, source_title)) => {
                if title.is_none() {
                    title = source_title;
                }
                all_rows.append(&mut rows);
            }
            Err(error) => {
                if matches!(input.source, ExportSource::Auto | ExportSource::UrlList) {
                    warnings.push(format!("{}: {}", line, error));
                } else {
                    return Err(error);
                }
            }
        }
    }

    if all_rows.is_empty() {
        return Err(BackendError::from_message("No data rows found").to_wire_string());
    }

    Ok(ExtractDataRowsOutput {
        source: export_source_key(&input.source).to_string(),
        title,
        rows: all_rows,
        warnings,
    })
}

fn sqlite_identifier(value: &str) -> String {
    let mut result = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>();

    while result.contains("__") {
        result = result.replace("__", "_");
    }

    let result = result.trim_matches('_').to_string();
    if result.is_empty() {
        "field".to_string()
    } else {
        result
    }
}

fn sqlite_quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn json_export_value_to_string(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::Null) | None => String::new(),
        Some(serde_json::Value::String(value)) => value.clone(),
        Some(serde_json::Value::Array(values)) => values
            .iter()
            .map(|value| json_export_value_to_string(Some(value)))
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(", "),
        Some(value) => value.to_string(),
    }
}

#[tauri::command]
pub fn export_data_rows_sqlite(
    file_path: String,
    columns: Vec<String>,
    rows: Vec<serde_json::Map<String, serde_json::Value>>,
) -> Result<(), String> {
    if columns.is_empty() {
        return Err(BackendError::from_message("No export fields selected").to_wire_string());
    }

    if Path::new(&file_path).exists() {
        std::fs::remove_file(&file_path)
            .map_err(|error| BackendError::from_message(error.to_string()).to_wire_string())?;
    }

    let conn = Connection::open(&file_path)
        .map_err(|error| BackendError::from_message(error.to_string()).to_wire_string())?;

    let sql_columns = columns
        .iter()
        .map(|column| sqlite_identifier(column))
        .collect::<Vec<_>>();
    let create_columns = sql_columns
        .iter()
        .map(|column| format!("{} TEXT", sqlite_quote_identifier(column)))
        .collect::<Vec<_>>()
        .join(", ");
    conn.execute(
        &format!("CREATE TABLE export_rows ({})", create_columns),
        [],
    )
    .map_err(|error| BackendError::from_message(error.to_string()).to_wire_string())?;

    let column_list = sql_columns
        .iter()
        .map(|column| sqlite_quote_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (0..columns.len())
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let insert_sql = format!(
        "INSERT INTO export_rows ({}) VALUES ({})",
        column_list, placeholders
    );

    let tx = conn
        .unchecked_transaction()
        .map_err(|error| BackendError::from_message(error.to_string()).to_wire_string())?;
    {
        let mut statement = tx
            .prepare(&insert_sql)
            .map_err(|error| BackendError::from_message(error.to_string()).to_wire_string())?;

        for row in rows {
            let values = columns
                .iter()
                .map(|column| json_export_value_to_string(row.get(column)))
                .collect::<Vec<_>>();
            statement
                .execute(params_from_iter(values))
                .map_err(|error| BackendError::from_message(error.to_string()).to_wire_string())?;
        }
    }
    tx.commit()
        .map_err(|error| BackendError::from_message(error.to_string()).to_wire_string())?;

    Ok(())
}

/// Split comments from info.json into separate files
fn split_info_json_and_comments(
    output_dir: &str,
    title: &str,
    write_info_json: bool,
    write_comments: bool,
) -> Result<(), String> {
    // Sanitize title for filename (remove invalid chars)
    let safe_title = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>();

    let info_json_path = Path::new(output_dir).join(format!("{}.info.json", safe_title));

    if !info_json_path.exists() {
        return Ok(()); // No info.json to process
    }

    // Read the original info.json
    let content = std::fs::read_to_string(&info_json_path)
        .map_err(|e| format!("Failed to read info.json: {}", e))?;

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse info.json: {}", e))?;

    // Extract comments if they exist
    let comments = json.get("comments").cloned();
    let comment_count = json.get("comment_count").cloned();

    if write_comments {
        if let Some(ref comments_data) = comments {
            // Write comments to separate file
            let comments_path = Path::new(output_dir).join(format!("{}.comments.json", safe_title));
            let comments_json = serde_json::json!({
                "video_id": json.get("id"),
                "video_title": json.get("title"),
                "comment_count": comment_count,
                "comments": comments_data
            });
            let comments_str = serde_json::to_string_pretty(&comments_json)
                .map_err(|e| format!("Failed to serialize comments: {}", e))?;
            std::fs::write(&comments_path, comments_str)
                .map_err(|e| format!("Failed to write comments.json: {}", e))?;
        }
    }

    // If user wants info.json without comments, remove comments from it
    if write_info_json && write_comments {
        // Remove comments from info.json to keep it clean
        if let Some(obj) = json.as_object_mut() {
            obj.remove("comments");
        }
        let clean_info = serde_json::to_string_pretty(&json)
            .map_err(|e| format!("Failed to serialize info.json: {}", e))?;
        std::fs::write(&info_json_path, clean_info)
            .map_err(|e| format!("Failed to write clean info.json: {}", e))?;
    } else if !write_info_json && write_comments {
        // User only wanted comments, delete the info.json
        std::fs::remove_file(&info_json_path).ok();
    }

    Ok(())
}

#[tauri::command]
pub async fn fetch_metadata(
    app: AppHandle,
    id: String,
    url: String,
    output_path: String,
    write_info_json: bool,
    write_description: bool,
    write_comments: bool,
    write_thumbnail: bool,
    write_subtitles: bool,
    subtitle_langs: Option<String>,
    subtitle_format: Option<String>,
    // Cookie settings (optional)
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    // Proxy settings (optional)
    proxy_url: Option<String>,
) -> Result<(), String> {
    METADATA_CANCEL_FLAG.store(false, Ordering::SeqCst);
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    let sanitized_path = sanitize_output_path(&output_path)
        .map_err(|e| BackendError::from_message(e).to_wire_string())?;
    // Use title only without extension - yt-dlp will add .info.json, .description, .jpg etc
    let output_template = format!("{}/%(title)s", sanitized_path);

    let mut args = vec![
        "--skip-download".to_string(),
        "--no-warnings".to_string(),
        "--no-simulate".to_string(), // Actually write files even with --print
        "--no-playlist".to_string(), // Only fetch single video metadata
        "-o".to_string(),
        output_template.clone(),
    ];

    // Description output template - yt-dlp adds .description automatically
    if write_description {
        args.push("-o".to_string());
        args.push(format!("description:{}/%(title)s", sanitized_path));
    }

    // Comments require info.json to be written first, then we'll split them
    let need_info_json = write_info_json || write_comments;

    // Info JSON - full metadata (we'll split comments out later if needed)
    if need_info_json {
        args.push("--write-info-json".to_string());
        args.push("--no-clean-info-json".to_string()); // Keep all fields
    }

    // Description file (output template already set above)
    if write_description {
        args.push("--write-description".to_string());
    }

    // Comments (stored in info.json, we'll extract to separate file)
    if write_comments {
        args.push("--write-comments".to_string());
    }

    // Thumbnail
    if write_thumbnail {
        args.push("--write-thumbnail".to_string());
        args.push("--convert-thumbnails".to_string());
        args.push("jpg".to_string());
    }

    // Subtitles
    if write_subtitles {
        args.push("--write-subs".to_string());
        args.push("--write-auto-subs".to_string());
        let langs = subtitle_langs.as_deref().unwrap_or("en,vi");
        if !langs.is_empty() {
            args.push("--sub-langs".to_string());
            args.push(langs.to_string());
        }
        let fmt = subtitle_format.as_deref().unwrap_or("srt");
        args.push("--sub-format".to_string());
        args.push(fmt.to_string());
    }

    // Auto use Deno runtime for YouTube (required for JS extractor)
    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    // Add FFmpeg location if available (for thumbnail conversion)
    if let Some(ffmpeg_path) = get_ffmpeg_path(&app).await {
        if let Some(parent) = ffmpeg_path.parent() {
            args.push("--ffmpeg-location".to_string());
            args.push(parent.to_string_lossy().to_string());
        }
    }

    // Cookie/Authentication settings
    let mode = cookie_mode.as_deref().unwrap_or("off");
    match mode {
        "browser" => {
            if let Some(browser) = cookie_browser.as_ref() {
                let mut cookie_arg = browser.clone();
                // Add profile if specified
                if let Some(profile) = cookie_browser_profile.as_ref() {
                    if !profile.is_empty() {
                        cookie_arg = format!("{}:{}", browser, profile);
                    }
                }
                args.push("--cookies-from-browser".to_string());
                args.push(cookie_arg);
            }
        }
        "file" => {
            if let Some(file_path) = cookie_file_path.as_ref() {
                if !file_path.is_empty() {
                    args.push("--cookies".to_string());
                    args.push(file_path.clone());
                }
            }
        }
        _ => {}
    }

    // Proxy settings
    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    // Print JSON info for parsing
    args.push("--print".to_string());
    args.push("%(title)s|||%(thumbnail)s|||%(duration)s".to_string());

    args.push("--".to_string());
    args.push(url.clone());

    // Emit initial progress
    app.emit(
        "metadata-progress",
        MetadataProgress {
            id: id.clone(),
            status: "fetching".to_string(),
            title: None,
            thumbnail: None,
            error_message: None,
            error_code: None,
            error_params: None,
        },
    )
    .ok();

    // Get yt-dlp path
    if let Some((binary_path, is_bundled)) = get_ytdlp_path(&app).await {
        let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/Users".to_string());
        let mut path_entries: Vec<std::path::PathBuf> = std::env::var_os("PATH")
            .map(|paths| std::env::split_paths(&paths).collect())
            .unwrap_or_default();
        path_entries.extend([
            std::path::PathBuf::from(&home_dir).join(".deno/bin"),
            std::path::PathBuf::from(&home_dir).join(".bun/bin"),
            std::path::PathBuf::from("/opt/homebrew/bin"),
            std::path::PathBuf::from("/usr/local/bin"),
        ]);
        let extended_path = std::env::join_paths(path_entries)
            .unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default());

        // Log command with binary path info (same format as download.rs)
        let binary_info = format!("{} (bundled: {})", binary_path.display(), is_bundled);
        let command_str = format!("[{}] yt-dlp {}", binary_info, args.join(" "));
        add_log_internal("command", &command_str, None, Some(&url)).ok();

        let mut cmd = Command::new(&binary_path);
        cmd.args(&args)
            .env("HOME", &home_dir)
            .env("PATH", &extended_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();

        let mut process = cmd.spawn().map_err(|e| {
            BackendError::from_message(format!("Failed to start yt-dlp: {}", e)).to_wire_string()
        })?;

        let stdout = process.stdout.take().ok_or_else(|| {
            BackendError::from_message("Failed to capture stdout").to_wire_string()
        })?;
        let stderr = process.stderr.take().ok_or_else(|| {
            BackendError::from_message("Failed to capture stderr").to_wire_string()
        })?;

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        let mut video_title: Option<String> = None;
        let mut video_thumbnail: Option<String> = None;
        let mut video_duration: Option<i64> = None;
        let mut error_message: Option<String> = None;

        loop {
            if METADATA_CANCEL_FLAG.load(Ordering::SeqCst) {
                process.kill().await.ok();
                add_log_internal("info", "Metadata fetch cancelled by user", None, Some(&url)).ok();
                return Err(BackendError::from_message("Metadata fetch cancelled").to_wire_string());
            }

            tokio::select! {
                line = stdout_reader.next_line() => {
                    match line {
                        Ok(Some(text)) => {
                            // Parse title|||thumbnail|||duration format
                            if video_title.is_none() && text.contains("|||") {
                                let parts: Vec<&str> = text.split("|||").collect();
                                if parts.len() >= 3 {
                                    video_title = Some(parts[0].to_string());
                                    if parts[1] != "NA" && !parts[1].is_empty() {
                                        video_thumbnail = Some(parts[1].to_string());
                                    }
                                    if let Ok(dur) = parts[2].parse::<f64>() {
                                        video_duration = Some(dur as i64);
                                    }

                                    app.emit("metadata-progress", MetadataProgress {
                                        id: id.clone(),
                                        status: "fetching".to_string(),
                                        title: video_title.clone(),
                                        thumbnail: video_thumbnail.clone(),
                                        error_message: None,
                                        error_code: None,
                                        error_params: None,
                                    }).ok();
                                }
                            } else if video_title.is_none() && !text.is_empty() && !text.starts_with("[") {
                                video_title = Some(text.clone());
                                app.emit("metadata-progress", MetadataProgress {
                                    id: id.clone(),
                                    status: "fetching".to_string(),
                                    title: Some(text),
                                    thumbnail: None,
                                    error_message: None,
                                    error_code: None,
                                    error_params: None,
                                }).ok();
                            }
                        }
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
                line = stderr_reader.next_line() => {
                    match line {
                        Ok(Some(text)) => {
                            // Log stderr
                            if !text.is_empty() {
                                add_log_internal("stderr", &text, None, Some(&url)).ok();
                            }
                            if text.contains("ERROR") {
                                error_message = Some(text.clone());
                            }
                        }
                        Ok(None) => {}
                        Err(_) => {}
                    }
                }
            }
        }

        let status = process.wait().await.map_err(|e| {
            BackendError::from_message(format!("Process error: {}", e)).to_wire_string()
        })?;

        if status.success() {
            let title = video_title.clone().unwrap_or_else(|| "Unknown".to_string());

            // Sanitize title for filename (same logic as split_info_json_and_comments)
            let safe_title: String = title
                .chars()
                .map(|c| match c {
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                    _ => c,
                })
                .collect();

            // Post-process: rename description file to .description.txt
            if write_description {
                let old_path =
                    Path::new(&sanitized_path).join(format!("{}.description", safe_title));
                let new_path =
                    Path::new(&sanitized_path).join(format!("{}.description.txt", safe_title));
                if old_path.exists() {
                    std::fs::rename(&old_path, &new_path).ok();
                }
            }

            // Post-process: split comments into separate file
            if write_comments || (write_info_json && write_comments) {
                if let Err(e) = split_info_json_and_comments(
                    &sanitized_path,
                    &title,
                    write_info_json,
                    write_comments,
                ) {
                    add_log_internal(
                        "stderr",
                        &format!("Post-process warning: {}", e),
                        None,
                        Some(&url),
                    )
                    .ok();
                }
            }

            // Build output file info
            let mut files_saved = Vec::new();
            if write_info_json {
                files_saved.push("info.json");
            }
            if write_comments {
                files_saved.push("comments.json");
            }
            if write_description {
                files_saved.push("description.txt");
            }
            if write_thumbnail {
                files_saved.push("thumbnail.jpg");
            }
            if write_subtitles {
                let fmt = subtitle_format.as_deref().unwrap_or("srt");
                let langs = subtitle_langs.as_deref().unwrap_or("en,vi");
                // Use a static string for the push, then log details
                files_saved.push("subtitles");
                let sub_detail = format!("subtitles ({}, {})", langs, fmt);
                add_log_internal("info", &sub_detail, None, Some(&url)).ok();
            }

            let success_msg = format!("Metadata fetched: {} ({})", title, files_saved.join(", "));
            add_log_internal("success", &success_msg, None, Some(&url)).ok();

            // Save to library/history
            add_history_internal(
                url.clone(),
                title.clone(),
                video_thumbnail.clone(),
                sanitized_path.clone(),           // filepath = output folder
                None,                             // filesize
                video_duration.map(|d| d as u64), // duration as u64
                Some("metadata".to_string()),     // quality field used for type
                Some(files_saved.join(", ")),     // format field used for what was saved
                Some("metadata".to_string()),     // source
                None,                             // time_range
            )
            .ok();

            app.emit(
                "metadata-progress",
                MetadataProgress {
                    id: id.clone(),
                    status: "finished".to_string(),
                    title: video_title,
                    thumbnail: video_thumbnail,
                    error_message: None,
                    error_code: None,
                    error_params: None,
                },
            )
            .ok();
            Ok(())
        } else {
            let err_msg = error_message.unwrap_or_else(|| "Failed to fetch metadata".to_string());
            let backend_err = BackendError::from_message(err_msg.clone());
            add_log_internal("error", &err_msg, None, Some(&url)).ok();

            app.emit(
                "metadata-progress",
                MetadataProgress {
                    id: id.clone(),
                    status: "error".to_string(),
                    title: video_title,
                    thumbnail: video_thumbnail,
                    error_message: Some(err_msg.clone()),
                    error_code: Some(backend_err.code().to_string()),
                    error_params: backend_err.params().cloned(),
                },
            )
            .ok();
            Err(backend_err.to_wire_string())
        }
    } else {
        let err_msg = if get_ytdlp_source(&app).await == DependencySource::System {
            system_ytdlp_not_found_message()
        } else {
            "yt-dlp not found".to_string()
        };
        add_log_internal("error", &err_msg, None, Some(&url)).ok();
        Err(BackendError::from_message(&err_msg).to_wire_string())
    }
}
