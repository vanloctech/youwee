use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::database;
use crate::services::{
    build_cookie_args, build_site_header_args, get_deno_path, run_ytdlp_with_stderr,
};
use crate::types::{ChannelVideo, CreatorProcessingSettings, FollowedChannel};
use crate::utils::{channel_content_type_matches, is_tiktok_url, normalize_channel_content_urls};

/// Cookie/proxy configuration synced from the frontend for background polling.
#[derive(Clone, Default)]
pub struct PollingNetworkConfig {
    pub cookie_mode: Option<String>,
    pub cookie_browser: Option<String>,
    pub cookie_browser_profile: Option<String>,
    pub cookie_file_path: Option<String>,
    pub cookie_skip_patterns: Option<Vec<String>>,
    pub proxy_url: Option<String>,
}

static POLLING_NETWORK_CONFIG: Mutex<PollingNetworkConfig> = Mutex::new(PollingNetworkConfig {
    cookie_mode: None,
    cookie_browser: None,
    cookie_browser_profile: None,
    cookie_file_path: None,
    cookie_skip_patterns: None,
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
    if is_tiktok_url(channel_url) {
        format!("https://www.tiktok.com/@_/video/{}", video_id)
    } else if channel_url.contains("bilibili.com") || channel_url.contains("b23.tv") {
        format!("https://www.bilibili.com/video/{}", video_id)
    } else if channel_url.contains("youku.com") {
        format!("https://v.youku.com/v_show/id_{}.html", video_id)
    } else {
        format!("https://www.youtube.com/watch?v={}", video_id)
    }
}

/// Flag to control polling (stop on app exit)
pub static POLLING_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Generation token used to invalidate an older polling task when the user
/// presses Check now or polling is restarted. This prevents two loops from
/// running after a stop/start cycle while the old one is still asleep.
static POLLING_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Scheduler tick in seconds. Individual channels still honor their own
/// check interval; a one-minute tick keeps the fallback notifier responsive
/// without forcing every channel to be fetched every minute.
pub static POLLING_INTERVAL_SECS: AtomicU64 = AtomicU64::new(60);

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
    pub video_codec: String,
    pub preferred_fps: String,
    pub audio_bitrate: String,
    pub download_threads: i64,
    pub creator_processing: CreatorProcessingSettings,
}

/// Start the background polling loop
pub fn start_polling(app: AppHandle) {
    start_polling_with_options(app, false);
}

/// Start polling and force every followed channel to be checked on the first
/// pass. Used by the tray's Check now action.
pub fn start_polling_now(app: AppHandle) {
    start_polling_with_options(app, true);
}

fn start_polling_with_options(app: AppHandle, force_first_pass: bool) {
    // Starting polling twice should not create duplicate network work.
    if POLLING_ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }
    let generation = POLLING_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    tauri::async_runtime::spawn(async move {
        log::info!("Channel polling started");
        let mut force_check = force_first_pass;

        loop {
            // Check if polling should stop
            if !POLLING_ACTIVE.load(Ordering::SeqCst)
                || POLLING_GENERATION.load(Ordering::SeqCst) != generation
            {
                log::info!("Channel polling stopped");
                break;
            }

            // Get all followed channels
            let channels = match database::get_followed_channels_db() {
                Ok(channels) => channels,
                Err(e) => {
                    log::error!("Failed to get followed channels for polling: {}", e);
                    Vec::new()
                }
            };

            for channel in &channels {
                if !POLLING_ACTIVE.load(Ordering::SeqCst)
                    || POLLING_GENERATION.load(Ordering::SeqCst) != generation
                {
                    break;
                }

                // Check individual channel interval
                if !force_check && !should_check_channel(channel) {
                    continue;
                }

                match check_channel_for_new_videos(&app, channel, Some(generation)).await {
                    Ok(new_videos) => {
                        if !is_polling_generation_current(generation) {
                            break;
                        }
                        if !new_videos.is_empty() {
                            publish_new_videos(&app, channel, &new_videos).await;
                        } else {
                            // The channel scan updates its own timestamp and
                            // cursor, including the duplicate-row case.
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to check channel {}: {}", channel.name, e);
                    }
                }

                // Small delay between channels to avoid rate limiting
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }

            force_check = false;

            // The first pass is immediate; subsequent passes respect the
            // global interval. Check now invalidates this task and starts a
            // fresh immediate pass.
            let interval = POLLING_INTERVAL_SECS.load(Ordering::SeqCst);
            tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;
        }
    });
}

