use axum::{
    body::Bytes,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use regex::Regex;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex, RwLock,
    },
    time::Duration,
};
use tauri::AppHandle;

use crate::{database, services::run_ytdlp_json, types::FollowedChannel};

const WEBSUB_PATH: &str = "/youtube/websub";
const YOUTUBE_HUB_URL: &str = "https://pubsubhubbub.appspot.com/subscribe";
const YOUTUBE_FEED_URL_PREFIX: &str =
    "https://www.youtube.com/xml/feeds/videos.xml?channel_id=";
const RENEW_INTERVAL_SECS: u64 = 6 * 60 * 60;

static ACTIVE: AtomicBool = AtomicBool::new(false);
static CALLBACK_URL: RwLock<Option<String>> = RwLock::new(None);
static CHANNEL_MAP: RwLock<Option<HashMap<String, String>>> = RwLock::new(None);
static CLOUDFLARED_CHILD: Mutex<Option<Child>> = Mutex::new(None);
static SUBSCRIBED_CHANNELS: AtomicU64 = AtomicU64::new(0);
static LAST_ERROR: RwLock<Option<String>> = RwLock::new(None);
static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeRealtimeStatus {
    pub active: bool,
    pub connected: bool,
    pub subscribed_channels: u64,
    pub last_error: Option<String>,
}

#[derive(Clone)]
struct WebSubState {
    app: AppHandle,
    callback_secret: String,
}

/// Start a local WebSub callback server and expose it through a zero-config
/// Cloudflare Quick Tunnel. Polling remains active as a recovery path.
pub fn start(app: AppHandle) {
    if ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Ok(mut error) = LAST_ERROR.write() {
        *error = None;
    }

    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_service(app).await {
            log::warn!("YouTube realtime notifications unavailable: {error}");
            stop();
            if let Ok(mut last_error) = LAST_ERROR.write() {
                *last_error = Some(error);
            }
        }
    });
}

pub fn stop() {
    ACTIVE.store(false, Ordering::SeqCst);
    if let Ok(mut callback) = CALLBACK_URL.write() {
        *callback = None;
    }
    if let Ok(mut map) = CHANNEL_MAP.write() {
        *map = None;
    }
    SUBSCRIBED_CHANNELS.store(0, Ordering::SeqCst);
    if let Ok(mut child) = CLOUDFLARED_CHILD.lock() {
        if let Some(process) = child.as_mut() {
            let _ = process.kill();
            let _ = process.wait();
        }
        *child = None;
    }
}

pub fn status() -> YouTubeRealtimeStatus {
    let tunnel_running = CLOUDFLARED_CHILD
        .lock()
        .ok()
        .and_then(|mut child| {
            child
                .as_mut()
                .map(|process| matches!(process.try_wait(), Ok(None)))
        })
        .unwrap_or(false);
    let callback_ready = CALLBACK_URL
        .read()
        .map(|value| value.is_some())
        .unwrap_or(false);
    if callback_ready && !tunnel_running {
        ACTIVE.store(false, Ordering::SeqCst);
        if let Ok(mut error) = LAST_ERROR.write() {
            *error = Some("Cloudflare quick tunnel stopped unexpectedly".to_string());
        }
    }
    YouTubeRealtimeStatus {
        active: ACTIVE.load(Ordering::SeqCst),
        connected: callback_ready && tunnel_running,
        subscribed_channels: SUBSCRIBED_CHANNELS.load(Ordering::SeqCst),
        last_error: LAST_ERROR.read().ok().and_then(|value| value.clone()),
    }
}

