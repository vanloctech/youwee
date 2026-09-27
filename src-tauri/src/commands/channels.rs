use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::database;
use crate::database::{BulkChannelMutationResult, BulkFollowChannelRecord};
use crate::services::{
    build_cookie_args, build_site_header_args, get_deno_path, get_ytdlp_path, run_ytdlp_with_stderr,
};
use crate::types::{
    ChannelInfo, ChannelVideo, CreatorProcessingSettings, FollowedChannel, PlaylistVideoEntry,
};
use crate::utils::CommandExt;
use crate::utils::{is_tiktok_url, normalize_channel_content_urls, normalize_url, validate_url};

static CHANNEL_FETCH_CANCEL_GENERATION: AtomicU32 = AtomicU32::new(0);
static POPULAR_CHANNEL_CACHE: OnceLock<
    Mutex<std::collections::HashMap<String, PopularCacheEntry>>,
> = OnceLock::new();
const POPULAR_CHANNEL_CACHE_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Clone)]
struct PopularCacheEntry {
    created_at: Instant,
    entries: Vec<PlaylistVideoEntry>,
}

fn popular_cache() -> &'static Mutex<std::collections::HashMap<String, PopularCacheEntry>> {
    POPULAR_CHANNEL_CACHE.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

fn get_cached_popular_entries(key: &str) -> Option<Vec<PlaylistVideoEntry>> {
    let mut cache = popular_cache().lock().ok()?;
    cache.retain(|_, entry| entry.created_at.elapsed() < POPULAR_CHANNEL_CACHE_TTL);
    cache.get(key).map(|entry| entry.entries.clone())
}

fn cache_popular_entries(key: String, entries: &[PlaylistVideoEntry]) {
    if let Ok(mut cache) = popular_cache().lock() {
        cache.insert(
            key,
            PopularCacheEntry {
                created_at: Instant::now(),
                entries: entries.to_vec(),
            },
        );
    }
}