fn is_polling_generation_current(generation: u64) -> bool {
    POLLING_ACTIVE.load(Ordering::SeqCst) && POLLING_GENERATION.load(Ordering::SeqCst) == generation
}

/// Stop polling
pub fn stop_polling() {
    POLLING_ACTIVE.store(false, Ordering::SeqCst);
    POLLING_GENERATION.fetch_add(1, Ordering::SeqCst);
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
    generation: Option<u64>,
) -> Result<Vec<ChannelVideo>, String> {
    let limit = channel.filter_max_videos.unwrap_or(20) as u32;
    let channel_urls =
        normalize_channel_content_urls(&channel.url, Some(&channel.youtube_content_type));
    let net = get_network_config();
    let mut output = String::new();

    for channel_url in channel_urls {
        let is_youtube = channel_url.contains("youtube.com") || channel_url.contains("youtu.be");
        let is_tiktok = is_tiktok_url(&channel_url);

        let mut args = vec![
            "--dump-json".to_string(),
            "--no-warnings".to_string(),
            "--socket-timeout".to_string(),
            "30".to_string(),
            "--playlist-end".to_string(),
            limit.to_string(),
        ];

        // TikTok flat entries include title, thumbnail, and duration.
        if is_youtube || is_tiktok {
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

        args.extend(build_site_header_args(&channel_url));

        // Load cookie/proxy settings synced from the frontend
        let cookie_args = build_cookie_args(
            &channel_url,
            net.cookie_mode.as_deref(),
            net.cookie_browser.as_deref(),
            net.cookie_browser_profile.as_deref(),
            net.cookie_file_path.as_deref(),
            net.cookie_skip_patterns.as_deref(),
        );
        args.extend(cookie_args);

        if let Some(proxy) = net.proxy_url.as_ref() {
            if !proxy.is_empty() {
                args.push("--proxy".to_string());
                args.push(proxy.clone());
            }
        }

        args.push("--".to_string());
        args.push(channel_url);

        let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

        let output_result = run_ytdlp_with_stderr(app, &args_ref).await?;
        if !output_result.success && output_result.stdout.is_empty() {
            return Err("Failed to fetch channel videos".to_string());
        }
        output.push_str(&output_result.stdout);
        if !output.ends_with('\n') {
            output.push('\n');
        }
    }

    let mut new_videos: Vec<ChannelVideo> = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();
    let mut newest_video_id = None;

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

            if newest_video_id.is_none() {
                newest_video_id = Some(id.clone());
            }

            // Check if this video is already known (skip if it is)
            if let Some(ref last_id) = channel.last_video_id {
                if &id == last_id {
                    break; // We've reached the last known video
                }
            }

            let title = json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let video_url = json
                .get("webpage_url")
                .or_else(|| json.get("url"))
                .and_then(|v| v.as_str())
                .filter(|candidate| {
                    candidate.starts_with("http://") || candidate.starts_with("https://")
                })
                .map(|s| s.to_string())
                .unwrap_or_else(|| build_fallback_video_url(&channel.url, &id));

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
            if !channel_content_type_matches(&channel.url, &channel.youtube_content_type, duration)
            {
                continue;
            }
            let upload_date = json
                .get("upload_date")
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
                    if !keywords
                        .iter()
                        .any(|kw| title_lower.contains(&kw.to_lowercase()))
                    {
                        continue;
                    }
                }
            }
            if let Some(ref exclude_kw) = channel.filter_exclude_keywords {
                if !exclude_kw.is_empty() {
                    let keywords: Vec<&str> = exclude_kw.split(',').map(|s| s.trim()).collect();
                    let title_lower = title.to_lowercase();
                    if keywords
                        .iter()
                        .any(|kw| title_lower.contains(&kw.to_lowercase()))
                    {
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
                downloaded_at: None,
                output_path: None,
                edited_output_paths: Vec::new(),
            });
        }
    }

    if new_videos.is_empty() {
        let _ = database::update_channel_last_checked_db(
            channel.id.clone(),
            newest_video_id.or_else(|| channel.last_video_id.clone()),
        );
        return Ok(Vec::new());
    }

    if generation.is_some_and(|value| !is_polling_generation_current(value)) {
        return Ok(Vec::new());
    }

    // Save first and use the inserted rows for the notification. A channel
    // scan can contain rows already stored by an earlier scan or task.
    let inserted_videos = database::save_new_channel_videos_db(channel.id.clone(), new_videos)?;
    // Update last_video_id to the first (newest) video after the DB write.
    let last_video_id = if is_tiktok_url(&channel.url) {
        newest_video_id
    } else {
        inserted_videos
            .first()
            .map(|video| video.video_id.clone())
            .or(newest_video_id)
    };
    let _ = database::update_channel_last_checked_db(channel.id.clone(), last_video_id);

    if inserted_videos.is_empty()
        || generation.is_some_and(|value| !is_polling_generation_current(value))
    {
        return Ok(Vec::new());
    }

    Ok(inserted_videos)
}