async fn run_service(app: AppHandle) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|error| format!("cannot bind WebSub listener: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("cannot read WebSub listener address: {error}"))?
        .port();
    let callback_secret = uuid::Uuid::new_v4().to_string();
    let router = Router::new()
        .route(
            WEBSUB_PATH,
            get(verify_subscription).post(receive_notification),
        )
        .route("/health", get(|| async { "ok" }))
        .with_state(WebSubState {
            app: app.clone(),
            callback_secret: callback_secret.clone(),
        });

    tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            log::warn!("YouTube WebSub listener stopped: {error}");
        }
    });

    let cloudflared = ensure_cloudflared(&app).await?;
    let public_base = launch_quick_tunnel(&cloudflared, port).await?;
    wait_for_public_health(&public_base).await?;
    let callback_url = format!("{public_base}{WEBSUB_PATH}?token={callback_secret}");
    if let Ok(mut callback) = CALLBACK_URL.write() {
        *callback = Some(callback_url.clone());
    }

    log::info!("YouTube realtime WebSub callback is ready");
    refresh_subscriptions(&app).await;

    while ACTIVE.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_secs(RENEW_INTERVAL_SECS)).await;
        if ACTIVE.load(Ordering::SeqCst) {
            refresh_subscriptions(&app).await;
        }
    }
    Ok(())
}

async fn verify_subscription(
    State(state): State<WebSubState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let mode = params
        .get("hub.mode")
        .map(String::as_str)
        .unwrap_or_default();
    let challenge = params.get("hub.challenge").cloned().unwrap_or_default();
    let topic = params
        .get("hub.topic")
        .map(String::as_str)
        .unwrap_or_default();

    if params.get("token") == Some(&state.callback_secret)
        && matches!(mode, "subscribe" | "unsubscribe")
        && !challenge.is_empty()
        && topic.starts_with(YOUTUBE_FEED_URL_PREFIX)
    {
        (StatusCode::OK, challenge)
    } else {
        (StatusCode::BAD_REQUEST, String::new())
    }
}

async fn receive_notification(
    State(state): State<WebSubState>,
    Query(params): Query<HashMap<String, String>>,
    body: Bytes,
) -> impl IntoResponse {
    if params.get("token") != Some(&state.callback_secret) {
        return StatusCode::FORBIDDEN;
    }
    let payload = String::from_utf8_lossy(&body);
    let channel_id = capture_xml_value(&payload, "channelId");
    let video_id = capture_xml_value(&payload, "videoId");

    if let Some(channel_id) = channel_id {
        let app = state.app.clone();
        tauri::async_runtime::spawn(async move {
            // YouTube's channel page can trail the WebSub event by a moment.
            // A short delay keeps the existing metadata/filter path accurate.
            tokio::time::sleep(Duration::from_secs(2)).await;
            handle_channel_event(&app, &channel_id, video_id.as_deref()).await;
        });
    }

    StatusCode::NO_CONTENT
}

