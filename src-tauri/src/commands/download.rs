//! Download command - handles video downloading with yt-dlp
//!
//! This module contains the core download functionality including:
//! - Video/audio download with quality/format options
//! - Playlist support
//! - Progress tracking
//! - Subtitle handling

use std::collections::{BTreeMap, VecDeque};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::utils::{normalize_url, validate_url};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::database::add_history_internal;
use crate::database::add_log_internal;
use crate::database::update_history_download;
use crate::services::{
    enqueue_post_download_workflow, get_deno_path, get_ffmpeg_path, get_ytdlp_path,
    get_ytdlp_source, resolve_download_workflow_snapshot, system_ytdlp_not_found_message,
};
use crate::types::{
    BackendError, DependencySource, DownloadProgress, PluginWorkflowStepSnapshot,
    PostDownloadPluginPayload,
};
use crate::utils::{
    build_format_string, format_size, parse_progress, sanitize_output_path, CommandExt,
};

pub static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

const RECENT_OUTPUT_LIMIT: usize = 30;

fn extract_time_range(download_sections: &Option<String>) -> Option<String> {
    download_sections.as_ref().and_then(|s| {
        let stripped = s.strip_prefix('*').unwrap_or(s);
        if stripped.is_empty() {
            None
        } else {
            Some(stripped.to_string())
        }
    })
}

fn workflow_steps_for_trigger(
    app: &AppHandle,
    trigger: &str,
    workflow_snapshots: &BTreeMap<String, Vec<PluginWorkflowStepSnapshot>>,
) -> Vec<PluginWorkflowStepSnapshot> {
    workflow_snapshots
        .get(trigger)
        .cloned()
        .unwrap_or_else(|| resolve_download_workflow_snapshot(app, trigger, None, &[]))
}

#[allow(clippy::too_many_arguments)]
fn build_trigger_payload(
    job_id: &str,
    source: Option<String>,
    trigger: &str,
    output_path: &str,
    filesize: Option<u64>,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) -> PostDownloadPluginPayload {
    let display_name = title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| url.to_string());

    PostDownloadPluginPayload {
        job_id: job_id.to_string(),
        source,
        trigger: trigger.to_string(),
        filepath: String::new(),
        filename: display_name,
        directory: output_path.to_string(),
        filesize,
        format,
        quality,
        url: url.to_string(),
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind: download_kind.to_string(),
        workflow_run_id: None,
        workflow_step_index: None,
        workflow_step_plugin_id: None,
        chain_state: None,
    }
}

#[allow(clippy::too_many_arguments)]
fn enqueue_failed_workflow(
    app: &AppHandle,
    workflow_steps: &[PluginWorkflowStepSnapshot],
    job_id: &str,
    source: Option<String>,
    output_path: &str,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) {
    if workflow_steps.is_empty() {
        return;
    }

    let payload = build_trigger_payload(
        job_id,
        source,
        "download.failed",
        output_path,
        None,
        format,
        quality,
        url,
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind,
    );
    let _ = enqueue_post_download_workflow(app, workflow_steps.to_vec(), payload);
}

#[allow(clippy::too_many_arguments)]
fn enqueue_before_start_workflow(
    app: &AppHandle,
    workflow_steps: &[PluginWorkflowStepSnapshot],
    job_id: &str,
    source: Option<String>,
    output_path: &str,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) {
    if workflow_steps.is_empty() {
        return;
    }

    let payload = build_trigger_payload(
        job_id,
        source,
        "download.beforeStart",
        output_path,
        None,
        format,
        quality,
        url,
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind,
    );
    let _ = enqueue_post_download_workflow(app, workflow_steps.to_vec(), payload);
}

async fn run_completed_plugins(
    app: &AppHandle,
    workflow_steps: &[PluginWorkflowStepSnapshot],
    job_id: &str,
    source: Option<String>,
    filepath: &str,
    filesize: Option<u64>,
    format: Option<String>,
    quality: Option<String>,
    url: &str,
    title: Option<String>,
    thumbnail: Option<String>,
    history_id: Option<String>,
    time_range: Option<String>,
    download_kind: &str,
) {
    if workflow_steps.is_empty() {
        return;
    }

    let path = std::path::Path::new(filepath);
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(filepath)
        .to_string();
    let directory = path
        .parent()
        .map(|parent| parent.to_string_lossy().to_string())
        .unwrap_or_default();

    let payload = PostDownloadPluginPayload {
        job_id: job_id.to_string(),
        source,
        trigger: "download.completed".to_string(),
        filepath: filepath.to_string(),
        filename,
        directory,
        filesize,
        format,
        quality,
        url: url.to_string(),
        title,
        thumbnail,
        history_id,
        time_range,
        download_kind: download_kind.to_string(),
        workflow_run_id: None,
        workflow_step_index: None,
        workflow_step_plugin_id: None,
        chain_state: None,
    };

    let _ = enqueue_post_download_workflow(app, workflow_steps.to_vec(), payload);
}

/// Decode raw bytes from a child process into a Rust String.
///
/// On Windows with a non-UTF-8 locale (e.g. Chinese → GBK), yt-dlp outputs
/// file paths in the system ANSI code page.  Tokio's `BufReader::lines()`
/// expects UTF-8 and returns `Err` on such bytes, which silently stops the
/// reading loop and loses the filepath — causing history records to never be
/// created.  This helper decodes via the Win32 `MultiByteToWideChar` API so
/// the full filepath (including CJK characters) is preserved.
#[cfg(windows)]
fn decode_process_output(bytes: &[u8]) -> String {
    // Fast path: already valid UTF-8
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_string();
    }

    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    extern "system" {
        fn MultiByteToWideChar(
            code_page: u32,
            flags: u32,
            multi_byte_str: *const u8,
            multi_byte: i32,
            wide_char_str: *mut u16,
            wide_char: i32,
        ) -> i32;
    }

    const CP_ACP: u32 = 0; // System default Windows ANSI code page

    unsafe {
        let len = MultiByteToWideChar(
            CP_ACP,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            std::ptr::null_mut(),
            0,
        );
        if len <= 0 {
            return String::from_utf8_lossy(bytes).into_owned();
        }
        let mut wide = vec![0u16; len as usize];
        MultiByteToWideChar(
            CP_ACP,
            0,
            bytes.as_ptr(),
            bytes.len() as i32,
            wide.as_mut_ptr(),
            len,
        );
        OsString::from_wide(&wide).to_string_lossy().into_owned()
    }
}

