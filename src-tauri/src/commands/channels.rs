use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::database;
use crate::services::{
    build_cookie_args, build_site_header_args, get_deno_path, get_ytdlp_path, run_ytdlp_with_stderr,
};
use crate::types::{ChannelInfo, ChannelVideo, FollowedChannel, PlaylistVideoEntry};
use crate::utils::CommandExt;
use crate::utils::{normalize_channel_content_urls, normalize_url, validate_url};

fn sanitize_youtube_content_type(value: Option<&str>) -> String {
    match value {
        Some("shorts") => "shorts".to_string(),
        Some("streams") => "streams".to_string(),
        Some("videos_shorts") => "videos_shorts".to_string(),
        _ => "videos".to_string(),
    }
}

/// Build a fallback video URL based on the channel's platform.
/// Used when yt-dlp doesn't return a `url` or `webpage_url` field.
fn build_fallback_video_url(channel_url: &str, video_id: &str) -> String {
    if channel_url.contains("bilibili.com") || channel_url.contains("b23.tv") {
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
) -> Result<String, String> {
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

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;
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

    let output_result = run_ytdlp_with_stderr(app, args).await?;
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
    proxy_url: Option<String>,
    youtube_content_type: Option<String>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    validate_url(&url)?;
    let youtube_content_type = sanitize_youtube_content_type(youtube_content_type.as_deref());
    let urls = normalize_channel_content_urls(&url, Some(&youtube_content_type));

    let is_youtube = urls
        .iter()
        .any(|url| url.contains("youtube.com") || url.contains("youtu.be"));
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
            let source_is_youtube =
                source_url.contains("youtube.com") || source_url.contains("youtu.be");

            match fetch_channel_videos_once(
                &app,
                source_url,
                limit,
                start,
                request_id,
                source_is_youtube,
                cookie_mode.as_deref(),
                cookie_browser.as_deref(),
                cookie_browser_profile.as_deref(),
                cookie_file_path.as_deref(),
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
            return Ok(entries);
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
    is_youtube: bool,
    cookie_mode: Option<&str>,
    cookie_browser: Option<&str>,
    cookie_browser_profile: Option<&str>,
    cookie_file_path: Option<&str>,
    proxy_url: Option<&str>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    let mut args = vec![
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "30".to_string(),
    ];

    // Only use --flat-playlist for YouTube; other platforms (Bilibili, etc.)
    // return minimal data in flat mode (no title, thumbnail, duration)
    if is_youtube {
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
        cookie_mode,
        cookie_browser,
        cookie_browser_profile,
        cookie_file_path,
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
    let output = run_channel_ytdlp_with_progress(app, &args_ref, request_id, limit).await?;

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

            let title = json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let video_url = json
                .get("url")
                .or_else(|| json.get("webpage_url"))
                .and_then(|v| v.as_str())
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

            entries.push(PlaylistVideoEntry {
                id,
                title,
                url: video_url,
                thumbnail,
                duration,
                channel,
                upload_date,
            });
        }
    }

    if entries.is_empty() {
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
    proxy_url: Option<String>,
    youtube_content_type: Option<String>,
) -> Result<ChannelInfo, String> {
    validate_url(&url)?;
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

    // Only use --flat-playlist for YouTube; other platforms return
    // minimal data in flat mode (no channel name, no thumbnails)
    if is_youtube {
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
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
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
    let output_result = run_ytdlp_with_stderr(&app, &args_ref).await?;
    if !output_result.success && output_result.stdout.is_empty() {
        return Err("Failed to fetch channel info".to_string());
    }
    let output = output_result.stdout;

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
    url: String,
    name: String,
    thumbnail: Option<String>,
    platform: Option<String>,
    download_quality: Option<String>,
    download_format: Option<String>,
    download_video_codec: Option<String>,
    download_audio_bitrate: Option<String>,
    youtube_content_type: Option<String>,
) -> Result<String, String> {
    let platform = platform.unwrap_or_else(|| "youtube".to_string());
    let download_quality = download_quality.unwrap_or_else(|| "best".to_string());
    let download_format = download_format.unwrap_or_else(|| "mp4".to_string());
    let download_video_codec = download_video_codec.unwrap_or_else(|| "h264".to_string());
    let download_audio_bitrate = download_audio_bitrate.unwrap_or_else(|| "192".to_string());
    let youtube_content_type = if platform == "youtube" {
        sanitize_youtube_content_type(youtube_content_type.as_deref())
    } else {
        "videos".to_string()
    };
    database::follow_channel_db(
        url,
        name,
        thumbnail,
        platform,
        download_quality,
        download_format,
        download_video_codec,
        download_audio_bitrate,
        youtube_content_type,
    )
}

/// Unfollow a channel
#[tauri::command]
pub async fn unfollow_channel(id: String) -> Result<(), String> {
    database::unfollow_channel_db(id)
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
    download_audio_bitrate: Option<String>,
    filter_min_duration: Option<i64>,
    filter_max_duration: Option<i64>,
    filter_include_keywords: Option<String>,
    filter_exclude_keywords: Option<String>,
    filter_max_videos: Option<i64>,
    download_threads: Option<i64>,
    youtube_content_type: Option<String>,
) -> Result<(), String> {
    database::update_channel_settings_db(
        id,
        check_interval,
        auto_download,
        download_quality,
        download_format,
        download_video_codec.unwrap_or_else(|| "h264".to_string()),
        download_audio_bitrate.unwrap_or_else(|| "192".to_string()),
        filter_min_duration,
        filter_max_duration,
        filter_include_keywords,
        filter_exclude_keywords,
        filter_max_videos,
        download_threads.unwrap_or(1),
        sanitize_youtube_content_type(youtube_content_type.as_deref()),
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
) -> Result<(), String> {
    // First find the channel_id by URL
    let channel_id = database::get_channel_id_by_url_db(channel_url)?
        .ok_or_else(|| "Channel not found".to_string())?;
    database::update_channel_video_status_by_video_id_db(channel_id, video_id, status)
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
    proxy_url: Option<String>,
) -> Result<(), String> {
    use crate::services::polling::{PollingNetworkConfig, set_network_config};

    set_network_config(PollingNetworkConfig {
        cookie_mode,
        cookie_browser,
        cookie_browser_profile,
        cookie_file_path,
        proxy_url,
    });
    Ok(())
}