fn capture_xml_value(payload: &str, local_name: &str) -> Option<String> {
    let pattern = format!(
        r"<(?:(?:[A-Za-z0-9_-]+):)?{}>([^<]+)</",
        regex::escape(local_name)
    );
    Regex::new(&pattern)
        .ok()?
        .captures(payload)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn handle_channel_event(app: &AppHandle, youtube_channel_id: &str, video_id: Option<&str>) {
    let internal_id = CHANNEL_MAP
        .read()
        .ok()
        .and_then(|map| map.as_ref()?.get(youtube_channel_id).cloned());
    let Some(internal_id) = internal_id else {
        log::debug!("Ignored WebSub event for an unfollowed YouTube channel");
        return;
    };

    let channel = match database::get_followed_channel_db(internal_id) {
        Ok(channel) => channel,
        Err(_) => return,
    };
    log::info!(
        "YouTube WebSub event received for {}{}",
        channel.name,
        video_id
            .map(|value| format!(" ({value})"))
            .unwrap_or_default()
    );
    crate::services::polling::check_channel_from_realtime_event(app, &channel, video_id).await;
}

/// Refresh subscriptions after startup and whenever followed channels change.
pub async fn refresh_subscriptions(app: &AppHandle) {
    let _refresh_guard = REFRESH_LOCK.lock().await;
    if !ACTIVE.load(Ordering::SeqCst) {
        return;
    }
    let callback_url = CALLBACK_URL.read().ok().and_then(|value| value.clone());
    let Some(callback_url) = callback_url else {
        return;
    };
    let channels = match database::get_followed_channels_db() {
        Ok(channels) => channels,
        Err(error) => {
            log::warn!("Cannot load channels for WebSub subscription: {error}");
            return;
        }
    };

    let mut resolved = HashMap::new();
    for channel in channels
        .into_iter()
        .filter(|channel| channel.platform.eq_ignore_ascii_case("youtube"))
    {
        match resolve_youtube_channel_id(app, &channel).await {
            Ok(youtube_id) => {
                if let Err(error) = subscribe_channel(&callback_url, &youtube_id).await {
                    log::warn!("WebSub subscribe failed for {}: {error}", channel.name);
                } else {
                    resolved.insert(youtube_id, channel.id);
                }
            }
            Err(error) => {
                log::warn!(
                    "Cannot resolve YouTube channel {} for WebSub: {error}",
                    channel.name
                );
            }
        }
    }

    if let Ok(mut map) = CHANNEL_MAP.write() {
        SUBSCRIBED_CHANNELS.store(resolved.len() as u64, Ordering::SeqCst);
        *map = Some(resolved);
    }
}

async fn subscribe_channel(callback_url: &str, channel_id: &str) -> Result<(), String> {
    let topic = format!("{YOUTUBE_FEED_URL_PREFIX}{channel_id}");
    let response = reqwest::Client::new()
        .post(YOUTUBE_HUB_URL)
        .form(&[
            ("hub.callback", callback_url),
            ("hub.topic", topic.as_str()),
            // Synchronous verification means a successful response confirms
            // that the hub reached our callback. With async verification the
            // old invalid feed URL looked subscribed even though no events
            // could ever arrive.
            ("hub.verify", "sync"),
            ("hub.mode", "subscribe"),
            ("hub.lease_seconds", "864000"),
        ])
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if status.is_success() {
        Ok(())
    } else {
        let details = response.text().await.unwrap_or_default();
        Err(format!("hub returned HTTP {status}: {}", details.trim()))
    }
}

async fn resolve_youtube_channel_id(
    app: &AppHandle,
    channel: &FollowedChannel,
) -> Result<String, String> {
    if let Some(channel_id) = capture_channel_id(&channel.url) {
        return Ok(channel_id);
    }

    let html = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|error| error.to_string())?
        .get(&channel.url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    if let Some(channel_id) = capture_channel_id(&html) {
        return Ok(channel_id);
    }

    let output = run_ytdlp_json(
        app,
        &[
            "--dump-single-json",
            "--flat-playlist",
            "--playlist-end",
            "1",
            &channel.url,
        ],
    )
    .await?;
    let value: serde_json::Value =
        serde_json::from_str(&output).map_err(|error| error.to_string())?;
    for candidate in [
        value.get("channel_id"),
        value.get("uploader_id"),
        value
            .get("entries")
            .and_then(|entries| entries.get(0))
            .and_then(|entry| entry.get("channel_id")),
    ] {
        if let Some(channel_id) = candidate.and_then(|value| value.as_str()) {
            if is_youtube_channel_id(channel_id) {
                return Ok(channel_id.to_string());
            }
        }
    }
    Err("YouTube channel ID was not present in the channel metadata".to_string())
}

fn capture_channel_id(value: &str) -> Option<String> {
    let patterns = [
        r#"(?:youtube\.com/)?channel/(UC[A-Za-z0-9_-]{20,})"#,
        r#""channelId"\s*:\s*"(UC[A-Za-z0-9_-]{20,})""#,
        r#""externalId"\s*:\s*"(UC[A-Za-z0-9_-]{20,})""#,
        r#"itemprop=["']channelId["']\s+content=["'](UC[A-Za-z0-9_-]{20,})["']"#,
    ];
    patterns.iter().find_map(|pattern| {
        Regex::new(pattern)
            .ok()?
            .captures(value)
            .and_then(|captures| captures.get(1))
            .map(|capture| capture.as_str().to_string())
    })
}

fn is_youtube_channel_id(value: &str) -> bool {
    value.starts_with("UC")
        && value.len() >= 22
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
}

async fn ensure_cloudflared(app: &AppHandle) -> Result<PathBuf, String> {
    let bin_dir = crate::utils::app_data_dir(app)?.join("bin");
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|error| format!("cannot create dependency directory: {error}"))?;
    let path = bin_dir.join(cloudflared_binary_name());
    if path.is_file() {
        return Ok(path);
    }

    log::info!("Downloading Cloudflare Tunnel for YouTube realtime notifications");
    let response = reqwest::get(cloudflared_download_url())
        .await
        .map_err(|error| format!("cloudflared download failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("cloudflared download failed: {error}"))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("cannot read cloudflared download: {error}"))?;
    let temporary = path.with_extension("download");
    tokio::fs::write(&temporary, &bytes)
        .await
        .map_err(|error| format!("cannot save cloudflared: {error}"))?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|error| format!("cannot install cloudflared: {error}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o755);
        tokio::fs::set_permissions(&path, permissions)
            .await
            .map_err(|error| format!("cannot make cloudflared executable: {error}"))?;
    }
    Ok(path)
}

async fn launch_quick_tunnel(binary: &Path, port: u16) -> Result<String, String> {
    let mut command = Command::new(binary);
    command
        .args([
            "tunnel",
            "--no-autoupdate",
            "--url",
            &format!("http://127.0.0.1:{port}"),
            "--loglevel",
            "info",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot start cloudflared: {error}"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or("cloudflared did not expose its startup log")?;
    if let Ok(mut running) = CLOUDFLARED_CHILD.lock() {
        *running = Some(child);
    }

    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let url_pattern = Regex::new(r"https://[A-Za-z0-9-]+\.trycloudflare\.com").ok();
        let mut sent = false;
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if !sent {
                if let Some(url) = url_pattern
                    .as_ref()
                    .and_then(|pattern| pattern.find(&line))
                    .map(|value| value.as_str().to_string())
                {
                    let _ = sender.send(url);
                    sent = true;
                }
            }
        }
    });

    tokio::task::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(45)))
        .await
        .map_err(|error| format!("cloudflared startup task failed: {error}"))?
        .map_err(|_| "cloudflared did not provide a public URL within 45 seconds".to_string())
}

