use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::process::Command;

use crate::database;
use crate::services::{build_cookie_args, get_deno_path};
use crate::types::{FollowedChannel, ChannelVideo};
use crate::utils::CommandExt;

/// Cookie/proxy configuration synced from the frontend for background polling.
#[derive(Clone, Default)]
pub struct PollingNetworkConfig {
    pub cookie_mode: Option<String>,
    pub cookie_browser: Option<String>,
    pub cookie_browser_profile: Option<String>,
    pub cookie_file_path: Option<String>,
    pub proxy_url: Option<String>,
}

static POLLING_NETWORK_CONFIG: Mutex<PollingNetworkConfig> =
    Mutex::new(PollingNetworkConfig {
        cookie_mode: None,
        cookie_browser: None,
        cookie_browser_profile: None,
        cookie_file_path: None,
        proxy_url: None,
    });

/// Update the cookie/proxy config used by the background polling loop.
/// Called from the frontend whenever settings change.
pub fn set_network_config(config: PollingNetworkConfig) {
    if let Ok(mut guard) = POLLING_NETWORK_CONFIG.lock() {
        *guard = config;
    }
}

/// Read a snapshot of the current network config.
fn get_network_config() -> PollingNetworkConfig {
    POLLING_NETWORK_CONFIG
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

/// Build a fallback video URL based on the channel's platform.
fn build_fallback_video_url(channel_url: &str, video_id: &str) -> String {
    if channel_url.contains("bilibili.com") || channel_url.contains("b23.tv") {
        format!("https://www.bilibili.com/video/{}", video_id)
    } else if channel_url.contains("youku.com") {
        format!("https://v.youku.com/v_show/id_{}.html", video_id)
    } else {
        format!("https://www.youtube.com/watch?v={}", video_id)
    }
}

/// Flag to control polling (stop on app exit)
pub static POLLING_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Minimum polling interval in seconds (default: 15 minutes = 900 seconds)
pub static POLLING_INTERVAL_SECS: AtomicU64 = AtomicU64::new(900);

/// Event emitted when new videos are found
#[derive(Clone, serde::Serialize)]
pub struct NewVideosEvent {
    pub channel_id: String,
    pub channel_name: String,
    pub new_count: usize,
    pub total_new: i64,
}

/// Event emitted to trigger auto-download on frontend
#[derive(Clone, serde::Serialize)]
pub struct AutoDownloadEvent {
    pub channel_id: String,
    pub channel_name: String,
    pub quality: String,
    pub format: String,
    pub download_threads: i64,
}

/// Start the background polling loop
pub fn start_polling(app: AppHandle) {
    POLLING_ACTIVE.store(true, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        log::info!("Channel polling started");

        loop {
            // Check if polling should stop
            if !POLLING_ACTIVE.load(Ordering::SeqCst) {
                log::info!("Channel polling stopped");
                break;
            }

            // Get polling interval
            let interval = POLLING_INTERVAL_SECS.load(Ordering::SeqCst);

            // Wait for the interval
            tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;

            // Check again after sleep (might have been stopped during sleep)
            if !POLLING_ACTIVE.load(Ordering::SeqCst) {
                break;
            }

            // Get all followed channels
            let channels = match database::get_followed_channels_db() {
                Ok(channels) => channels,
                Err(e) => {
                    log::error!("Failed to get followed channels for polling: {}", e);
                    continue;
                }
            };

            if channels.is_empty() {
                continue;
            }

            for channel in &channels {
                if !POLLING_ACTIVE.load(Ordering::SeqCst) {
                    break;
                }

                // Check individual channel interval
                if !should_check_channel(channel) {
                    continue;
                }

                match check_channel_for_new_videos(&app, channel).await {
                    Ok(new_count) => {
                        if new_count > 0 {
                            // Update last checked
                            let _ = database::update_channel_last_checked_db(
                                channel.id.clone(),
                                None, // Will be set from the first video
                            );

                            // Get total new count
                            let total_new = database::get_new_videos_count_db(None).unwrap_or(0);

                            // Emit event to frontend
                            let _ = app.emit("channel-new-videos", NewVideosEvent {
                                channel_id: channel.id.clone(),
                                channel_name: channel.name.clone(),
                                new_count,
                                total_new,
                            });

                            // Update tray menu with new counts
                            crate::rebuild_tray_menu(&app);

                            // Send notification
                            send_notification(&app, &channel.name, new_count);

                            // Auto-download if enabled
                            if channel.auto_download {
                                let _ = app.emit("channel-auto-download", AutoDownloadEvent {
                                    channel_id: channel.id.clone(),
                                    channel_name: channel.name.clone(),
                                    quality: channel.download_quality.clone(),
                                    format: channel.download_format.clone(),
                                    download_threads: channel.download_threads,
                                });
                            }
                        } else {
                            // Still update last checked time
                            let _ = database::update_channel_last_checked_db(
                                channel.id.clone(),
                                channel.last_video_id.clone(),
                            );
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to check channel {}: {}", channel.name, e);
                    }
                }

                // Small delay between channels to avoid rate limiting
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        }
    });
}

/// Stop polling
pub fn stop_polling() {
    POLLING_ACTIVE.store(false, Ordering::SeqCst);
}

/// Check if enough time has passed since last check for a channel
fn should_check_channel(channel: &FollowedChannel) -> bool {
    match &channel.last_checked_at {
        Some(last_checked) => {
            if let Ok(last) = chrono::DateTime::parse_from_rfc3339(last_checked) {
                let now = chrono::Utc::now();
                let elapsed = now.signed_duration_since(last);
                let interval_mins = channel.check_interval;
                elapsed.num_minutes() >= interval_mins
            } else {
                true // Can't parse, check anyway
            }
        }
        None => true, // Never checked
    }
}

/// Check a channel for new videos
async fn check_channel_for_new_videos(
    app: &AppHandle,
    channel: &FollowedChannel,
) -> Result<usize, String> {
    let limit = channel.filter_max_videos.unwrap_or(20) as u32;
    let is_youtube = channel.url.contains("youtube.com") || channel.url.contains("youtu.be");

    let mut args = vec![
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(), "30".to_string(),
        "--playlist-end".to_string(), limit.to_string(),
    ];

    // Only use --flat-playlist for YouTube; other platforms (Bilibili, etc.)
    // return minimal data in flat mode (no title, thumbnail, duration)
    if is_youtube {
        args.push("--flat-playlist".to_string());
    }

    // If we have a last known video, use --break-on-existing for fast incremental check
    if channel.last_video_id.is_some() {
        args.push("--break-on-existing".to_string());
    }

    // Add Deno runtime for YouTube
    if is_youtube {
        if let Some(deno_path) = get_deno_path(app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    // Load cookie/proxy settings synced from the frontend
    let net = get_network_config();
    let cookie_args = build_cookie_args(
        net.cookie_mode.as_deref(),
        net.cookie_browser.as_deref(),
        net.cookie_browser_profile.as_deref(),
        net.cookie_file_path.as_deref(),
    );
    args.extend(cookie_args);

    if let Some(proxy) = net.proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    args.push(channel.url.clone());

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

    let mut new_videos: Vec<ChannelVideo> = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

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

            // Check if this video is already known (skip if it is)
            if let Some(ref last_id) = channel.last_video_id {
                if &id == last_id {
                    break; // We've reached the last known video
                }
            }

            let title = json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
            let video_url = json.get("url")
                .or_else(|| json.get("webpage_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| build_fallback_video_url(&channel.url, &id));

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
            let upload_date = json.get("upload_date")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Apply filters
            if let Some(min_dur) = channel.filter_min_duration {
                if let Some(dur) = duration {
                    if dur < min_dur as f64 {
                        continue;
                    }
                }
            }
            if let Some(max_dur) = channel.filter_max_duration {
                if let Some(dur) = duration {
                    if dur > max_dur as f64 {
                        continue;
                    }
                }
            }

            // Keyword filters
            if let Some(ref include_kw) = channel.filter_include_keywords {
                if !include_kw.is_empty() {
                    let keywords: Vec<&str> = include_kw.split(',').map(|s| s.trim()).collect();
                    let title_lower = title.to_lowercase();
                    if !keywords.iter().any(|kw| title_lower.contains(&kw.to_lowercase())) {
                        continue;
                    }
                }
            }
            if let Some(ref exclude_kw) = channel.filter_exclude_keywords {
                if !exclude_kw.is_empty() {
                    let keywords: Vec<&str> = exclude_kw.split(',').map(|s| s.trim()).collect();
                    let title_lower = title.to_lowercase();
                    if keywords.iter().any(|kw| title_lower.contains(&kw.to_lowercase())) {
                        continue;
                    }
                }
            }

            new_videos.push(ChannelVideo {
                id: uuid::Uuid::new_v4().to_string(),
                channel_id: channel.id.clone(),
                video_id: id,
                title,
                url: video_url,
                thumbnail,
                duration,
                upload_date,
                status: "new".to_string(),
                created_at: now.clone(),
            });
        }
    }

    if new_videos.is_empty() {
        return Ok(0);
    }

    // Save new videos to DB
    let new_count = new_videos.len();

    // Update last_video_id to the first (newest) video
    let first_video_id = new_videos.first().map(|v| v.video_id.clone());
    let _ = database::update_channel_last_checked_db(
        channel.id.clone(),
        first_video_id,
    );

    let _ = database::save_channel_videos_db(channel.id.clone(), new_videos);

    Ok(new_count)
}

/// Send a desktop notification for new videos
fn send_notification(app: &AppHandle, channel_name: &str, new_count: usize) {
    use tauri_plugin_notification::NotificationExt;

    let title = "Youwee";
    let body = if new_count == 1 {
        format!("{}: 1 new video", channel_name)
    } else {
        format!("{}: {} new videos", channel_name, new_count)
    };

    let _ = app.notification()
        .builder()
        .title(title)
        .body(&body)
        .show();
}