/// Run the normal metadata/filter scan immediately after a YouTube WebSub
/// event, then fan the inserted videos out through the exact same desktop,
/// Telegram, auto-download, and creator-processing path as fallback polling.
pub async fn check_channel_from_realtime_event(
    app: &AppHandle,
    channel: &FollowedChannel,
    expected_video_id: Option<&str>,
) {
    if let Some(video_id) = expected_video_id {
        if database::get_channel_videos_by_video_ids_db(
            channel.id.clone(),
            vec![video_id.to_string()],
        )
        .is_ok_and(|videos| !videos.is_empty())
        {
            // WebSub also reports title/description edits. Do not turn those
            // into duplicate notifications or repeated metadata scans.
            return;
        }
    }

    // The push can arrive a few seconds before the new upload appears on the
    // public channel tab. Retry briefly so the alert remains near-real-time
    // instead of falling through to the 15-minute recovery poll.
    for delay_secs in [0_u64, 3, 7, 15] {
        if delay_secs > 0 {
            tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
        }
        match check_channel_for_new_videos(app, channel, None).await {
            Ok(new_videos) if !new_videos.is_empty() => {
                publish_new_videos(app, channel, &new_videos).await;
                return;
            }
            Ok(_) => {}
            Err(error) => {
                log::warn!("WebSub scan failed for {}: {}", channel.name, error);
            }
        }
    }

    log::debug!(
        "WebSub scan for {} contained no new rows after retries (already seen or filtered)",
        channel.name
    );
}

async fn publish_new_videos(app: &AppHandle, channel: &FollowedChannel, videos: &[ChannelVideo]) {
    let new_count = videos.len();
    let total_new = database::get_new_videos_count_db(None).unwrap_or(0);

    let _ = app.emit(
        "channel-new-videos",
        NewVideosEvent {
            channel_id: channel.id.clone(),
            channel_name: channel.name.clone(),
            new_count,
            total_new,
        },
    );
    crate::rebuild_tray_menu(app);
    send_notification(app, &channel.name, new_count);

    if let Err(error) =
        crate::services::telegram::send_new_video_notification(&channel.name, videos).await
    {
        log::warn!("Failed to send Telegram new-video notification: {}", error);
    }

    if channel.auto_download {
        let _ = app.emit(
            "channel-auto-download",
            AutoDownloadEvent {
                channel_id: channel.id.clone(),
                channel_name: channel.name.clone(),
                quality: channel.download_quality.clone(),
                format: channel.download_format.clone(),
                video_codec: channel.download_video_codec.clone(),
                preferred_fps: channel.download_preferred_fps.clone(),
                audio_bitrate: channel.download_audio_bitrate.clone(),
                download_threads: channel.download_threads,
                creator_processing: channel.creator_processing.clone(),
            },
        );
    }
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

    let _ = app.notification().builder().title(title).body(&body).show();
}