async fn wait_for_public_health(public_base: &str) -> Result<(), String> {
    let health_url = format!("{public_base}/health");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())?;
    for _ in 0..12 {
        if let Ok(response) = client.get(&health_url).send().await {
            if response.status().is_success() {
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    Err("public WebSub callback did not become healthy within 24 seconds".to_string())
}

#[cfg(target_os = "windows")]
fn cloudflared_binary_name() -> &'static str {
    "cloudflared.exe"
}

#[cfg(not(target_os = "windows"))]
fn cloudflared_binary_name() -> &'static str {
    "cloudflared"
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn cloudflared_download_url() -> &'static str {
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
}

#[cfg(all(target_os = "windows", target_arch = "aarch64"))]
fn cloudflared_download_url() -> &'static str {
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-arm64.exe"
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn cloudflared_download_url() -> &'static str {
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
}

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
fn cloudflared_download_url() -> &'static str {
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn cloudflared_download_url() -> &'static str {
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn cloudflared_download_url() -> &'static str {
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_channel_and_video_ids_from_atom_payload() {
        let payload = r#"<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>abc123</yt:videoId><yt:channelId>UC12345678901234567890</yt:channelId></entry></feed>"#;
        assert_eq!(
            capture_xml_value(payload, "videoId").as_deref(),
            Some("abc123")
        );
        assert_eq!(
            capture_xml_value(payload, "channelId").as_deref(),
            Some("UC12345678901234567890")
        );
    }

    #[test]
    fn extracts_channel_id_from_youtube_url_and_page_json() {
        let expected = "UC12345678901234567890";
        assert_eq!(
            capture_channel_id(&format!(
                "https://www.youtube.com/channel/{expected}/videos"
            ))
            .as_deref(),
            Some(expected)
        );
        assert_eq!(
            capture_channel_id(&format!(r#"{{"externalId":"{expected}"}}"#)).as_deref(),
            Some(expected)
        );
    }

    #[test]
    fn uses_the_live_youtube_xml_feed_for_websub() {
        let channel_id = "UC12345678901234567890";
        let topic = format!("{YOUTUBE_FEED_URL_PREFIX}{channel_id}");
        assert_eq!(
            topic,
            "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UC12345678901234567890"
        );
    }
}