#[cfg(not(windows))]
fn decode_process_output(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// Kill all yt-dlp and ffmpeg processes
fn kill_all_download_processes() {
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("pkill")
            .args(["-9", "-f", "yt-dlp"])
            .spawn()
            .ok();
        StdCommand::new("pkill")
            .args(["-9", "-f", "ffmpeg"])
            .spawn()
            .ok();
    }
    #[cfg(windows)]
    {
        use crate::utils::CommandExt as _;
        use std::process::Command as StdCommand;
        let mut cmd1 = StdCommand::new("taskkill");
        cmd1.args(["/F", "/IM", "yt-dlp.exe"]);
        cmd1.hide_window();
        cmd1.spawn().ok();

        let mut cmd2 = StdCommand::new("taskkill");
        cmd2.args(["/F", "/IM", "ffmpeg.exe"]);
        cmd2.hide_window();
        cmd2.spawn().ok();
    }
}

fn push_recent_output(buffer: &mut VecDeque<String>, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    if buffer.len() >= RECENT_OUTPUT_LIMIT {
        buffer.pop_front();
    }
    buffer.push_back(trimmed.to_string());
}

fn push_recent_output_shared(buffer: &Arc<Mutex<VecDeque<String>>>, line: &str) {
    if let Ok(mut guard) = buffer.lock() {
        push_recent_output(&mut guard, line);
    }
}

fn recent_output_snapshot(buffer: &Arc<Mutex<VecDeque<String>>>) -> Vec<String> {
    buffer
        .lock()
        .map(|guard| guard.iter().cloned().collect())
        .unwrap_or_default()
}

fn is_aria2_not_found_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    (lower.contains("aria2c") || lower.contains("aria2"))
        && (lower.contains("not found")
            || lower.contains("no such file")
            || lower.contains("is not recognized"))
}

fn normalize_aria2_args(raw_args: &str) -> Option<String> {
    let trimmed = raw_args.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(rest) = trimmed.strip_prefix("aria2c:") {
        let normalized = rest.trim_start();
        return if normalized.is_empty() {
            None
        } else {
            Some(format!("aria2c:{}", normalized))
        };
    }
    if let Some(rest) = trimmed.strip_prefix("aria2:") {
        let normalized = rest.trim_start();
        return if normalized.is_empty() {
            None
        } else {
            Some(format!("aria2c:{}", normalized))
        };
    }
    Some(format!("aria2c:{}", trimmed))
}

