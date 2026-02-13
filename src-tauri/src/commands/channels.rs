use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::process::Command;

use crate::types::{ChannelInfo, FollowedChannel, ChannelVideo, PlaylistVideoEntry};
use crate::services::{build_cookie_args, get_deno_path};
use crate::utils::CommandExt;
use crate::database;

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

/// Get videos from a channel URL (uses yt-dlp, supports YouTube/Bilibili/etc.)
#[tauri::command]
pub async fn get_channel_videos(
    app: AppHandle,
    url: String,
    limit: Option<u32>,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    proxy_url: Option<String>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    let is_youtube = url.contains("youtube.com") || url.contains("youtu.be");
    let max_attempts = if is_youtube { 1 } else { 2 };

    let mut last_error = String::new();

    for attempt in 0..max_attempts {
        if attempt > 0 {
            // Wait before retry
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        match fetch_channel_videos_once(&app, &url, limit, is_youtube,
            cookie_mode.as_deref(), cookie_browser.as_deref(),
            cookie_browser_profile.as_deref(), cookie_file_path.as_deref(),
            proxy_url.as_deref(),
        ).await {
            Ok(entries) => return Ok(entries),
            Err(e) => {
                last_error = e;
                // Only retry for non-YouTube (Bilibili rate-limiting)
                if is_youtube { break; }
            }
        }
    }

    Err(last_error)
}

/// Inner function: single attempt to fetch channel videos via yt-dlp
async fn fetch_channel_videos_once(
    app: &AppHandle,
    url: &str,
    limit: Option<u32>,
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
        "--socket-timeout".to_string(), "30".to_string(),
    ];

    // Only use --flat-playlist for YouTube; other platforms (Bilibili, etc.)
    // return minimal data in flat mode (no title, thumbnail, duration)
    if is_youtube {
        args.push("--flat-playlist".to_string());
    }

    let effective_limit = limit.unwrap_or(50);
    if effective_limit > 0 {
        args.push("--playlist-end".to_string());
        args.push(effective_limit.to_string());
    }

    // Add Deno runtime for YouTube
    if is_youtube {
        if let Some(deno_path) = get_deno_path(app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

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

    args.push(url.to_string());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let sidecar_result = app.shell().sidecar("yt-dlp");

    let output = match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(&args_ref)
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;

            let mut output = String::new();
            let mut stderr_output = String::new();
            let mut fetched_count: u32 = 0;

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        output.push_str(&String::from_utf8_lossy(&bytes));

                        // Emit progress as each video line arrives
                        let new_count = output.matches('\n').count() as u32;
                        if new_count > fetched_count {
                            fetched_count = new_count;
                            let _ = app.emit("channel-fetch-progress", serde_json::json!({
                                "fetched": fetched_count,
                                "limit": effective_limit
                            }));
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        stderr_output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Error(err) => {
                        return Err(format!("Process error: {}", err));
                    }
                    CommandEvent::Terminated(status) => {
                        if status.code != Some(0) && output.is_empty() {
                            let detail = if stderr_output.is_empty() {
                                "yt-dlp exited with error".to_string()
                            } else {
                                // Take last meaningful line from stderr
                                stderr_output.lines()
                                    .rev()
                                    .find(|l| !l.trim().is_empty())
                                    .unwrap_or("yt-dlp exited with error")
                                    .to_string()
                            };
                            return Err(format!("Failed to fetch channel videos: {}", detail));
                        }
                    }
                    _ => {}
                }
            }

            output
        }
        Err(_) => {
            let mut cmd = Command::new("yt-dlp");
            cmd.args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();
            let result = cmd.output().await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

            if !result.status.success() && result.stdout.is_empty() {
                let stderr = String::from_utf8_lossy(&result.stderr);
                let detail = stderr.lines()
                    .rev()
                    .find(|l| !l.trim().is_empty())
                    .unwrap_or("yt-dlp exited with error");
                return Err(format!("Failed to fetch channel videos: {}", detail));
            }

            String::from_utf8_lossy(&result.stdout).to_string()
        }
    };

    let mut entries: Vec<PlaylistVideoEntry> = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();

            if id.is_empty() {
                continue;
            }

            let title = json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
            let video_url = json.get("url")
                .or_else(|| json.get("webpage_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| build_fallback_video_url(url, &id));

            let thumbnail = json.get("thumbnail")
                .or_else(|| json.get("thumbnails").and_then(|t| t.as_array()).and_then(|arr| arr.first()))
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
            let channel = json.get("channel")
                .or_else(|| json.get("uploader"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let upload_date = json.get("upload_date")
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
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
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
) -> Result<ChannelInfo, String> {
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
        "--playlist-items".to_string(), "1".to_string(),
        "--no-download".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(), "30".to_string(),
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

    args.push(url.clone());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let sidecar_result = app.shell().sidecar("yt-dlp");

    let output = match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(&args_ref)
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;

            let mut output = String::new();

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Stderr(_) => {}
                    CommandEvent::Error(err) => {
                        return Err(format!("Process error: {}", err));
                    }
                    CommandEvent::Terminated(status) => {
                        if status.code != Some(0) && output.is_empty() {
                            return Err("Failed to fetch channel info".to_string());
                        }
                    }
                    _ => {}
                }
            }

            output
        }
        Err(_) => {
            let mut cmd = Command::new("yt-dlp");
            cmd.args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();
            let result = cmd.output().await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

            String::from_utf8_lossy(&result.stdout).to_string()
        }
    };

    // Parse top-level JSON (channel/playlist metadata)
    let json: serde_json::Value = serde_json::from_str(&output)
        .map_err(|e| format!("Failed to parse channel info: {}", e))?;

    // For non-flat-playlist output, data may be inside entries[0]
    let first_entry = json.get("entries")
        .and_then(|e| e.as_array())
        .and_then(|arr| arr.first());

    // Extract channel name: top-level → entries[0] → fallback
    let name = json.get("channel")
        .or_else(|| json.get("uploader"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        // Fallback: look inside entries[0]
        .or_else(|| {
            first_entry
                .and_then(|entry| {
                    entry.get("channel")
                        .or_else(|| entry.get("uploader"))
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                })
        })
        // Last resort: top-level title
        .or_else(|| json.get("title").and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
        .unwrap_or("Channel")
        .to_string();

    // Extract avatar URL from thumbnails array
    // YouTube-specific: "avatar_uncropped" > 900x900 > yt3.googleusercontent.com
    // Generic fallback: largest thumbnail or first available
    let avatar_url = json.get("thumbnails")
        .and_then(|t| t.as_array())
        .and_then(|thumbnails| {
            // First: look for avatar_uncropped (YouTube)
            if let Some(avatar) = thumbnails.iter().find(|t| {
                t.get("id").and_then(|v| v.as_str()) == Some("avatar_uncropped")
            }) {
                return avatar.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
            }

            // Second: look for 900x900 (YouTube channel avatar)
            if let Some(avatar) = thumbnails.iter().find(|t| {
                t.get("width").and_then(|v| v.as_i64()) == Some(900)
                    && t.get("height").and_then(|v| v.as_i64()) == Some(900)
            }) {
                return avatar.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
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
            let best = thumbnails.iter()
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
                    let best = thumbnails.iter()
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
) -> Result<String, String> {
    let platform = platform.unwrap_or_else(|| "youtube".to_string());
    let download_quality = download_quality.unwrap_or_else(|| "best".to_string());
    let download_format = download_format.unwrap_or_else(|| "mp4".to_string());
    let download_video_codec = download_video_codec.unwrap_or_else(|| "h264".to_string());
    let download_audio_bitrate = download_audio_bitrate.unwrap_or_else(|| "192".to_string());
    database::follow_channel_db(url, name, thumbnail, platform, download_quality, download_format, download_video_codec, download_audio_bitrate)
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

/// Update a channel video's status
#[tauri::command]
pub async fn update_channel_video_status(
    id: String,
    status: String,
) -> Result<(), String> {
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
pub async fn get_new_videos_count(
    channel_id: Option<String>,
) -> Result<i64, String> {
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