fn sort_and_page_popular(
    mut entries: Vec<PlaylistVideoEntry>,
    start: Option<u32>,
    limit: Option<u32>,
) -> Vec<PlaylistVideoEntry> {
    entries.sort_by(|left, right| {
        right
            .view_count
            .unwrap_or(0)
            .cmp(&left.view_count.unwrap_or(0))
            .then_with(|| right.upload_date.cmp(&left.upload_date))
            .then_with(|| left.id.cmp(&right.id))
    });
    let offset = start.unwrap_or(1).saturating_sub(1) as usize;
    let take = limit.unwrap_or(u32::MAX) as usize;
    entries.into_iter().skip(offset).take(take).collect()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingChannelBatch {
    pub channel_url: String,
    pub channel_name: Option<String>,
    pub content_type: String,
    pub videos: Vec<PlaylistVideoEntry>,
}

#[tauri::command]
pub fn save_channel_batch_items(
    channel_url: String,
    channel_name: Option<String>,
    content_type: String,
    videos: Vec<PlaylistVideoEntry>,
) -> Result<(), String> {
    let mut conn = database::get_db()?;
    let transaction = conn.transaction().map_err(|e| e.to_string())?;
    // The UI supports one active manual channel batch. Replacing it here prevents
    // abandoned batches from different channels being mixed after a restart.
    transaction
        .execute("DELETE FROM channel_batch_items", [])
        .map_err(|e| e.to_string())?;
    for video in videos {
        let json = serde_json::to_string(&video).map_err(|e| e.to_string())?;
        transaction.execute(
            "INSERT OR IGNORE INTO channel_batch_items (channel_url, video_id, channel_name, content_type, video_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![channel_url, video.id, channel_name, content_type, json, chrono::Utc::now().to_rfc3339()],
        ).map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_channel_batch_item_status(
    channel_url: String,
    video_id: String,
    status: String,
) -> Result<(), String> {
    if !["pending", "running", "failed"].contains(&status.as_str()) {
        return Err("Invalid channel batch item status".to_string());
    }
    let conn = database::get_db()?;
    conn.execute(
        "UPDATE channel_batch_items SET status = ?1 WHERE channel_url = ?2 AND video_id = ?3",
        rusqlite::params![status, channel_url, video_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn complete_channel_batch_item(channel_url: String, video_id: String) -> Result<(), String> {
    let conn = database::get_db()?;
    conn.execute(
        "DELETE FROM channel_batch_items WHERE channel_url = ?1 AND video_id = ?2",
        rusqlite::params![channel_url, video_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn discard_channel_batch(channel_url: Option<String>) -> Result<u64, String> {
    let conn = database::get_db()?;
    let deleted = match channel_url {
        Some(url) => conn.execute(
            "DELETE FROM channel_batch_items WHERE channel_url = ?1",
            rusqlite::params![url],
        ),
        None => conn.execute("DELETE FROM channel_batch_items", []),
    }
    .map_err(|e| e.to_string())?;
    Ok(deleted as u64)
}

#[tauri::command]
pub fn list_pending_channel_batch() -> Result<Option<PendingChannelBatch>, String> {
    let conn = database::get_db()?;
    let mut statement = conn.prepare(
        "SELECT channel_url, channel_name, content_type, video_json
         FROM channel_batch_items WHERE status IN ('pending', 'running') ORDER BY created_at, rowid"
    ).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut batch: Option<PendingChannelBatch> = None;
    for row in rows {
        let (url, name, content_type, json) = row.map_err(|e| e.to_string())?;
        if batch.as_ref().is_some_and(|item| item.channel_url != url) {
            break;
        }
        let video = serde_json::from_str::<PlaylistVideoEntry>(&json).map_err(|e| e.to_string())?;
        batch
            .get_or_insert_with(|| PendingChannelBatch {
                channel_url: url,
                channel_name: name,
                content_type,
                videos: Vec::new(),
            })
            .videos
            .push(video);
    }
    Ok(batch)
}

fn current_channel_fetch_generation() -> u32 {
    CHANNEL_FETCH_CANCEL_GENERATION.load(Ordering::SeqCst)
}

fn is_channel_fetch_cancelled(generation: u32) -> bool {
    CHANNEL_FETCH_CANCEL_GENERATION.load(Ordering::SeqCst) != generation
}

#[tauri::command]
pub fn stop_channel_fetch() {
    CHANNEL_FETCH_CANCEL_GENERATION.fetch_add(1, Ordering::SeqCst);
}

fn sanitize_youtube_content_type(value: Option<&str>) -> String {
    match value {
        Some("shorts") => "shorts".to_string(),
        Some("streams") => "streams".to_string(),
        Some("videos_shorts") => "videos_shorts".to_string(),
        _ => "videos".to_string(),
    }
}

fn sanitize_preferred_fps(value: Option<&str>) -> String {
    match value {
        Some("30") => "30".to_string(),
        _ => "original".to_string(),
    }
}

fn sanitize_creator_processing(
    value: Option<CreatorProcessingSettings>,
) -> CreatorProcessingSettings {
    let mut settings = value.unwrap_or_default();
    settings.mode = match settings.mode.as_str() {
        "duet" => "duet".to_string(),
        "portrait" => "portrait".to_string(),
        "parts" => "parts".to_string(),
        _ => "none".to_string(),
    };
    settings.split_by = if settings.split_by == "count" {
        "count".to_string()
    } else {
        "duration".to_string()
    };
    settings.encoder = match settings.encoder.as_str() {
        "h264_nvenc" => "h264_nvenc".to_string(),
        "h264_qsv" => "h264_qsv".to_string(),
        "h264_amf" => "h264_amf".to_string(),
        _ => "libx264".to_string(),
    };
    settings.part_seconds = settings.part_seconds.clamp(1, 86_400);
    settings.part_count = settings.part_count.clamp(1, 100);
    settings
}

/// Build a fallback video URL based on the channel's platform.
/// Used when yt-dlp doesn't return a `url` or `webpage_url` field.
fn build_fallback_video_url(channel_url: &str, video_id: &str) -> String {
    if is_tiktok_url(channel_url) {
        format!("https://www.tiktok.com/@_/video/{}", video_id)
    } else if channel_url.contains("bilibili.com") || channel_url.contains("b23.tv") {
        format!("https://www.bilibili.com/video/{}", video_id)
    } else if channel_url.contains("youku.com") {
        format!("https://v.youku.com/v_show/id_{}.html", video_id)
    } else {
        // Default to YouTube
        format!("https://www.youtube.com/watch?v={}", video_id)
    }
}

async fn run_channel_ytdlp_with_progress(
    app: &AppHandle,
    args: &[&str],
    request_id: Option<u32>,
    limit: Option<u32>,
    cancel_generation: u32,
) -> Result<String, String> {
    if is_channel_fetch_cancelled(cancel_generation) {
        return Err("Channel fetch cancelled".to_string());
    }

    if let Some((binary_path, _)) = get_ytdlp_path(app).await {
        let mut cmd = Command::new(binary_path);
        cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());
        cmd.hide_window();

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture yt-dlp stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture yt-dlp stderr".to_string())?;

        let app_for_progress = app.clone();
        let stdout_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            let mut output = String::new();
            let mut fetched_count = 0_u32;

            while let Some(line) = reader.next_line().await? {
                if !line.trim().is_empty() {
                    fetched_count = fetched_count.saturating_add(1);
                    let _ = app_for_progress.emit(
                        "channel-fetch-progress",
                        serde_json::json!({
                            "requestId": request_id,
                            "fetched": fetched_count,
                            "limit": limit
                        }),
                    );
                }
                output.push_str(&line);
                output.push('\n');
            }

            Ok::<String, std::io::Error>(output)
        });

        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            let mut output = String::new();

            while let Some(line) = reader.next_line().await? {
                output.push_str(&line);
                output.push('\n');
            }

            Ok::<String, std::io::Error>(output)
        });

        let status = loop {
            tokio::select! {
                status = child.wait() => {
                    break status.map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(150)) => {
                    if is_channel_fetch_cancelled(cancel_generation) {
                        child.kill().await.ok();
                        let _ = child.wait().await;
                        let _ = stdout_task.await;
                        let _ = stderr_task.await;
                        return Err("Channel fetch cancelled".to_string());
                    }
                }
            }
        };
        let stdout = stdout_task
            .await
            .map_err(|e| format!("Failed to read yt-dlp stdout: {}", e))?
            .map_err(|e| format!("Failed to read yt-dlp stdout: {}", e))?;
        let stderr = stderr_task
            .await
            .map_err(|e| format!("Failed to read yt-dlp stderr: {}", e))?
            .map_err(|e| format!("Failed to read yt-dlp stderr: {}", e))?;

        if !status.success() && stdout.is_empty() {
            let detail = stderr
                .lines()
                .rev()
                .find(|l| !l.trim().is_empty())
                .unwrap_or("yt-dlp exited with error");
            return Err(format!("Failed to fetch channel videos: {}", detail));
        }

        return Ok(stdout);
    }

    if is_channel_fetch_cancelled(cancel_generation) {
        return Err("Channel fetch cancelled".to_string());
    }

    let output_result = run_ytdlp_with_stderr(app, args).await?;
    if is_channel_fetch_cancelled(cancel_generation) {
        return Err("Channel fetch cancelled".to_string());
    }

    if !output_result.success && output_result.stdout.is_empty() {
        let detail = output_result
            .stderr
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("yt-dlp exited with error");
        return Err(format!("Failed to fetch channel videos: {}", detail));
    }

    Ok(output_result.stdout)
}

/// Get videos from a channel URL (uses yt-dlp, supports YouTube/Bilibili/etc.)
#[tauri::command]
pub async fn get_channel_videos(
    app: AppHandle,
    url: String,
    limit: Option<u32>,
    start: Option<u32>,
    request_id: Option<u32>,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
    youtube_content_type: Option<String>,
    scan_order: Option<String>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    validate_url(&url)?;
    let cancel_generation = current_channel_fetch_generation();
    let youtube_content_type = sanitize_youtube_content_type(youtube_content_type.as_deref());
    let urls = normalize_channel_content_urls(&url, Some(&youtube_content_type));
    let popular_requested = scan_order.as_deref() == Some("popular");

    let is_youtube = urls
        .iter()
        .any(|url| url.contains("youtube.com") || url.contains("youtu.be"));
    let supports_exact_popular = urls
        .iter()
        .all(|url| url.contains("youtube.com") || url.contains("youtu.be") || is_tiktok_url(url));
    let exact_popular = popular_requested && supports_exact_popular;
    let popular_cache_key = urls.join("\n");
    if exact_popular {
        if let Some(entries) = get_cached_popular_entries(&popular_cache_key) {
            return Ok(sort_and_page_popular(entries, start, limit));
        }
    }
    let max_attempts = if is_youtube { 1 } else { 2 };

    let mut last_error = String::new();

    for attempt in 0..max_attempts {
        if attempt > 0 {
            // Wait before retry
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        let mut entries = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();
        let mut errors = Vec::new();

        for source_url in &urls {
            if is_channel_fetch_cancelled(cancel_generation) {
                return Err("Channel fetch cancelled".to_string());
            }

            match fetch_channel_videos_once(
                &app,
                source_url,
                if exact_popular { None } else { limit },
                if exact_popular { None } else { start },
                request_id,
                cancel_generation,
                cookie_mode.as_deref(),
                cookie_browser.as_deref(),
                cookie_browser_profile.as_deref(),
                cookie_file_path.as_deref(),
                cookie_skip_patterns.as_deref(),
                proxy_url.as_deref(),
            )
            .await
            {
                Ok(source_entries) => {
                    for entry in source_entries {
                        if seen_ids.insert(entry.id.clone()) {
                            entries.push(entry);
                        }
                    }
                }
                Err(e) => errors.push(e),
            }
        }

        if !entries.is_empty() {
            if exact_popular {
                cache_popular_entries(popular_cache_key.clone(), &entries);
                return Ok(sort_and_page_popular(entries, start, limit));
            }
            return Ok(entries);
        }

        // A paged request past the end of a channel is a normal end-of-list.
        if start.unwrap_or(1) > 1 && errors.is_empty() {
            return Ok(Vec::new());
        }

        last_error = if errors.is_empty() {
            "No videos found in channel".to_string()
        } else {
            errors.join("; ")
        };

        // Only retry for non-YouTube (Bilibili rate-limiting)
        if is_youtube {
            break;
        }
    }

    Err(last_error)
}

/// Inner function: single attempt to fetch channel videos via yt-dlp
async fn fetch_channel_videos_once(
    app: &AppHandle,
    url: &str,
    limit: Option<u32>,
    start: Option<u32>,
    request_id: Option<u32>,
    cancel_generation: u32,
    cookie_mode: Option<&str>,
    cookie_browser: Option<&str>,
    cookie_browser_profile: Option<&str>,
    cookie_file_path: Option<&str>,
    cookie_skip_patterns: Option<&[String]>,
    proxy_url: Option<&str>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    let is_youtube = url.contains("youtube.com") || url.contains("youtu.be");
    let use_flat_playlist = is_youtube || is_tiktok_url(url);
    let mut args = vec![
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "30".to_string(),
    ];

    // TikTok's user extractor still includes title, thumbnail, and duration in
    // flat entries, avoiding a second request for every video in large profiles.
    if use_flat_playlist {
        args.push("--flat-playlist".to_string());
    }

    if let Some(start) = start.filter(|start| *start > 1) {
        args.push("--playlist-start".to_string());
        args.push(start.to_string());
    }

    if let Some(effective_limit) = limit.filter(|limit| *limit > 0) {
        let playlist_end = start
            .filter(|start| *start > 1)
            .map(|start| start.saturating_add(effective_limit).saturating_sub(1))
            .unwrap_or(effective_limit);
        args.push("--playlist-end".to_string());
        args.push(playlist_end.to_string());
    }

    // Add Deno runtime for YouTube
    if is_youtube {
        if let Some(deno_path) = get_deno_path(app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.extend(build_site_header_args(url));

    // Add cookie args
    let cookie_args = build_cookie_args(
        url,
        cookie_mode,
        cookie_browser,
        cookie_browser_profile,
        cookie_file_path,
        cookie_skip_patterns,
    );
    args.extend(cookie_args);

    // Add proxy args
    if let Some(proxy) = proxy_url {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.to_string());
        }
    }

    args.push("--".to_string());
    args.push(url.to_string());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output =
        run_channel_ytdlp_with_progress(app, &args_ref, request_id, limit, cancel_generation)
            .await?;

    let fetched_count = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32;
    let _ = app.emit(
        "channel-fetch-progress",
        serde_json::json!({
            "requestId": request_id,
            "fetched": fetched_count,
            "limit": limit
        }),
    );

    let mut entries: Vec<PlaylistVideoEntry> = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if id.is_empty() {
                continue;
            }

            let extracted_title = json
                .get("title")
                .or_else(|| json.get("fulltitle"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            // TikTok sometimes exposes a synthetic title ("TikTok video #<id>")
            // while keeping the creator caption in `description`. The caption is
            // what the channel browser shows and what creator processing should
            // burn into the edited video.
            let synthetic_tiktok_title = is_tiktok_url(url)
                && (extracted_title.is_empty()
                    || extracted_title.eq_ignore_ascii_case("unknown")
                    || extracted_title
                        .to_ascii_lowercase()
                        .starts_with("tiktok video #"));
            let title = if synthetic_tiktok_title {
                json.get("description")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(extracted_title)
            } else {
                extracted_title
            };
            let title = if title.is_empty() { "Unknown" } else { title }.to_string();
            let video_url = json
                .get("webpage_url")
                .or_else(|| json.get("url"))
                .and_then(|v| v.as_str())
                .filter(|candidate| {
                    candidate.starts_with("http://") || candidate.starts_with("https://")
                })
                .map(|s| s.to_string())
                .unwrap_or_else(|| build_fallback_video_url(url, &id));

            let thumbnail = json
                .get("thumbnail")
                .or_else(|| {
                    json.get("thumbnails")
                        .and_then(|t| t.as_array())
                        .and_then(|arr| arr.first())
                })
                .and_then(|v| {
                    if v.is_string() {
                        v.as_str().map(|s| s.to_string())
                    } else {
                        v.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
                    }
                })
                // Bilibili thumbnails use http:// which gets blocked as mixed content
                .map(|u| u.replace("http://", "https://"));

            let duration = json.get("duration").and_then(|v| v.as_f64());
            let channel = json
                .get("channel")
                .or_else(|| json.get("uploader"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let upload_date = json
                .get("upload_date")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let view_count = json.get("view_count").and_then(|v| v.as_u64());

            entries.push(PlaylistVideoEntry {
                id,
                title,
                url: video_url,
                thumbnail,
                duration,
                channel,
                upload_date,
                playlist_title: None,
                view_count,
            });
        }
    }

    if entries.is_empty() && start.unwrap_or(1) <= 1 {
        return Err("No videos found in channel".to_string());
    }

    Ok(entries)
}

/// Extract Bilibili UID from a URL (e.g. space.bilibili.com/12345 → Some("12345"))
fn extract_bilibili_uid(url: &str) -> Option<String> {
    if let Ok(parsed) = reqwest::Url::parse(url) {
        let host = parsed.host_str().unwrap_or("");
        if host == "space.bilibili.com" || host == "www.space.bilibili.com" {
            // Path is like /12345 or /12345/video
            let segments: Vec<&str> = parsed.path().trim_matches('/').split('/').collect();
            if let Some(uid) = segments.first() {
                if uid.chars().all(|c| c.is_ascii_digit()) && !uid.is_empty() {
                    return Some(uid.to_string());
                }
            }
        }
    }
    None
}

/// Fetch Bilibili channel info directly from Bilibili API (name + avatar).
/// Uses /x/web-interface/card which does NOT require WBI signing.
/// Returns (name, avatar_url) or None if the API call fails.
async fn fetch_bilibili_channel_info(uid: &str) -> Option<(String, Option<String>)> {
    let api_url = format!("https://api.bilibili.com/x/web-interface/card?mid={}", uid);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .ok()?;

    let resp = client
        .get(&api_url)
        .header("Referer", "https://www.bilibili.com/")
        .send()
        .await
        .ok()?;

    let json: serde_json::Value = resp.json().await.ok()?;

    // Response: { "code": 0, "data": { "card": { "name": "...", "face": "https://..." } } }
    if json.get("code").and_then(|v| v.as_i64()) != Some(0) {
        return None;
    }

    let card = json.get("data")?.get("card")?;
    let name = card.get("name").and_then(|v| v.as_str())?.to_string();
    let face = card
        .get("face")
        .and_then(|v| v.as_str())
        .map(|s| s.replace("http://", "https://"));

    Some((name, face))
}

/// Get channel metadata (name + avatar) using yt-dlp -J
#[tauri::command]
pub async fn get_channel_info(
    app: AppHandle,
    url: String,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
    youtube_content_type: Option<String>,
) -> Result<ChannelInfo, String> {
    validate_url(&url)?;
    let cancel_generation = current_channel_fetch_generation();
    let youtube_content_type = sanitize_youtube_content_type(youtube_content_type.as_deref());
    let url = normalize_channel_content_urls(&url, Some(&youtube_content_type))
        .into_iter()
        .next()
        .unwrap_or_else(|| normalize_url(&url));

    // For Bilibili URLs, try the native API first (accurate name + avatar).
    // This avoids spawning a second yt-dlp process that could trigger rate-limiting.
    let is_bilibili = url.contains("bilibili.com") || url.contains("b23.tv");
    if is_bilibili {
        if let Some(uid) = extract_bilibili_uid(&url) {
            if let Some((name, avatar_url)) = fetch_bilibili_channel_info(&uid).await {
                return Ok(ChannelInfo { name, avatar_url });
            }
        }
    }

    let is_youtube = url.contains("youtube.com") || url.contains("youtu.be");

    let mut args = vec![
        "-J".to_string(),
        "--playlist-items".to_string(),
        "1".to_string(),
        "--no-download".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "30".to_string(),
    ];

    // TikTok flat entries include creator and cover metadata without resolving
    // every video page just to display the profile.
    if is_youtube || is_tiktok_url(&url) {
        args.push("--flat-playlist".to_string());
    }

    // Add Deno runtime for YouTube
    if is_youtube {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.extend(build_site_header_args(&url));

    // Add cookie args
    let cookie_args = build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    );
    args.extend(cookie_args);

    // Add proxy args
    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    args.push("--".to_string());
    args.push(url.clone());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = run_channel_ytdlp_with_progress(&app, &args_ref, None, None, cancel_generation)
        .await
        .map_err(|_| "Failed to fetch channel info".to_string())?;

    // Parse top-level JSON (channel/playlist metadata)
    let json: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse channel info: {}", e))?;

    // For non-flat-playlist output, data may be inside entries[0]
    let first_entry = json
        .get("entries")
        .and_then(|e| e.as_array())
        .and_then(|arr| arr.first());

    // Extract channel name: top-level → entries[0] → fallback
    let name = json
        .get("channel")
        .or_else(|| json.get("uploader"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        // Fallback: look inside entries[0]
        .or_else(|| {
            first_entry.and_then(|entry| {
                entry
                    .get("channel")
                    .or_else(|| entry.get("uploader"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
            })
        })
        // Last resort: top-level title
        .or_else(|| {
            json.get("title")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or("Channel")
        .to_string();

    // Extract avatar URL from thumbnails array
    // YouTube-specific: "avatar_uncropped" > 900x900 > yt3.googleusercontent.com
    // Generic fallback: largest thumbnail or first available
    let avatar_url = json
        .get("thumbnails")
        .and_then(|t| t.as_array())
        .and_then(|thumbnails| {
            // First: look for avatar_uncropped (YouTube)
            if let Some(avatar) = thumbnails
                .iter()
                .find(|t| t.get("id").and_then(|v| v.as_str()) == Some("avatar_uncropped"))
            {
                return avatar
                    .get("url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }

            // Second: look for 900x900 (YouTube channel avatar)
            if let Some(avatar) = thumbnails.iter().find(|t| {
                t.get("width").and_then(|v| v.as_i64()) == Some(900)
                    && t.get("height").and_then(|v| v.as_i64()) == Some(900)
            }) {
                return avatar
                    .get("url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }

            // Third: look for any yt3.googleusercontent.com URL (YouTube avatar host)
            for t in thumbnails.iter().rev() {
                if let Some(url) = t.get("url").and_then(|v| v.as_str()) {
                    if url.contains("yt3.googleusercontent.com") && !url.contains("fcrop64") {
                        return Some(url.to_string());
                    }
                }
            }

            // Generic fallback: pick the largest thumbnail by width, or the last one
            let best = thumbnails
                .iter()
                .filter_map(|t| {
                    let url = t.get("url").and_then(|v| v.as_str())?;
                    let w = t.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
                    Some((url, w))
                })
                .max_by_key(|(_, w)| *w);
            best.map(|(url, _)| url.to_string())
        })
        // Fallback: try entries[0] thumbnails (for non-flat-playlist output)
        .or_else(|| {
            first_entry
                .and_then(|entry| entry.get("thumbnails"))
                .and_then(|t| t.as_array())
                .and_then(|thumbnails| {
                    let best = thumbnails
                        .iter()
                        .filter_map(|t| {
                            let url = t.get("url").and_then(|v| v.as_str())?;
                            let w = t.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
                            Some((url, w))
                        })
                        .max_by_key(|(_, w)| *w);
                    best.map(|(url, _)| url.to_string())
                })
        })
        // Also check top-level "thumbnail" field
        .or_else(|| {
            json.get("thumbnail")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        // Check entries[0] "thumbnail" field
        .or_else(|| {
            first_entry
                .and_then(|entry| entry.get("thumbnail"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        // Normalize http:// to https:// (Bilibili CDN uses http:// by default)
        .map(|u| u.replace("http://", "https://"));

    Ok(ChannelInfo { name, avatar_url })
}

/// Follow a channel
#[tauri::command]
pub async fn follow_channel(
    app: AppHandle,
    url: String,
    name: String,
    thumbnail: Option<String>,
    platform: Option<String>,
    download_quality: Option<String>,
    download_format: Option<String>,
    download_video_codec: Option<String>,
    download_preferred_fps: Option<String>,
    download_audio_bitrate: Option<String>,
    youtube_content_type: Option<String>,
    creator_processing: Option<CreatorProcessingSettings>,
) -> Result<String, String> {
    let platform = platform.unwrap_or_else(|| "youtube".to_string());
    let download_quality = download_quality.unwrap_or_else(|| "best".to_string());
    let download_format = download_format.unwrap_or_else(|| "mp4".to_string());
    let download_video_codec = download_video_codec.unwrap_or_else(|| "h264".to_string());
    let download_preferred_fps = sanitize_preferred_fps(download_preferred_fps.as_deref());
    let download_audio_bitrate = download_audio_bitrate.unwrap_or_else(|| "192".to_string());
    let youtube_content_type = match platform.as_str() {
        "youtube" => sanitize_youtube_content_type(youtube_content_type.as_deref()),
        "tiktok" => youtube_content_type
            .as_deref()
            .map(|value| sanitize_youtube_content_type(Some(value)))
            .unwrap_or_else(|| "videos_shorts".to_string()),
        _ => "videos".to_string(),
    };
    let id = database::follow_channel_db(
        url,
        name,
        thumbnail,
        platform,
        download_quality,
        download_format,
        download_video_codec,
        download_audio_bitrate,
        download_preferred_fps,
        youtube_content_type,
        sanitize_creator_processing(creator_processing),
    )?;
    tauri::async_runtime::spawn(async move {
        crate::services::youtube_websub::refresh_subscriptions(&app).await;
    });
    Ok(id)
}

/// Unfollow a channel
#[tauri::command]
pub async fn unfollow_channel(app: AppHandle, id: String) -> Result<(), String> {
    database::unfollow_channel_db(id)?;
    tauri::async_runtime::spawn(async move {
        crate::services::youtube_websub::refresh_subscriptions(&app).await;
    });
    Ok(())
}

fn bulk_channel_platform(url: &str) -> String {
    let host = reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_ascii_lowercase))
        .unwrap_or_default();
    if host == "tiktok.com" || host.ends_with(".tiktok.com") {
        "tiktok".to_string()
    } else if host == "bilibili.com" || host.ends_with(".bilibili.com") || host == "b23.tv" {
        "bilibili".to_string()
    } else if host == "youku.com" || host.ends_with(".youku.com") {
        "youku".to_string()
    } else if host == "youtube.com" || host.ends_with(".youtube.com") || host == "youtu.be" {
        "youtube".to_string()
    } else {
        "other".to_string()
    }
}

fn bulk_channel_name(url: &str) -> String {
    let fallback = reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(ToString::to_string))
        .unwrap_or_else(|| "Channel".to_string());
    let Some(parsed) = reqwest::Url::parse(url).ok() else {
        return fallback;
    };
    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|segments| segments.filter(|segment| !segment.is_empty()).collect())
        .unwrap_or_default();
    segments
        .iter()
        .rev()
        .find(|segment| {
            !matches!(
                segment.to_ascii_lowercase().as_str(),
                "videos" | "shorts" | "streams"
            )
        })
        .map(|segment| {
            if segment.starts_with('@') {
                (*segment).to_string()
            } else {
                segment.to_string()
            }
        })
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback)
}

/// Follow a large list of channel URLs in one transaction. Metadata is filled
/// from the URL immediately; the normal channel refresh can enrich avatars and
/// display names afterwards without blocking the bulk operation.
#[tauri::command]
pub async fn bulk_follow_channels(
    app: AppHandle,
    urls: Vec<String>,
    download_quality: Option<String>,
    download_format: Option<String>,
    download_video_codec: Option<String>,
    download_preferred_fps: Option<String>,
    download_audio_bitrate: Option<String>,
    youtube_content_type: Option<String>,
    creator_processing: Option<CreatorProcessingSettings>,
) -> Result<BulkChannelMutationResult, String> {
    let quality = download_quality.unwrap_or_else(|| "best".to_string());
    let format = download_format.unwrap_or_else(|| "mp4".to_string());
    let video_codec = download_video_codec.unwrap_or_else(|| "h264".to_string());
    let preferred_fps = sanitize_preferred_fps(download_preferred_fps.as_deref());
    let audio_bitrate = download_audio_bitrate.unwrap_or_else(|| "192".to_string());
    let creator_processing = sanitize_creator_processing(creator_processing);
    let mut records = Vec::with_capacity(urls.len());

    for raw_url in urls {
        let url = normalize_url(raw_url.trim());
        if let Err(error) = validate_url(&url) {
            return Err(error);
        }
        let platform = bulk_channel_platform(&url);
        let content_type = match platform.as_str() {
            "youtube" => sanitize_youtube_content_type(youtube_content_type.as_deref()),
            "tiktok" => youtube_content_type
                .as_deref()
                .map(|value| sanitize_youtube_content_type(Some(value)))
                .unwrap_or_else(|| "videos_shorts".to_string()),
            _ => "videos".to_string(),
        };
        records.push(BulkFollowChannelRecord {
            name: bulk_channel_name(&url),
            url,
            thumbnail: None,
            platform,
            download_quality: quality.clone(),
            download_format: format.clone(),
            download_video_codec: video_codec.clone(),
            download_audio_bitrate: audio_bitrate.clone(),
            download_preferred_fps: preferred_fps.clone(),
            youtube_content_type: content_type,
            creator_processing: creator_processing.clone(),
        });
    }

    let result = database::bulk_follow_channels_db(records)?;
    tauri::async_runtime::spawn(async move {
        crate::services::youtube_websub::refresh_subscriptions(&app).await;
    });
    Ok(result)
}

/// Unfollow a large list of channel IDs in one transaction.
#[tauri::command]
pub async fn bulk_unfollow_channels(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<BulkChannelMutationResult, String> {
    let result = database::bulk_unfollow_channels_db(ids)?;
    tauri::async_runtime::spawn(async move {
        crate::services::youtube_websub::refresh_subscriptions(&app).await;
    });
    Ok(result)
}

#[tauri::command]
pub async fn bulk_update_channel_settings(
    ids: Vec<String>,
    check_interval: i64,
    auto_download: bool,
    download_quality: String,
    download_format: String,
    download_video_codec: String,
    download_preferred_fps: Option<String>,
    download_audio_bitrate: String,
    download_threads: i64,
    youtube_content_type: Option<String>,
    creator_processing: Option<CreatorProcessingSettings>,
) -> Result<BulkChannelMutationResult, String> {
    database::bulk_update_channel_settings_db(
        ids,
        check_interval.max(1),
        auto_download,
        download_quality,
        download_format,
        download_video_codec,
        download_audio_bitrate,
        sanitize_preferred_fps(download_preferred_fps.as_deref()),
        download_threads.max(1),
        sanitize_youtube_content_type(youtube_content_type.as_deref()),
        sanitize_creator_processing(creator_processing),
    )
}

#[tauri::command]
pub async fn bulk_update_channel_creator_processing(
    ids: Vec<String>,
    creator_processing: Option<CreatorProcessingSettings>,
) -> Result<BulkChannelMutationResult, String> {
    database::bulk_update_channel_creator_processing_db(
        ids,
        sanitize_creator_processing(creator_processing),
    )
}

/// Get all followed channels
#[tauri::command]
pub async fn get_followed_channels() -> Result<Vec<FollowedChannel>, String> {
    database::get_followed_channels_db()
}

/// Update channel settings
#[tauri::command]
pub async fn update_channel_settings(
    id: String,
    check_interval: i64,
    auto_download: bool,
    download_quality: String,
    download_format: String,
    download_video_codec: Option<String>,
    download_preferred_fps: Option<String>,
    download_audio_bitrate: Option<String>,
    filter_min_duration: Option<i64>,
    filter_max_duration: Option<i64>,
    filter_include_keywords: Option<String>,
    filter_exclude_keywords: Option<String>,
    filter_max_videos: Option<i64>,
    download_threads: Option<i64>,
    youtube_content_type: Option<String>,
    creator_processing: Option<CreatorProcessingSettings>,
) -> Result<(), String> {
    database::update_channel_settings_db(
        id,
        check_interval,
        auto_download,
        download_quality,
        download_format,
        download_video_codec.unwrap_or_else(|| "h264".to_string()),
        download_audio_bitrate.unwrap_or_else(|| "192".to_string()),
        sanitize_preferred_fps(download_preferred_fps.as_deref()),
        filter_min_duration,
        filter_max_duration,
        filter_include_keywords,
        filter_exclude_keywords,
        filter_max_videos,
        download_threads.unwrap_or(3),
        sanitize_youtube_content_type(youtube_content_type.as_deref()),
        sanitize_creator_processing(creator_processing),
    )
}

/// Save videos for a channel (from fetch results)
#[tauri::command]
pub async fn save_channel_videos(
    channel_id: String,
    videos: Vec<ChannelVideo>,
) -> Result<usize, String> {
    database::save_channel_videos_db(channel_id, videos)
}

/// Get videos for a channel from DB
#[tauri::command]
pub async fn get_saved_channel_videos(
    channel_id: String,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ChannelVideo>, String> {
    database::get_channel_videos_db(channel_id, status, limit)
}

/// Get channel videos from DB by exact video IDs
#[tauri::command]
pub async fn get_saved_channel_videos_by_video_ids(
    channel_id: String,
    video_ids: Vec<String>,
) -> Result<Vec<ChannelVideo>, String> {
    database::get_channel_videos_by_video_ids_db(channel_id, video_ids)
}

/// Update a channel video's status
#[tauri::command]
pub async fn update_channel_video_status(id: String, status: String) -> Result<(), String> {
    database::update_channel_video_status_db(id, status)
}

/// Update a channel video's status by channel URL + video_id (YouTube ID)
#[tauri::command]
pub async fn update_channel_video_status_by_video_id(
    channel_url: String,
    video_id: String,
    status: String,
    filepath: Option<String>,
) -> Result<(), String> {
    // First find the channel_id by URL
    let channel_id = database::get_channel_id_by_url_db(channel_url)?
        .ok_or_else(|| "Channel not found".to_string())?;
    database::update_channel_video_status_by_video_id_db(
        channel_id.clone(),
        video_id.clone(),
        status.clone(),
        filepath.clone(),
    )?;
    if status == "downloaded" {
        if let (Some(filepath), Ok(channel)) = (
            filepath,
            database::get_followed_channel_db(channel_id.clone()),
        ) {
            if channel.creator_processing.mode == "none" {
                let video_title = database::get_channel_videos_by_video_ids_db(
                    channel_id.clone(),
                    vec![video_id.clone()],
                )?
                .into_iter()
                .next()
                .map(|video| video.title)
                .unwrap_or_else(|| video_id.clone());
                if let Err(error) =
                    crate::services::telegram::send_channel_media_ready_notification(
                        &channel_id,
                        &channel.name,
                        &video_id,
                        &video_title,
                        &filepath,
                        false,
                    )
                    .await
                {
                    log::warn!("Failed to send Telegram download-ready notification: {error}");
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn complete_channel_creator_processing(
    channel_url: String,
    video_id: String,
    output_paths: Vec<String>,
) -> Result<(), String> {
    let channel_id = database::get_channel_id_by_url_db(channel_url)?
        .ok_or_else(|| "Channel not found".to_string())?;
    let channel = database::get_followed_channel_db(channel_id.clone())?;
    let video_title =
        database::get_channel_videos_by_video_ids_db(channel_id.clone(), vec![video_id.clone()])?
            .into_iter()
            .next()
            .map(|video| video.title)
            .unwrap_or_else(|| video_id.clone());
    database::complete_channel_creator_processing_db(
        channel_id.clone(),
        video_id.clone(),
        output_paths.clone(),
    )?;
    if let Some(filepath) = output_paths.first() {
        if let Err(error) = crate::services::telegram::send_channel_media_ready_notification(
            &channel_id,
            &channel.name,
            &video_id,
            &video_title,
            filepath,
            true,
        )
        .await
        {
            log::warn!("Failed to send Telegram edit-ready notification: {error}");
        }
    }
    Ok(())
}

/// Get count of new (unwatched) videos across all channels
#[tauri::command]
pub async fn get_new_videos_count(channel_id: Option<String>) -> Result<i64, String> {
    database::get_new_videos_count_db(channel_id)
}

/// Update last checked timestamp for a channel
#[tauri::command]
pub async fn update_channel_last_checked(
    id: String,
    last_video_id: Option<String>,
) -> Result<(), String> {
    database::update_channel_last_checked_db(id, last_video_id)
}

/// Update channel name and thumbnail (avatar)
#[tauri::command]
pub async fn update_channel_info(
    id: String,
    name: String,
    thumbnail: Option<String>,
) -> Result<(), String> {
    database::update_channel_info_db(id, name, thumbnail)
}

/// Sync cookie/proxy settings from frontend so the background polling loop can use them.
#[tauri::command]
pub async fn set_polling_network_config(
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<(), String> {
    use crate::services::polling::{set_network_config, PollingNetworkConfig};

    set_network_config(PollingNetworkConfig {
        cookie_mode,
        cookie_browser,
        cookie_browser_profile,
        cookie_file_path,
        cookie_skip_patterns,
        proxy_url,
    });
    Ok(())
}

#[tauri::command]
pub fn check_followed_channels_now(app: tauri::AppHandle) {
    crate::services::polling::stop_polling();
    crate::services::polling::start_polling_now(app);
}

#[tauri::command]
pub fn get_youtube_realtime_status() -> crate::services::youtube_websub::YouTubeRealtimeStatus {
    crate::services::youtube_websub::status()
}

#[cfg(test)]
mod tests {
    use super::sort_and_page_popular;
    use crate::types::PlaylistVideoEntry;

    fn entry(id: &str, views: Option<u64>, upload_date: &str) -> PlaylistVideoEntry {
        PlaylistVideoEntry {
            id: id.to_string(),
            title: id.to_string(),
            url: format!("https://example.com/{id}"),
            thumbnail: None,
            duration: None,
            channel: None,
            upload_date: Some(upload_date.to_string()),
            playlist_title: None,
            view_count: views,
        }
    }

    #[test]
    fn popular_results_are_sorted_by_views_before_paging() {
        let page = sort_and_page_popular(
            vec![
                entry("new-low", Some(10), "20260920"),
                entry("old-high", Some(1_000), "20200101"),
                entry("middle", Some(100), "20250101"),
                entry("unknown", None, "20260921"),
            ],
            Some(2),
            Some(2),
        );

        assert_eq!(
            page.iter()
                .map(|video| video.id.as_str())
                .collect::<Vec<_>>(),
            vec!["middle", "new-low"]
        );
    }
}