fn build_download_error_message(exit_code: Option<i32>, recent_lines: &[String]) -> BackendError {
    if recent_lines
        .iter()
        .any(|line| is_aria2_not_found_line(line))
    {
        return BackendError::new(
            crate::types::code::ARIA2_NOT_FOUND,
            "aria2c not found. Install aria2 and ensure aria2c is available in PATH.",
        )
        .with_retryable(false);
    }

    let reason = recent_lines
        .iter()
        .rev()
        .find(|line| {
            let lower = line.to_lowercase();
            lower.contains("error")
                || lower.contains("unable")
                || lower.contains("failed")
                || lower.contains("http error")
                || lower.contains("forbidden")
                || lower.contains("too many requests")
                || lower.contains("timed out")
        })
        .cloned()
        .or_else(|| recent_lines.last().cloned())
        .unwrap_or_else(|| "Unknown error".to_string());

    match exit_code {
        Some(code) => {
            BackendError::from_message(format!("Download failed (exit code {}): {}", code, reason))
                .with_param("exitCode", code)
        }
        None => BackendError::from_message(format!("Download failed: {}", reason)),
    }
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    id: String,
    url: String,
    output_path: String,
    quality: String,
    format: String,
    download_playlist: bool,
    video_codec: String,
    audio_bitrate: String,
    playlist_limit: Option<u32>,
    subtitle_mode: String,
    subtitle_langs: String,
    subtitle_embed: bool,
    subtitle_format: String,
    log_stderr: Option<bool>,
    _use_bun_runtime: Option<bool>, // Deprecated - now auto uses deno
    use_actual_player_js: Option<bool>,
    history_id: Option<String>,
    // Cookie settings
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    // Embed settings
    embed_metadata: Option<bool>,
    embed_thumbnail: Option<bool>,
    // Proxy settings
    proxy_url: Option<String>,
    // Live stream settings
    live_from_start: Option<bool>,
    // Speed limit settings
    speed_limit: Option<String>,
    // External downloader settings
    use_aria2: Option<bool>,
    aria2_args: Option<String>,
    // SponsorBlock settings
    sponsorblock_remove: Option<String>, // comma-separated categories to remove
    sponsorblock_mark: Option<String>,   // comma-separated categories to mark as chapters
    // Download sections (time range)
    download_sections: Option<String>, // e.g. "*10:30-14:30" for partial download
    // Title (optional, passed from frontend for display purposes)
    title: Option<String>,
    // Thumbnail URL (optional, passed from frontend for non-YouTube sites)
    thumbnail: Option<String>,
    // Source/extractor name (optional, from yt-dlp extractor e.g. "BiliBili", "TikTok")
    source: Option<String>,
    // Legacy snapshot of plugin ids enabled when the job was queued
    post_download_plugins: Option<Vec<String>>,
    // Snapshot of workflow steps by trigger at queue time
    plugin_workflow_snapshots: Option<BTreeMap<String, Vec<PluginWorkflowStepSnapshot>>>,
    // Full workflow step snapshot used for post-processing
    post_download_workflow_steps: Option<Vec<PluginWorkflowStepSnapshot>>,
    // When false, caller is responsible for firing the final download.failed workflow.
    emit_failed_workflow: Option<bool>,
    // Caller context used in plugin payload
    download_kind: Option<String>,
) -> Result<(), String> {
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);
    let post_download_plugins = post_download_plugins.unwrap_or_default();
    let mut plugin_workflow_snapshots = plugin_workflow_snapshots.unwrap_or_default();
    if !plugin_workflow_snapshots.contains_key("download.completed") {
        let completed_steps = resolve_download_workflow_snapshot(
            &app,
            "download.completed",
            post_download_workflow_steps,
            &post_download_plugins,
        );
        plugin_workflow_snapshots.insert("download.completed".to_string(), completed_steps);
    }
    let emit_failed_workflow = emit_failed_workflow.unwrap_or(true);
    let download_kind = download_kind.unwrap_or_else(|| "download".to_string());

    let should_log_stderr = log_stderr.unwrap_or(true);
    let sanitized_path = sanitize_output_path(&output_path)
        .map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let format_string = build_format_string(&quality, &format, &video_codec);
    let output_template = format!("{}/%(title)s.%(ext)s", sanitized_path);

    // Use a temp file to capture the final filepath from yt-dlp.
    // On Windows with non-UTF-8 locales (e.g. Chinese/GBK), stdout is encoded
    // in the system ANSI code page which cannot represent all Unicode characters
    // (such as ⧸ U+29F8 used by yt-dlp to replace / in filenames).
    // --print-to-file always writes UTF-8, so we get the exact filepath.
    let filepath_tmp = std::env::temp_dir().join(format!("youwee-fp-{}.txt", id));

    let mut args = vec![
        "--newline".to_string(),
        "--progress".to_string(),
        "--no-warnings".to_string(),
        "-f".to_string(),
        format_string,
        "-o".to_string(),
        output_template,
        "--print-to-file".to_string(),
        "after_move:filepath".to_string(),
        filepath_tmp.to_string_lossy().to_string(),
        "--no-keep-video".to_string(),
        "--no-keep-fragments".to_string(),
        "--retries".to_string(),
        "3".to_string(),
        "--fragment-retries".to_string(),
        "3".to_string(),
        "--extractor-retries".to_string(),
        "2".to_string(),
        "--file-access-retries".to_string(),
        "2".to_string(),
    ];

    // Auto use Deno runtime for YouTube (required for JS extractor)
    // Use --js-runtimes instead of --extractor-args (handles spaces in path correctly)
    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    // Add actual player.js version if enabled (fixes some YouTube download issues)
    // See: https://github.com/yt-dlp/yt-dlp/issues/14680
    if use_actual_player_js.unwrap_or(false)
        && (url.contains("youtube.com") || url.contains("youtu.be"))
    {
        args.push("--extractor-args".to_string());
        args.push("youtube:player_js_version=actual".to_string());
    }

    // Add FFmpeg location if available
    if let Some(ffmpeg_path) = get_ffmpeg_path(&app).await {
        if let Some(parent) = ffmpeg_path.parent() {
            args.push("--ffmpeg-location".to_string());
            args.push(parent.to_string_lossy().to_string());
        }
    }

    // Subtitle settings
    if subtitle_mode != "off" {
        args.push("--write-subs".to_string());
        if subtitle_mode == "auto" {
            args.push("--write-auto-subs".to_string());
            args.push("--sub-langs".to_string());
            args.push("all".to_string());
        } else {
            args.push("--sub-langs".to_string());
            args.push(subtitle_langs.clone());
        }
        args.push("--sub-format".to_string());
        args.push(subtitle_format.clone());
        if subtitle_embed {
            args.push("--embed-subs".to_string());
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

    // Live stream settings
    if live_from_start.unwrap_or(false) {
        args.push("--live-from-start".to_string());
        args.push("--no-part".to_string());
    }

    // Speed limit settings
    if let Some(limit) = speed_limit.as_ref() {
        if !limit.is_empty() {
            args.push("--limit-rate".to_string());
            args.push(limit.clone());
        }
    }

    // External downloader settings (aria2c)
    if use_aria2.unwrap_or(false) {
        args.push("--downloader".to_string());
        args.push("aria2c".to_string());
        if let Some(raw_args) = aria2_args.as_ref() {
            if let Some(normalized_args) = normalize_aria2_args(raw_args) {
                args.push("--downloader-args".to_string());
                args.push(normalized_args);
            }
        }
    }

    // Force overwrite to avoid HTTP 416 errors from stale .part files
    args.push("--force-overwrites".to_string());

    // Playlist handling
    if !download_playlist {
        args.push("--no-playlist".to_string());
    } else if let Some(limit) = playlist_limit {
        if limit > 0 {
            args.push("--playlist-end".to_string());
            args.push(limit.to_string());
        }
    }

    // Audio formats
    let is_audio_format =
        format == "mp3" || format == "m4a" || format == "opus" || quality == "audio";

    if is_audio_format {
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        match format.as_str() {
            "mp3" => args.push("mp3".to_string()),
            "m4a" => args.push("m4a".to_string()),
            "opus" => args.push("opus".to_string()),
            _ => args.push("mp3".to_string()),
        }
        args.push("--audio-quality".to_string());
        match audio_bitrate.as_str() {
            "128" => args.push("128K".to_string()),
            _ => args.push("0".to_string()),
        }
    } else {
        args.push("--merge-output-format".to_string());
        args.push(format.clone());
    }

    // Embed metadata and thumbnail
    if embed_metadata.unwrap_or(false) {
        args.push("--embed-metadata".to_string());
    }
    if embed_thumbnail.unwrap_or(false) {
        args.push("--embed-thumbnail".to_string());
        // Convert thumbnail to jpg for better compatibility with MP4 container
        args.push("--convert-thumbnails".to_string());
        args.push("jpg".to_string());
    }

    // SponsorBlock settings
    if let Some(ref remove_cats) = sponsorblock_remove {
        if !remove_cats.is_empty() {
            args.push("--sponsorblock-remove".to_string());
            args.push(remove_cats.clone());
        }
    }
    if let Some(ref mark_cats) = sponsorblock_mark {
        if !mark_cats.is_empty() {
            args.push("--sponsorblock-mark".to_string());
            args.push(mark_cats.clone());
        }
    }

    // Download sections (time range)
    if let Some(ref sections) = download_sections {
        if !sections.is_empty() {
            args.push("--download-sections".to_string());
            args.push(sections.clone());
        }
    }

    args.push("--".to_string());
    args.push(url.clone());

    // Get binary info for logging
    let binary_info = get_ytdlp_path(&app).await;
    let binary_path_str = binary_info
        .as_ref()
        .map(|(p, is_bundled)| format!("{} (bundled: {})", p.display(), is_bundled))
        .unwrap_or_else(|| "sidecar".to_string());

    // Log command with binary path
    let command_str = format!("[{}] yt-dlp {}", binary_path_str, args.join(" "));
    add_log_internal("command", &command_str, None, Some(&url)).ok();

    let trigger_source = source.clone().or_else(|| detect_source(&url));
    let trigger_time_range = extract_time_range(&download_sections);
    let before_start_steps =
        workflow_steps_for_trigger(&app, "download.beforeStart", &plugin_workflow_snapshots);
    let completed_workflow_steps =
        workflow_steps_for_trigger(&app, "download.completed", &plugin_workflow_snapshots);
    let failed_workflow_steps =
        workflow_steps_for_trigger(&app, "download.failed", &plugin_workflow_snapshots);

    // Try to get yt-dlp path (prioritizes bundled version for stability)
    if let Some((binary_path, _)) = get_ytdlp_path(&app).await {
        // Build extended PATH with deno/bun locations for JavaScript runtime support
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

        let mut cmd = Command::new(&binary_path);
        cmd.args(&args)
            .env("HOME", &home_dir)
            .env("PATH", &extended_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();

        let process = match cmd.spawn() {
            Ok(process) => process,
            Err(error) => {
                if emit_failed_workflow {
                    enqueue_failed_workflow(
                        &app,
                        &failed_workflow_steps,
                        &id,
                        trigger_source.clone(),
                        &sanitized_path,
                        Some(format.clone()),
                        Some(quality.clone()),
                        &url,
                        title.clone(),
                        thumbnail.clone(),
                        history_id.clone(),
                        trigger_time_range.clone(),
                        &download_kind,
                    );
                }
                return Err(BackendError::from_message(format!(
                    "Failed to start yt-dlp: {}",
                    error
                ))
                .to_wire_string());
            }
        };

        enqueue_before_start_workflow(
            &app,
            &before_start_steps,
            &id,
            trigger_source.clone(),
            &sanitized_path,
            Some(format.clone()),
            Some(quality.clone()),
            &url,
            title.clone(),
            thumbnail.clone(),
            history_id.clone(),
            trigger_time_range.clone(),
            &download_kind,
        );

        return handle_tokio_download(
            app,
            id,
            process,
            quality,
            format,
            url,
            should_log_stderr,
            title,
            thumbnail,
            source,
            download_sections,
            history_id.clone(),
            filepath_tmp.clone(),
            sanitized_path.clone(),
            completed_workflow_steps.clone(),
            failed_workflow_steps.clone(),
            emit_failed_workflow,
            download_kind.clone(),
        )
        .await;
    }

    let ytdlp_source = get_ytdlp_source(&app).await;
    if ytdlp_source == DependencySource::System {
        if emit_failed_workflow {
            enqueue_failed_workflow(
                &app,
                &failed_workflow_steps,
                &id,
                trigger_source.clone(),
                &sanitized_path,
                Some(format.clone()),
                Some(quality.clone()),
                &url,
                title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                trigger_time_range.clone(),
                &download_kind,
            );
        }
        return Err(BackendError::new(
            crate::types::code::YTDLP_SYSTEM_NOT_FOUND,
            system_ytdlp_not_found_message(),
        )
        .to_wire_string());
    }

    // Fallback to sidecar
    let sidecar_result = app.shell().sidecar("yt-dlp");

    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, child) = match sidecar.args(&args).spawn() {
                Ok(result) => result,
                Err(error) => {
                    if emit_failed_workflow {
                        enqueue_failed_workflow(
                            &app,
                            &failed_workflow_steps,
                            &id,
                            trigger_source.clone(),
                            &sanitized_path,
                            Some(format.clone()),
                            Some(quality.clone()),
                            &url,
                            title.clone(),
                            thumbnail.clone(),
                            history_id.clone(),
                            trigger_time_range.clone(),
                            &download_kind,
                        );
                    }
                    return Err(BackendError::from_message(format!(
                        "Failed to start bundled yt-dlp: {}",
                        error
                    ))
                    .to_wire_string());
                }
            };

            enqueue_before_start_workflow(
                &app,
                &before_start_steps,
                &id,
                trigger_source.clone(),
                &sanitized_path,
                Some(format.clone()),
                Some(quality.clone()),
                &url,
                title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                trigger_time_range.clone(),
                &download_kind,
            );

            // Only use frontend title if it's not a URL (placeholder)
            let mut current_title: Option<String> =
                title.clone().filter(|t| !t.starts_with("http"));
            let mut current_index: Option<u32> = None;
            let mut total_count: Option<u32> = None;
            let mut total_filesize: u64 = 0;
            let mut current_stream_size: Option<u64> = None;
            let mut final_filepath: Option<String> = None;
            let mut recent_output: VecDeque<String> = VecDeque::new();

            let quality_display = match quality.as_str() {
                "8k" => Some("8K".to_string()),
                "4k" => Some("4K".to_string()),
                "2k" => Some("2K".to_string()),
                "1080" => Some("1080p".to_string()),
                "720" => Some("720p".to_string()),
                "480" => Some("480p".to_string()),
                "360" => Some("360p".to_string()),
                "audio" => Some("Audio".to_string()),
                "best" => Some("Best".to_string()),
                _ => None,
            };

            while let Some(event) = rx.recv().await {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    child.kill().ok();
                    kill_all_download_processes();
                    return Err(BackendError::from_message("Download cancelled").to_wire_string());
                }

                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = decode_process_output(&line_bytes);
                        push_recent_output(&mut recent_output, &line);

                        // Parse playlist item info
                        if line.contains("Downloading item") {
                            if let Some(re) =
                                regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok()
                            {
                                if let Some(caps) = re.captures(&line) {
                                    current_index =
                                        caps.get(1).and_then(|m| m.as_str().parse().ok());
                                    total_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
                                }
                            }
                        }

                        // Extract title from [download] messages
                        // Handles both: "Destination: /path/file.mp4" and "/path/file.mp4 has already been downloaded"
                        if line.contains("[download]")
                            && (line.contains("Destination:")
                                || line.contains("has already been downloaded")
                                || line.contains("[ExtractAudio]"))
                        {
                            let path_sep = if line.contains('\\') { '\\' } else { '/' };
                            if let Some(start) = line.rfind(path_sep) {
                                let filename = &line[start + 1..];
                                // Remove suffix if present
                                let filename =
                                    filename.trim_end_matches(" has already been downloaded");
                                if let Some(end) = filename.rfind('.') {
                                    current_title = Some(filename[..end].to_string());
                                }
                            }
                        }

                        // Capture final filepath
                        let trimmed = line.trim();
                        if !trimmed.is_empty()
                            && !trimmed.starts_with('[')
                            && !trimmed.starts_with("Deleting")
                            && !trimmed.starts_with("WARNING")
                            && !trimmed.starts_with("ERROR")
                            && (trimmed.ends_with(".mp3")
                                || trimmed.ends_with(".m4a")
                                || trimmed.ends_with(".opus")
                                || trimmed.ends_with(".mp4")
                                || trimmed.ends_with(".mkv")
                                || trimmed.ends_with(".webm")
                                || trimmed.ends_with(".flac")
                                || trimmed.ends_with(".wav"))
                        {
                            final_filepath = Some(trimmed.to_string());
                        }

                        // Parse filesize
                        if line.contains(" of ")
                            && (line.contains("MiB")
                                || line.contains("GiB")
                                || line.contains("KiB"))
                        {
                            if let Some(re) =
                                regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok()
                            {
                                if let Some(caps) = re.captures(&line) {
                                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                                        if let Ok(size) = num.as_str().parse::<f64>() {
                                            let size_bytes = match unit.as_str() {
                                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                                "KiB" => (size * 1024.0) as u64,
                                                _ => size as u64,
                                            };
                                            if current_stream_size != Some(size_bytes) {
                                                if let Some(prev_size) = current_stream_size {
                                                    total_filesize += prev_size;
                                                }
                                                current_stream_size = Some(size_bytes);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Parse progress
                        if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
                            parse_progress(&line)
                        {
                            if pi.is_some() {
                                current_index = pi;
                            }
                            if pc.is_some() {
                                total_count = pc;
                            }

                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                                error_message: None,
                                error_code: None,
                                error_params: None,
                                history_id: None,
                                filepath: None,
                                downloaded_size,
                                elapsed_time,
                            };
                            app.emit("download-progress", progress).ok();
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let stderr_line = decode_process_output(&bytes);
                        let stderr_line = stderr_line.trim().to_string();
                        push_recent_output(&mut recent_output, &stderr_line);

                        if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
                            parse_progress(&stderr_line)
                        {
                            if pi.is_some() {
                                current_index = pi;
                            }
                            if pc.is_some() {
                                total_count = pc;
                            }

                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                                error_message: None,
                                error_code: None,
                                error_params: None,
                                history_id: None,
                                filepath: None,
                                downloaded_size,
                                elapsed_time,
                            };
                            app.emit("download-progress", progress).ok();
                        }

                        if should_log_stderr && !stderr_line.is_empty() {
                            add_log_internal("stderr", &stderr_line, None, Some(&url)).ok();
                        }
                    }
                    CommandEvent::Error(err) => {
                        let error = BackendError::from_message(format!("Process error: {}", err));
                        add_log_internal("error", error.message(), None, Some(&url)).ok();
                        if emit_failed_workflow {
                            enqueue_failed_workflow(
                                &app,
                                &failed_workflow_steps,
                                &id,
                                source.clone().or_else(|| detect_source(&url)),
                                &sanitized_path,
                                Some(format.clone()),
                                quality_display.clone().or_else(|| Some(quality.clone())),
                                &url,
                                current_title.clone(),
                                thumbnail.clone(),
                                history_id.clone(),
                                extract_time_range(&download_sections),
                                &download_kind,
                            );
                        }
                        return Err(error.to_wire_string());
                    }
                    CommandEvent::Terminated(status) => {
                        if CANCEL_FLAG.load(Ordering::SeqCst) {
                            add_log_internal(
                                "info",
                                "Download cancelled by user",
                                None,
                                Some(&url),
                            )
                            .ok();
                            return Err(
                                BackendError::from_message("Download cancelled").to_wire_string()
                            );
                        }

                        // Primary filepath source: read from --print-to-file temp file (UTF-8)
                        if let Ok(contents) = std::fs::read_to_string(&filepath_tmp) {
                            let path = contents.trim().to_string();
                            if !path.is_empty() {
                                final_filepath = Some(path);
                            }
                        }
                        std::fs::remove_file(&filepath_tmp).ok();

                        if status.code == Some(0) {
                            let actual_filesize = final_filepath
                                .as_ref()
                                .and_then(|fp| std::fs::metadata(fp).ok())
                                .map(|m| m.len());

                            let reported_filesize = actual_filesize.or_else(|| {
                                if let Some(last_size) = current_stream_size {
                                    Some(total_filesize + last_size)
                                } else if total_filesize > 0 {
                                    Some(total_filesize)
                                } else {
                                    None
                                }
                            });

                            let display_title = current_title.clone().or_else(|| {
                                final_filepath.as_ref().and_then(|path| {
                                    std::path::Path::new(path)
                                        .file_stem()
                                        .and_then(|s| s.to_str())
                                        .map(|s| s.to_string())
                                })
                            });

                            // Log success
                            let success_msg = format!(
                                "Downloaded: {}",
                                display_title
                                    .clone()
                                    .unwrap_or_else(|| "Unknown".to_string())
                            );
                            let details = format!(
                                "Size: {} · Quality: {} · Format: {}",
                                reported_filesize
                                    .map(format_size)
                                    .unwrap_or_else(|| "Unknown".to_string()),
                                quality_display.clone().unwrap_or_else(|| quality.clone()),
                                format.clone()
                            );
                            add_log_internal("success", &success_msg, Some(&details), Some(&url))
                                .ok();

                            // Save to history (update existing or create new)
                            let progress_history_id = if let Some(ref filepath) = final_filepath {
                                // Extract time range from download_sections (strip "*" prefix)
                                let time_range = extract_time_range(&download_sections);

                                if let Some(ref hist_id) = history_id {
                                    // Update existing history entry (re-download)
                                    update_history_download(
                                        hist_id.clone(),
                                        filepath.clone(),
                                        reported_filesize,
                                        quality_display.clone(),
                                        Some(format.clone()),
                                        time_range,
                                    )
                                    .ok();
                                    Some(hist_id.clone())
                                } else {
                                    // Create new history entry
                                    let src = source.clone().or_else(|| detect_source(&url));
                                    let thumb =
                                        thumbnail.clone().or_else(|| generate_thumbnail_url(&url));

                                    add_history_internal(
                                        url.clone(),
                                        display_title
                                            .clone()
                                            .unwrap_or_else(|| "Unknown".to_string()),
                                        thumb,
                                        filepath.clone(),
                                        reported_filesize,
                                        None,
                                        quality_display.clone(),
                                        Some(format.clone()),
                                        src,
                                        time_range,
                                    )
                                    .ok()
                                }
                            } else {
                                None
                            };

                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent: 100.0,
                                speed: String::new(),
                                eta: String::new(),
                                status: "finished".to_string(),
                                title: display_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: reported_filesize,
                                resolution: quality_display.clone(),
                                format_ext: Some(format.clone()),
                                error_message: None,
                                error_code: None,
                                error_params: None,
                                history_id: progress_history_id.clone(),
                                filepath: final_filepath.clone(),
                                downloaded_size: None,
                                elapsed_time: None,
                            };
                            app.emit("download-progress", progress).ok();
                            if let Some(ref filepath) = final_filepath {
                                run_completed_plugins(
                                    &app,
                                    &completed_workflow_steps,
                                    &id,
                                    source.clone().or_else(|| detect_source(&url)),
                                    filepath,
                                    reported_filesize,
                                    Some(format.clone()),
                                    quality_display.clone().or_else(|| Some(quality.clone())),
                                    &url,
                                    display_title.clone(),
                                    thumbnail.clone().or_else(|| generate_thumbnail_url(&url)),
                                    progress_history_id.clone(),
                                    extract_time_range(&download_sections),
                                    &download_kind,
                                )
                                .await;
                            }
                            return Ok(());
                        } else {
                            let recent_lines: Vec<String> = recent_output.iter().cloned().collect();
                            let error = build_download_error_message(status.code, &recent_lines);
                            add_log_internal("error", error.message(), None, Some(&url)).ok();

                            // Emit error progress so frontend can display error message
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent: 0.0,
                                speed: String::new(),
                                eta: String::new(),
                                status: "error".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                                error_message: Some(error.message().to_string()),
                                error_code: Some(error.code().to_string()),
                                error_params: error.params().cloned(),
                                history_id: None,
                                filepath: None,
                                downloaded_size: None,
                                elapsed_time: None,
                            };
                            app.emit("download-progress", progress).ok();

                            if emit_failed_workflow && !failed_workflow_steps.is_empty() {
                                let payload = build_trigger_payload(
                                    &id,
                                    source.clone().or_else(|| detect_source(&url)),
                                    "download.failed",
                                    &sanitized_path,
                                    None,
                                    Some(format.clone()),
                                    quality_display.clone().or_else(|| Some(quality.clone())),
                                    &url,
                                    current_title.clone(),
                                    thumbnail.clone(),
                                    history_id.clone(),
                                    extract_time_range(&download_sections),
                                    &download_kind,
                                );
                                let _ = enqueue_post_download_workflow(
                                    &app,
                                    failed_workflow_steps.clone(),
                                    payload,
                                );
                            }

                            return Err(error.to_wire_string());
                        }
                    }
                    _ => {}
                }
            }
            Ok(())
        }
        Err(_) => {
            if ytdlp_source == DependencySource::App {
                if emit_failed_workflow {
                    enqueue_failed_workflow(
                        &app,
                        &failed_workflow_steps,
                        &id,
                        trigger_source.clone(),
                        &sanitized_path,
                        Some(format.clone()),
                        Some(quality.clone()),
                        &url,
                        title.clone(),
                        thumbnail.clone(),
                        history_id.clone(),
                        trigger_time_range.clone(),
                        &download_kind,
                    );
                }
                return Err(BackendError::new(
                    crate::types::code::YTDLP_APP_NOT_FOUND,
                    "App-managed yt-dlp not found. Please install it from Settings > Dependencies.",
                )
                .with_retryable(false)
                .to_wire_string());
            }

            // Fallback to system yt-dlp
            let mut cmd = Command::new("yt-dlp");
            cmd.args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();

            let process = match cmd.spawn() {
                Ok(process) => process,
                Err(error) => {
                    if emit_failed_workflow {
                        enqueue_failed_workflow(
                            &app,
                            &failed_workflow_steps,
                            &id,
                            trigger_source,
                            &sanitized_path,
                            Some(format.clone()),
                            Some(quality.clone()),
                            &url,
                            title.clone(),
                            thumbnail.clone(),
                            history_id.clone(),
                            trigger_time_range,
                            &download_kind,
                        );
                    }
                    return Err(BackendError::from_message(format!(
                        "Failed to start yt-dlp: {}",
                        error
                    ))
                    .to_wire_string());
                }
            };

            enqueue_before_start_workflow(
                &app,
                &before_start_steps,
                &id,
                source.clone().or_else(|| detect_source(&url)),
                &sanitized_path,
                Some(format.clone()),
                Some(quality.clone()),
                &url,
                title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                extract_time_range(&download_sections),
                &download_kind,
            );

            handle_tokio_download(
                app,
                id,
                process,
                quality,
                format,
                url,
                should_log_stderr,
                title,
                thumbnail,
                source,
                download_sections,
                history_id.clone(),
                filepath_tmp,
                sanitized_path,
                completed_workflow_steps,
                failed_workflow_steps,
                emit_failed_workflow,
                download_kind,
            )
            .await
        }
    }
}

