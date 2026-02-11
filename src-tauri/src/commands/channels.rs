use std::process::Stdio;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::process::Command;

use crate::types::{ChannelInfo, FollowedChannel, ChannelVideo, PlaylistVideoEntry};
use crate::services::{build_cookie_args, get_deno_path};
use crate::utils::CommandExt;
use crate::database;

/// Get videos from a YouTube channel URL (uses yt-dlp --flat-playlist)
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
    let mut args = vec![
        "--flat-playlist".to_string(),
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(), "30".to_string(),
    ];

    let effective_limit = limit.unwrap_or(50);
    if effective_limit > 0 {
        args.push("--playlist-end".to_string());
        args.push(effective_limit.to_string());
    }

    // Add Deno runtime for YouTube
    if url.contains("youtube.com") || url.contains("youtu.be") {
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
                            return Err("Failed to fetch channel videos".to_string());
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
                .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", id));

            let thumbnail = json.get("thumbnail")
                .or_else(|| json.get("thumbnails").and_then(|t| t.as_array()).and_then(|arr| arr.first()))
                .and_then(|v| {
                    if v.is_string() {
                        v.as_str().map(|s| s.to_string())
                    } else {
                        v.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
                    }
                });

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
    let mut args = vec![
        "-J".to_string(),
        "--flat-playlist".to_string(),
        "--playlist-items".to_string(), "1".to_string(),
        "--no-download".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(), "30".to_string(),
    ];

    // Add Deno runtime for YouTube
    if url.contains("youtube.com") || url.contains("youtu.be") {
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

    // Extract channel name
    let name = json.get("channel")
        .or_else(|| json.get("uploader"))
        .or_else(|| json.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or("Channel")
        .to_string();

    // Extract avatar URL from thumbnails array
    // Priority: "avatar_uncropped" > 900x900 thumbnail > any yt3.googleusercontent.com URL
    let avatar_url = json.get("thumbnails")
        .and_then(|t| t.as_array())
        .and_then(|thumbnails| {
            // First: look for avatar_uncropped
            if let Some(avatar) = thumbnails.iter().find(|t| {
                t.get("id").and_then(|v| v.as_str()) == Some("avatar_uncropped")
            }) {
                return avatar.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
            }

            // Second: look for 900x900 (channel avatar with size)
            if let Some(avatar) = thumbnails.iter().find(|t| {
                t.get("width").and_then(|v| v.as_i64()) == Some(900)
                    && t.get("height").and_then(|v| v.as_i64()) == Some(900)
            }) {
                return avatar.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
            }

            // Third: look for any yt3.googleusercontent.com URL (channel avatar host)
            for t in thumbnails.iter().rev() {
                if let Some(url) = t.get("url").and_then(|v| v.as_str()) {
                    if url.contains("yt3.googleusercontent.com") && !url.contains("fcrop64") {
                        return Some(url.to_string());
                    }
                }
            }

            None
        });

    Ok(ChannelInfo { name, avatar_url })
}

/// Follow a channel
#[tauri::command]
pub async fn follow_channel(
    url: String,
    name: String,
    thumbnail: Option<String>,
    platform: Option<String>,
) -> Result<String, String> {
    let platform = platform.unwrap_or_else(|| "youtube".to_string());
    database::follow_channel_db(url, name, thumbnail, platform)
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
    filter_min_duration: Option<i64>,
    filter_max_duration: Option<i64>,
    filter_include_keywords: Option<String>,
    filter_exclude_keywords: Option<String>,
    filter_max_videos: Option<i64>,
) -> Result<(), String> {
    database::update_channel_settings_db(
        id,
        check_interval,
        auto_download,
        download_quality,
        download_format,
        filter_min_duration,
        filter_max_duration,
        filter_include_keywords,
        filter_exclude_keywords,
        filter_max_videos,
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