async fn handle_tokio_download(
    app: AppHandle,
    id: String,
    mut process: tokio::process::Child,
    quality: String,
    format: String,
    url: String,
    should_log_stderr: bool,
    title: Option<String>,
    thumbnail: Option<String>,
    source: Option<String>,
    download_sections: Option<String>,
    history_id: Option<String>,
    filepath_tmp: std::path::PathBuf,
    output_directory: String,
    completed_workflow_steps: Vec<PluginWorkflowStepSnapshot>,
    failed_workflow_steps: Vec<PluginWorkflowStepSnapshot>,
    emit_failed_workflow: bool,
    download_kind: String,
) -> Result<(), String> {
    let stdout = process
        .stdout
        .take()
        .ok_or_else(|| BackendError::from_message("Failed to get stdout").to_wire_string())?;
    let stderr = process.stderr.take();
    let mut stdout_reader = BufReader::new(stdout);

    // Only use frontend title if it's not a URL (placeholder)
    let mut current_title: Option<String> = title.filter(|t| !t.starts_with("http"));
    let mut current_index: Option<u32> = None;
    let mut total_count: Option<u32> = None;
    let mut total_filesize: u64 = 0;
    let mut current_stream_size: Option<u64> = None;
    let mut final_filepath: Option<String> = None;
    let recent_output = Arc::new(Mutex::new(VecDeque::new()));
    let stderr_filepath: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let quality_display = match quality.as_str() {
        "8k" => Some("8K".to_string()),
        "4k" => Some("4K".to_string()),
        "2k" => Some("2K".to_string()),
        "1080" => Some("1080p".to_string()),
        "720" => Some("720p".to_string()),
        "480" => Some("480p".to_string()),
        "360" => Some("360p".to_string()),
        "audio" => Some("Audio".to_string()),
        "best" => Some("Best".to_string()),
        _ => None,
    };

    // Spawn task to read stderr in parallel (for live stream progress)
    let stderr_app = app.clone();
    let stderr_id = id.clone();
    let stderr_url = url.clone();
    let stderr_recent_output = recent_output.clone();
    let stderr_fp_clone = stderr_filepath.clone();
    let stderr_task = if let Some(stderr_handle) = stderr {
        Some(tokio::spawn(async move {
            let mut stderr_reader = BufReader::new(stderr_handle);
            let mut line_buf = Vec::new();
            loop {
                line_buf.clear();
                match stderr_reader.read_until(b'\n', &mut line_buf).await {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(_) => break,
                }
                while line_buf.last().map_or(false, |&b| b == b'\n' || b == b'\r') {
                    line_buf.pop();
                }
                let line = decode_process_output(&line_buf);

                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    break;
                }
                push_recent_output_shared(&stderr_recent_output, &line);

                // On Windows, yt-dlp may print --print after_move:filepath to stderr.
                // Capture it here as a fallback in case stdout doesn't contain the path.
                let t = line.trim();
                if !t.is_empty()
                    && !t.starts_with('[')
                    && (t.ends_with(".mp4")
                        || t.ends_with(".mkv")
                        || t.ends_with(".mp3")
                        || t.ends_with(".m4a")
                        || t.ends_with(".opus")
                        || t.ends_with(".webm")
                        || t.ends_with(".flac")
                        || t.ends_with(".wav"))
                {
                    if let Ok(mut guard) = stderr_fp_clone.lock() {
                        *guard = Some(t.to_string());
                    }
                }

                // Capture audio filepath from [ExtractAudio] Destination lines in stderr
                // e.g. "[ExtractAudio] Destination: C:\Users\...\song.mp3"
                if line.contains("[ExtractAudio]") && line.contains("Destination:") {
                    if let Some(pos) = line.find("Destination:") {
                        let path = line[pos + "Destination:".len()..].trim();
                        if !path.is_empty() {
                            if let Ok(mut guard) = stderr_fp_clone.lock() {
                                *guard = Some(path.to_string());
                            }
                        }
                    }
                }

                // Parse progress from stderr (live streams output here)
                if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
                    parse_progress(&line)
                {
                    let progress = DownloadProgress {
                        id: stderr_id.clone(),
                        percent,
                        speed,
                        eta,
                        status: "downloading".to_string(),
                        title: None,
                        playlist_index: pi,
                        playlist_count: pc,
                        filesize: None,
                        resolution: None,
                        format_ext: None,
                        error_message: None,
                        error_code: None,
                        error_params: None,
                        history_id: None,
                        filepath: None,
                        downloaded_size,
                        elapsed_time,
                    };
                    stderr_app.emit("download-progress", progress).ok();
                }

                // Log stderr if enabled
                if should_log_stderr && !line.trim().is_empty() {
                    add_log_internal("stderr", line.trim(), None, Some(&stderr_url)).ok();
                }
            }
        }))
    } else {
        None
    };

    // Read stdout — use raw byte reading + decode_process_output to handle
    // non-UTF-8 encodings (e.g. GBK on Chinese Windows).
    let mut stdout_line_buf = Vec::new();
    loop {
        stdout_line_buf.clear();
        match stdout_reader.read_until(b'\n', &mut stdout_line_buf).await {
            Ok(0) => break, // EOF
            Ok(_) => {}
            Err(_) => break,
        }
        while stdout_line_buf
            .last()
            .map_or(false, |&b| b == b'\n' || b == b'\r')
        {
            stdout_line_buf.pop();
        }
        let line = decode_process_output(&stdout_line_buf);

        if CANCEL_FLAG.load(Ordering::SeqCst) {
            process.kill().await.ok();
            kill_all_download_processes();
            return Err(BackendError::from_message("Download cancelled").to_wire_string());
        }
        push_recent_output_shared(&recent_output, &line);

        // Parse progress and emit events
        if let Some((percent, speed, eta, pi, pc, downloaded_size, elapsed_time)) =
            parse_progress(&line)
        {
            if pi.is_some() {
                current_index = pi;
            }
            if pc.is_some() {
                total_count = pc;
            }

            let progress = DownloadProgress {
                id: id.clone(),
                percent,
                speed,
                eta,
                status: "downloading".to_string(),
                title: current_title.clone(),
                playlist_index: current_index,
                playlist_count: total_count,
                filesize: None,
                resolution: None,
                format_ext: None,
                error_message: None,
                error_code: None,
                error_params: None,
                history_id: None,
                filepath: None,
                downloaded_size,
                elapsed_time,
            };
            app.emit("download-progress", progress).ok();
        }

        // Extract title from [download] messages
        // Handles both: "Destination: /path/file.mp4" and "/path/file.mp4 has already been downloaded"
        if line.contains("[download]")
            && (line.contains("Destination:") || line.contains("has already been downloaded"))
        {
            let path_sep = if line.contains('\\') { '\\' } else { '/' };
            if let Some(start) = line.rfind(path_sep) {
                let filename = &line[start + 1..];
                // Remove suffix if present
                let filename = filename.trim_end_matches(" has already been downloaded");
                if let Some(end) = filename.rfind('.') {
                    current_title = Some(filename[..end].to_string());
                }
            }
        }

        // Capture final filepath
        let trimmed = line.trim();
        if !trimmed.is_empty()
            && !trimmed.starts_with('[')
            && (trimmed.ends_with(".mp3")
                || trimmed.ends_with(".m4a")
                || trimmed.ends_with(".opus")
                || trimmed.ends_with(".mp4")
                || trimmed.ends_with(".mkv")
                || trimmed.ends_with(".webm")
                || trimmed.ends_with(".flac")
                || trimmed.ends_with(".wav"))
        {
            final_filepath = Some(trimmed.to_string());
        }

        // Capture audio filepath from [ExtractAudio] Destination lines
        // e.g. "[ExtractAudio] Destination: C:\Users\...\song.mp3"
        if line.contains("[ExtractAudio]") && line.contains("Destination:") {
            if let Some(pos) = line.find("Destination:") {
                let path = line[pos + "Destination:".len()..].trim();
                if !path.is_empty() {
                    final_filepath = Some(path.to_string());
                }
            }
        }

        // Parse filesize
        if line.contains(" of ") && (line.contains("MiB") || line.contains("GiB")) {
            if let Some(re) = regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok() {
                if let Some(caps) = re.captures(&line) {
                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                        if let Ok(size) = num.as_str().parse::<f64>() {
                            let size_bytes = match unit.as_str() {
                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                "KiB" => (size * 1024.0) as u64,
                                _ => size as u64,
                            };
                            if current_stream_size != Some(size_bytes) {
                                if let Some(prev_size) = current_stream_size {
                                    total_filesize += prev_size;
                                }
                                current_stream_size = Some(size_bytes);
                            }
                        }
                    }
                }
            }
        }
    }

    // Wait for stderr task to finish reading all lines.
    if let Some(task) = stderr_task {
        let _ = tokio::time::timeout(std::time::Duration::from_secs(5), task).await;
    }

    // Wait for process to fully exit before reading the temp file.
    // yt-dlp writes --print-to-file after_move:filepath near process exit;
    // reading before wait() can race and miss the path.
    let status = match process.wait().await {
        Ok(status) => status,
        Err(error) => {
            if emit_failed_workflow {
                enqueue_failed_workflow(
                    &app,
                    &failed_workflow_steps,
                    &id,
                    source.clone().or_else(|| detect_source(&url)),
                    &output_directory,
                    Some(format.clone()),
                    quality_display.clone().or_else(|| Some(quality.clone())),
                    &url,
                    current_title.clone(),
                    thumbnail.clone(),
                    history_id.clone(),
                    extract_time_range(&download_sections),
                    &download_kind,
                );
            }
            return Err(
                BackendError::from_message(format!("Process error: {}", error)).to_wire_string(),
            );
        }
    };

    // Primary filepath source: read from the --print-to-file temp file (UTF-8).
    // This is reliable on all platforms, especially Windows with non-UTF-8 locales
    // where stdout encoding (GBK) corrupts Unicode characters in file paths.
    if let Ok(contents) = std::fs::read_to_string(&filepath_tmp) {
        let path = contents.trim().to_string();
        if !path.is_empty() {
            final_filepath = Some(path);
        }
    }
    // Clean up the temp file
    std::fs::remove_file(&filepath_tmp).ok();

    // Fallback: if the temp file didn't yield a filepath, try stdout/stderr captures
    if final_filepath.is_none() {
        if let Ok(guard) = stderr_filepath.lock() {
            if guard.is_some() {
                final_filepath = guard.clone();
            }
        }
    }

    if status.success() {
        let actual_filesize = final_filepath
            .as_ref()
            .and_then(|fp| std::fs::metadata(fp).ok())
            .map(|m| m.len());

        let reported_filesize = actual_filesize.or_else(|| {
            if let Some(last_size) = current_stream_size {
                Some(total_filesize + last_size)
            } else if total_filesize > 0 {
                Some(total_filesize)
            } else {
                None
            }
        });

        // Fallback: extract title from final_filepath if current_title is None
        let display_title = current_title.or_else(|| {
            final_filepath.as_ref().and_then(|path| {
                std::path::Path::new(path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string())
            })
        });

        let success_msg = format!(
            "Downloaded: {}",
            display_title
                .clone()
                .unwrap_or_else(|| "Unknown".to_string())
        );
        let details = format!(
            "Size: {} · Quality: {} · Format: {}",
            reported_filesize
                .map(format_size)
                .unwrap_or_else(|| "Unknown".to_string()),
            quality_display.clone().unwrap_or_else(|| quality.clone()),
            format.clone()
        );
        add_log_internal("success", &success_msg, Some(&details), Some(&url)).ok();

        // Save to history (update existing or create new)
        let progress_history_id = if let Some(ref filepath) = final_filepath {
            // Extract time range from download_sections (strip "*" prefix)
            let time_range = extract_time_range(&download_sections);

            if let Some(ref hist_id) = history_id {
                update_history_download(
                    hist_id.clone(),
                    filepath.clone(),
                    reported_filesize,
                    quality_display.clone(),
                    Some(format.clone()),
                    time_range,
                )
                .ok();
                Some(hist_id.clone())
            } else {
                let src = source.clone().or_else(|| detect_source(&url));
                let thumb = thumbnail.clone().or_else(|| generate_thumbnail_url(&url));

                add_history_internal(
                    url.clone(),
                    display_title
                        .clone()
                        .unwrap_or_else(|| "Unknown".to_string()),
                    thumb,
                    filepath.clone(),
                    reported_filesize,
                    None,
                    quality_display.clone(),
                    Some(format.clone()),
                    src,
                    time_range,
                )
                .ok()
            }
        } else {
            None
        };

        let progress = DownloadProgress {
            id: id.clone(),
            percent: 100.0,
            speed: String::new(),
            eta: String::new(),
            status: "finished".to_string(),
            title: display_title.clone(),
            playlist_index: current_index,
            playlist_count: total_count,
            filesize: reported_filesize,
            resolution: quality_display.clone(),
            format_ext: Some(format.clone()),
            error_message: None,
            error_code: None,
            error_params: None,
            history_id: progress_history_id.clone(),
            filepath: final_filepath.clone(),
            downloaded_size: None,
            elapsed_time: None,
        };
        app.emit("download-progress", progress).ok();
        if let Some(ref filepath) = final_filepath {
            run_completed_plugins(
                &app,
                &completed_workflow_steps,
                &id,
                source.clone().or_else(|| detect_source(&url)),
                filepath,
                reported_filesize,
                Some(format.clone()),
                quality_display.clone().or_else(|| Some(quality.clone())),
                &url,
                display_title.clone(),
                thumbnail.clone().or_else(|| generate_thumbnail_url(&url)),
                progress_history_id.clone(),
                extract_time_range(&download_sections),
                &download_kind,
            )
            .await;
        }
        Ok(())
    } else {
        let recent_lines = recent_output_snapshot(&recent_output);
        let error = build_download_error_message(status.code(), &recent_lines);
        add_log_internal("error", error.message(), None, Some(&url)).ok();

        // Emit error progress so frontend can display error message
        let progress = DownloadProgress {
            id: id.clone(),
            percent: 0.0,
            speed: String::new(),
            eta: String::new(),
            status: "error".to_string(),
            title: current_title.clone(),
            playlist_index: current_index,
            playlist_count: total_count,
            filesize: None,
            resolution: None,
            format_ext: None,
            error_message: Some(error.message().to_string()),
            error_code: Some(error.code().to_string()),
            error_params: error.params().cloned(),
            history_id: None,
            filepath: None,
            downloaded_size: None,
            elapsed_time: None,
        };
        app.emit("download-progress", progress).ok();

        if emit_failed_workflow && !failed_workflow_steps.is_empty() {
            let payload = build_trigger_payload(
                &id,
                source.clone().or_else(|| detect_source(&url)),
                "download.failed",
                &output_directory,
                None,
                Some(format.clone()),
                quality_display.clone().or_else(|| Some(quality.clone())),
                &url,
                current_title.clone(),
                thumbnail.clone(),
                history_id.clone(),
                extract_time_range(&download_sections),
                &download_kind,
            );
            let _ = enqueue_post_download_workflow(&app, failed_workflow_steps, payload);
        }

        Err(error.to_wire_string())
    }
}

#[tauri::command]
pub async fn stop_download() -> Result<(), String> {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    kill_all_download_processes();
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    kill_all_download_processes();
    Ok(())
}

fn detect_source(url: &str) -> Option<String> {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        Some("youtube".to_string())
    } else if url.contains("tiktok.com") {
        Some("tiktok".to_string())
    } else if url.contains("facebook.com") || url.contains("fb.watch") {
        Some("facebook".to_string())
    } else if url.contains("instagram.com") {
        Some("instagram".to_string())
    } else if url.contains("twitter.com") || url.contains("x.com") {
        Some("twitter".to_string())
    } else if url.contains("bilibili.com") || url.contains("b23.tv") {
        Some("bilibili".to_string())
    } else if url.contains("youku.com") {
        Some("youku".to_string())
    } else {
        Some("other".to_string())
    }
}

fn generate_thumbnail_url(url: &str) -> Option<String> {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        let video_id = if url.contains("v=") {
            url.split("v=").nth(1).and_then(|s| s.split('&').next())
        } else if url.contains("youtu.be/") {
            url.split("youtu.be/")
                .nth(1)
                .and_then(|s| s.split('?').next())
        } else {
            None
        };
        video_id.map(|id| format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", id))
    } else {
        None
    }
}
