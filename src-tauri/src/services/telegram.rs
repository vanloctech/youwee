use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::types::ChannelVideo;

const TELEGRAM_API_BASE: &str = "https://api.telegram.org";
const LONG_POLL_TIMEOUT_SECS: u64 = 30;
const MAX_BACKOFF_SECS: u64 = 60;

static TELEGRAM_CONFIG: Mutex<TelegramConfig> = Mutex::new(TelegramConfig {
    enabled: false,
    bot_token: String::new(),
    allowed_chat_ids: Vec::new(),
    plain_url_action: TelegramPlainUrlAction::Download,
});
static TELEGRAM_STATUS: Mutex<TelegramStatus> = Mutex::new(TelegramStatus {
    state: TelegramStatusState::Disabled,
    message: None,
});
static TELEGRAM_POLLING_TASK: Mutex<Option<tauri::async_runtime::JoinHandle<()>>> =
    Mutex::new(None);
static TELEGRAM_GENERATION: AtomicU64 = AtomicU64::new(0);
static TELEGRAM_LAST_UPDATE_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelegramConfig {
    pub enabled: bool,
    pub bot_token: String,
    pub allowed_chat_ids: Vec<String>,
    #[serde(default)]
    pub plain_url_action: TelegramPlainUrlAction,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TelegramPlainUrlAction {
    Add,
    Download,
}

impl Default for TelegramPlainUrlAction {
    fn default() -> Self {
        Self::Download
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelegramStatus {
    pub state: TelegramStatusState,
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TelegramStatusState {
    Disabled,
    Running,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TelegramDownloadCommandEvent {
    command: String,
    url: Option<String>,
    quality: Option<String>,
    chat_id: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TelegramCommand {
    Add {
        url: String,
        quality: Option<String>,
    },
    Download {
        url: String,
        quality: Option<String>,
    },
    Status,
    Queue,
    Run,
    Stop,
    Help,
    Unsupported,
}

#[derive(Debug, Deserialize)]
struct TelegramApiResponse<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdate {
    update_id: u64,
    message: Option<TelegramMessage>,
    callback_query: Option<TelegramCallbackQuery>,
}

#[derive(Debug, Deserialize)]
struct TelegramCallbackQuery {
    id: String,
    data: Option<String>,
    message: Option<TelegramCallbackMessage>,
}

#[derive(Debug, Deserialize)]
struct TelegramCallbackMessage {
    chat: TelegramChat,
}

#[derive(Debug, Deserialize)]
struct TelegramMessage {
    chat: TelegramChat,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramChat {
    id: i64,
}

#[derive(Debug, Serialize)]
struct GetUpdatesRequest {
    timeout: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u64>,
    allowed_updates: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
struct SendMessageRequest<'a> {
    chat_id: &'a str,
    text: &'a str,
    disable_web_page_preview: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reply_markup: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct AnswerCallbackQueryRequest<'a> {
    callback_query_id: &'a str,
    text: &'a str,
}

#[derive(Debug, Clone, Serialize)]
struct ReplyKeyboardMarkup {
    keyboard: Vec<Vec<KeyboardButton>>,
    resize_keyboard: bool,
    is_persistent: bool,
}

#[derive(Debug, Clone, Serialize)]
struct KeyboardButton {
    text: &'static str,
}

#[derive(Debug, Serialize)]
struct SetMyCommandsRequest {
    commands: Vec<BotCommand>,
}

#[derive(Debug, Serialize)]
struct BotCommand {
    command: &'static str,
    description: &'static str,
}

pub fn set_config(app: AppHandle, config: TelegramConfig) -> Result<(), String> {
    let sanitized = sanitize_config(config);
    persist_config(&sanitized)?;
    match TELEGRAM_CONFIG.lock() {
        Ok(mut guard) => {
            if *guard == sanitized {
                return Ok(());
            }
            if guard.bot_token != sanitized.bot_token {
                TELEGRAM_LAST_UPDATE_ID.store(0, Ordering::SeqCst);
            }
            *guard = sanitized.clone();
        }
        Err(_) => {
            if set_status(
                TelegramStatusState::Error,
                Some("Failed to update Telegram config.".to_string()),
            ) {
                crate::rebuild_tray_menu(&app);
            }
            return Err("Failed to update Telegram config.".to_string());
        }
    }

    let generation = TELEGRAM_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    abort_polling_task();

    if !sanitized.enabled {
        if set_status(TelegramStatusState::Disabled, None) {
            crate::rebuild_tray_menu(&app);
        }
        return Ok(());
    }

    if sanitized.bot_token.is_empty() {
        if set_status(
            TelegramStatusState::Error,
            Some("Telegram bot token is required.".to_string()),
        ) {
            crate::rebuild_tray_menu(&app);
        }
        return Ok(());
    }

    if sanitized.allowed_chat_ids.is_empty() {
        if set_status(
            TelegramStatusState::Error,
            Some("At least one allowed chat ID is required.".to_string()),
        ) {
            crate::rebuild_tray_menu(&app);
        }
        return Ok(());
    }

    if set_status(TelegramStatusState::Running, None) {
        crate::rebuild_tray_menu(&app);
    }
    let bot_token = sanitized.bot_token.clone();
    let command_app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = set_my_commands(&Client::new(), &bot_token).await {
            if set_status(TelegramStatusState::Error, Some(error)) {
                crate::rebuild_tray_menu(&command_app);
            }
        }
    });
    replace_polling_task(tauri::async_runtime::spawn(run_polling_loop(
        app, sanitized, generation,
    )));
    Ok(())
}

fn persist_config(config: &TelegramConfig) -> Result<(), String> {
    let conn = crate::database::get_db()?;
    let value_json = serde_json::to_string(config)
        .map_err(|error| format!("Failed to serialize Telegram config: {error}"))?;
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at) VALUES ('telegram', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        rusqlite::params![value_json, chrono::Utc::now().to_rfc3339()],
    )
    .map_err(|error| format!("Failed to persist Telegram config: {error}"))?;
    Ok(())
}

pub fn get_config() -> TelegramConfig {
    TELEGRAM_CONFIG
        .lock()
        .map(|config| config.clone())
        .unwrap_or(TelegramConfig {
            enabled: false,
            bot_token: String::new(),
            allowed_chat_ids: Vec::new(),
            plain_url_action: TelegramPlainUrlAction::Download,
        })
}

pub fn load_persisted_config(app: AppHandle) -> Result<bool, String> {
    // Release the database mutex before set_config persists the sanitized value.
    // Keeping this guard alive across set_config would attempt to lock the same
    // non-reentrant mutex twice and freeze the app during startup.
    let value_json = {
        let conn = crate::database::get_db()?;
        match conn.query_row(
            "SELECT value_json FROM app_settings WHERE key = 'telegram'",
            [],
            |row| row.get::<_, String>(0),
        ) {
            Ok(value) => value,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(false),
            Err(error) => return Err(format!("Failed to load Telegram config: {error}")),
        }
    };
    let config = serde_json::from_str::<TelegramConfig>(&value_json)
        .map_err(|error| format!("Failed to parse Telegram config: {error}"))?;
    set_config(app, config)?;
    Ok(true)
}

pub fn get_status() -> TelegramStatus {
    TELEGRAM_STATUS
        .lock()
        .map(|status| status.clone())
        .unwrap_or(TelegramStatus {
            state: TelegramStatusState::Error,
            message: Some("Telegram status is unavailable.".to_string()),
        })
}

pub async fn send_reply(chat_id: String, text: String) -> Result<(), String> {
    let config = TELEGRAM_CONFIG
        .lock()
        .map(|guard| guard.clone())
        .map_err(|_| "Failed to read Telegram config.".to_string())?;

    if !config.enabled || config.bot_token.is_empty() {
        return Err("Telegram is not configured.".to_string());
    }

    send_message_with_keyboard(&Client::new(), &config.bot_token, &chat_id, &text).await
}

/// Notify every configured Telegram chat about videos discovered by channel
/// polling. This is deliberately kept in the Rust service so notifications
/// still work when no download page is currently open in the frontend.
pub async fn send_new_video_notification(
    channel_name: &str,
    videos: &[ChannelVideo],
) -> Result<(), String> {
    let config = TELEGRAM_CONFIG
        .lock()
        .map(|guard| guard.clone())
        .map_err(|_| "Failed to read Telegram config.".to_string())?;

    if !config.enabled || config.bot_token.is_empty() || config.allowed_chat_ids.is_empty() {
        return Ok(());
    }
    if videos.is_empty() {
        return Ok(());
    }

    // Keep one notification comfortably below Telegram's message size limit
    // while still including direct links to the discovered videos.
    let mut lines = videos
        .iter()
        .take(10)
        .map(|video| format!("• {}\n{}", video.title, video.url))
        .collect::<Vec<_>>();
    if videos.len() > lines.len() {
        lines.push(format!("…and {} more", videos.len() - lines.len()));
    }
    let text = format!(
        "🆕 {}: {} new video{}\n\n{}",
        channel_name,
        videos.len(),
        if videos.len() == 1 { "" } else { "s" },
        lines.join("\n\n")
    );

    let client = Client::new();
    let mut first_error = None;
    for chat_id in config.allowed_chat_ids {
        if let Err(error) =
            send_message_with_keyboard(&client, &config.bot_token, &chat_id, &text).await
        {
            log::warn!("Failed to notify Telegram chat {}: {}", chat_id, error);
            if first_error.is_none() {
                first_error = Some(error);
            }
        }
    }

    first_error.map_or(Ok(()), Err)
}

pub async fn send_channel_media_ready_notification(
    channel_id: &str,
    channel_name: &str,
    video_id: &str,
    title: &str,
    filepath: &str,
    edited: bool,
) -> Result<(), String> {
    let config = get_config();
    if !config.enabled || config.bot_token.is_empty() || config.allowed_chat_ids.is_empty() {
        return Ok(());
    }

    let action_id = uuid::Uuid::new_v4().simple().to_string()[..16].to_string();
    {
        let conn = crate::database::get_db()?;
        conn.execute(
            "INSERT INTO telegram_media_actions (id, channel_id, video_id, filepath, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                action_id,
                channel_id,
                video_id,
                filepath,
                chrono::Utc::now().timestamp()
            ],
        )
        .map_err(|error| format!("Failed to save Telegram media action: {error}"))?;
        conn.execute(
            "DELETE FROM telegram_media_actions WHERE created_at < ?1",
            rusqlite::params![chrono::Utc::now().timestamp() - 30 * 24 * 60 * 60],
        )
        .ok();
    }

    let text = if edited {
        format!("✅ Đã tải và edit xong\n{}\n{}", channel_name, title)
    } else {
        format!("✅ Đã tải xong\n{}\n{}", channel_name, title)
    };
    let reply_markup = serde_json::json!({
        "inline_keyboard": [[{
            "text": "📂 Mở video trên máy Youwee",
            "callback_data": format!("open_media:{action_id}")
        }]]
    });
    let client = Client::new();
    let mut first_error = None;
    for chat_id in config.allowed_chat_ids {
        if let Err(error) = send_message_with_reply_markup(
            &client,
            &config.bot_token,
            &chat_id,
            &text,
            Some(reply_markup.clone()),
        )
        .await
        {
            if first_error.is_none() {
                first_error = Some(error);
            }
        }
    }
    first_error.map_or(Ok(()), Err)
}

/// Send a small diagnostic message to every configured chat. This exercises
/// the same bot token, allow-list, and Telegram API path used by notifications.
pub async fn send_test_notification() -> Result<(), String> {
    let config = TELEGRAM_CONFIG
        .lock()
        .map(|guard| guard.clone())
        .map_err(|_| "Failed to read Telegram config.".to_string())?;

    if !config.enabled || config.bot_token.is_empty() || config.allowed_chat_ids.is_empty() {
        return Err(
            "Telegram is not configured. Enable it and add a bot token and chat ID.".to_string(),
        );
    }

    let client = Client::new();
    let text = "✅ Youwee Telegram connection test succeeded.";
    let mut first_error = None;
    for chat_id in config.allowed_chat_ids {
        if let Err(error) =
            send_message_with_keyboard(&client, &config.bot_token, &chat_id, text).await
        {
            log::warn!(
                "Failed to send Telegram test message to {}: {}",
                chat_id,
                error
            );
            if first_error.is_none() {
                first_error = Some(error);
            }
        }
    }

    first_error.map_or(Ok(()), Err)
}

fn sanitize_config(config: TelegramConfig) -> TelegramConfig {
    let mut seen = HashSet::new();
    let allowed_chat_ids = config
        .allowed_chat_ids
        .into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty() && id.parse::<i64>().is_ok())
        .filter(|id| seen.insert(id.clone()))
        .collect();

    TelegramConfig {
        enabled: config.enabled,
        bot_token: config.bot_token.trim().to_string(),
        allowed_chat_ids,
        plain_url_action: config.plain_url_action,
    }
}

fn abort_polling_task() {
    if let Ok(mut task) = TELEGRAM_POLLING_TASK.lock() {
        if let Some(handle) = task.take() {
            handle.abort();
        }
    }
}

fn replace_polling_task(handle: tauri::async_runtime::JoinHandle<()>) {
    if let Ok(mut task) = TELEGRAM_POLLING_TASK.lock() {
        if let Some(previous) = task.replace(handle) {
            previous.abort();
        }
    }
}

async fn run_polling_loop(app: AppHandle, config: TelegramConfig, generation: u64) {
    let client = Client::new();
    let allowed_chat_ids: HashSet<String> = config.allowed_chat_ids.iter().cloned().collect();
    let mut backoff_secs = 2;

    loop {
        if TELEGRAM_GENERATION.load(Ordering::SeqCst) != generation {
            break;
        }

        let offset = TELEGRAM_LAST_UPDATE_ID
            .load(Ordering::SeqCst)
            .checked_add(1)
            .filter(|value| *value > 1);

        match fetch_updates(&client, &config.bot_token, offset).await {
            Ok(updates) => {
                backoff_secs = 2;
                if set_status(TelegramStatusState::Running, None) {
                    crate::rebuild_tray_menu(&app);
                }

                for update in updates {
                    TELEGRAM_LAST_UPDATE_ID.fetch_max(update.update_id, Ordering::SeqCst);
                    if TELEGRAM_GENERATION.load(Ordering::SeqCst) != generation {
                        break;
                    }
                    handle_update(
                        &app,
                        &client,
                        &config.bot_token,
                        &allowed_chat_ids,
                        &config.plain_url_action,
                        update,
                    )
                    .await;
                }
            }
            Err(error) => {
                if set_status(TelegramStatusState::Error, Some(error)) {
                    crate::rebuild_tray_menu(&app);
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(backoff_secs)).await;
                backoff_secs = (backoff_secs * 2).min(MAX_BACKOFF_SECS);
            }
        }
    }
}

async fn fetch_updates(
    client: &Client,
    bot_token: &str,
    offset: Option<u64>,
) -> Result<Vec<TelegramUpdate>, String> {
    let url = format!("{}/bot{}/getUpdates", TELEGRAM_API_BASE, bot_token);
    let request = GetUpdatesRequest {
        timeout: LONG_POLL_TIMEOUT_SECS,
        offset,
        allowed_updates: vec!["message", "callback_query"],
    };

    let response = client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Telegram network error: {}", e))?;

    let body = response
        .json::<TelegramApiResponse<Vec<TelegramUpdate>>>()
        .await
        .map_err(|e| format!("Failed to parse Telegram response: {}", e))?;

    if !body.ok {
        return Err(body
            .description
            .unwrap_or_else(|| "Telegram API returned an error.".to_string()));
    }

    Ok(body.result.unwrap_or_default())
}

async fn handle_update(
    app: &AppHandle,
    client: &Client,
    bot_token: &str,
    allowed_chat_ids: &HashSet<String>,
    plain_url_action: &TelegramPlainUrlAction,
    update: TelegramUpdate,
) {
    if let Some(callback) = update.callback_query {
        handle_callback_query(app, client, bot_token, allowed_chat_ids, callback).await;
        return;
    }
    let Some(message) = update.message else {
        return;
    };
    let chat_id = message.chat.id.to_string();
    if !allowed_chat_ids.contains(&chat_id) {
        return;
    }

    let Some(text) = message.text.as_deref() else {
        return;
    };

    match parse_command_with_plain_url_action(text, plain_url_action) {
        TelegramCommand::Add { url, quality } => {
            emit_url_command(app, "add", &url, quality.as_deref(), &chat_id);
        }
        TelegramCommand::Download { url, quality } => {
            emit_url_command(app, "download", &url, quality.as_deref(), &chat_id);
        }
        TelegramCommand::Status => {
            emit_simple_command(app, "status", &chat_id);
        }
        TelegramCommand::Queue => {
            emit_simple_command(app, "queue", &chat_id);
        }
        TelegramCommand::Run => {
            emit_simple_command(app, "run", &chat_id);
        }
        TelegramCommand::Stop => {
            emit_simple_command(app, "stop", &chat_id);
        }
        TelegramCommand::Help => {
            let _ = send_message_with_keyboard(client, bot_token, &chat_id, help_text()).await;
        }
        TelegramCommand::Unsupported => {
            let _ = send_message_with_keyboard(
                client,
                bot_token,
                &chat_id,
                "Unsupported command. Use /help to see available commands.",
            )
            .await;
        }
    }
}

async fn handle_callback_query(
    app: &AppHandle,
    client: &Client,
    bot_token: &str,
    allowed_chat_ids: &HashSet<String>,
    callback: TelegramCallbackQuery,
) {
    let Some(message) = callback.message else {
        return;
    };
    let chat_id = message.chat.id.to_string();
    if !allowed_chat_ids.contains(&chat_id) {
        return;
    }
    let Some(action_id) = callback
        .data
        .as_deref()
        .and_then(|value| value.strip_prefix("open_media:"))
    else {
        return;
    };
    let action = crate::database::get_db().and_then(|conn| {
        conn.query_row(
            "SELECT channel_id, filepath FROM telegram_media_actions WHERE id = ?1",
            rusqlite::params![action_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| format!("Media action not found: {error}"))
    });
    let answer = match action {
        Ok((channel_id, filepath)) => {
            crate::show_main_window(app);
            let _ = app.emit(
                "telegram-open-channel-media",
                serde_json::json!({ "channelId": channel_id, "filepath": filepath }),
            );
            "Đã mở video trên máy Youwee."
        }
        Err(_) => "Video không còn trong lịch sử Youwee.",
    };
    let url = format!("{}/bot{}/answerCallbackQuery", TELEGRAM_API_BASE, bot_token);
    let _ = client
        .post(url)
        .json(&AnswerCallbackQueryRequest {
            callback_query_id: &callback.id,
            text: answer,
        })
        .send()
        .await;
}

fn emit_url_command(
    app: &AppHandle,
    command: &str,
    url: &str,
    quality: Option<&str>,
    chat_id: &str,
) {
    let _ = app.emit(
        "telegram-download-command",
        TelegramDownloadCommandEvent {
            command: command.to_string(),
            url: Some(url.to_string()),
            quality: quality.map(ToString::to_string),
            chat_id: chat_id.to_string(),
        },
    );
}

fn emit_simple_command(app: &AppHandle, command: &str, chat_id: &str) {
    let _ = app.emit(
        "telegram-download-command",
        TelegramDownloadCommandEvent {
            command: command.to_string(),
            url: None,
            quality: None,
            chat_id: chat_id.to_string(),
        },
    );
}

async fn send_message_with_keyboard(
    client: &Client,
    bot_token: &str,
    chat_id: &str,
    text: &str,
) -> Result<(), String> {
    send_message_with_reply_markup(
        client,
        bot_token,
        chat_id,
        text,
        serde_json::to_value(command_keyboard()).ok(),
    )
    .await
}

async fn send_message_with_reply_markup(
    client: &Client,
    bot_token: &str,
    chat_id: &str,
    text: &str,
    reply_markup: Option<serde_json::Value>,
) -> Result<(), String> {
    let url = format!("{}/bot{}/sendMessage", TELEGRAM_API_BASE, bot_token);
    let response = client
        .post(url)
        .json(&SendMessageRequest {
            chat_id,
            text,
            disable_web_page_preview: true,
            reply_markup,
        })
        .send()
        .await
        .map_err(|e| format!("Telegram network error: {}", e))?;

    let body = response
        .json::<TelegramApiResponse<serde_json::Value>>()
        .await
        .map_err(|e| format!("Failed to parse Telegram response: {}", e))?;

    if body.ok {
        Ok(())
    } else {
        Err(body
            .description
            .unwrap_or_else(|| "Telegram API returned an error.".to_string()))
    }
}

fn command_keyboard() -> ReplyKeyboardMarkup {
    ReplyKeyboardMarkup {
        keyboard: vec![
            vec![
                KeyboardButton {
                    text: "📊 Status"
                },
                KeyboardButton { text: "📋 Queue" },
            ],
            vec![
                KeyboardButton {
                    text: "▶️ Run Queue",
                },
                KeyboardButton { text: "⏹ Stop" },
            ],
            vec![KeyboardButton { text: "💡 Help" }],
        ],
        resize_keyboard: true,
        is_persistent: true,
    }
}

async fn set_my_commands(client: &Client, bot_token: &str) -> Result<(), String> {
    let url = format!("{}/bot{}/setMyCommands", TELEGRAM_API_BASE, bot_token);
    let response = client
        .post(url)
        .json(&SetMyCommandsRequest {
            commands: vec![
                BotCommand {
                    command: "start",
                    description: "Show command keyboard",
                },
                BotCommand {
                    command: "add",
                    description: "Add a URL to the queue",
                },
                BotCommand {
                    command: "download",
                    description: "Add a URL and start downloading",
                },
                BotCommand {
                    command: "status",
                    description: "Show download status",
                },
                BotCommand {
                    command: "queue",
                    description: "Show recent queue items",
                },
                BotCommand {
                    command: "run",
                    description: "Start pending downloads",
                },
                BotCommand {
                    command: "stop",
                    description: "Stop the current download",
                },
                BotCommand {
                    command: "help",
                    description: "Show available commands",
                },
            ],
        })
        .send()
        .await
        .map_err(|e| format!("Telegram network error: {}", e))?;

    let body = response
        .json::<TelegramApiResponse<serde_json::Value>>()
        .await
        .map_err(|e| format!("Failed to parse Telegram response: {}", e))?;

    if body.ok {
        Ok(())
    } else {
        Err(body
            .description
            .unwrap_or_else(|| "Telegram API returned an error.".to_string()))
    }
}

fn set_status(state: TelegramStatusState, message: Option<String>) -> bool {
    if let Ok(mut status) = TELEGRAM_STATUS.lock() {
        if status.state == state && status.message == message {
            return false;
        }
        *status = TelegramStatus { state, message };
        return true;
    }
    false
}

fn help_text() -> &'static str {
    "Youwee Telegram commands:\n/start - Show command keyboard.\n/add <url> [quality] - Add a URL to the queue.\n/download <url> [quality] - Add a URL and start downloading when idle.\n/status - Show download status.\n/queue - Show recent queue items.\n/run - Start pending downloads.\n/stop - Stop the current download.\n/help - Show this help.\n\nYou can also send a link directly.\nQuality: best, 8k, 4k, 2k, 1080, 720, 480, 360, audio, mp3."
}

pub fn parse_command(text: &str) -> TelegramCommand {
    parse_command_with_plain_url_action(text, &TelegramPlainUrlAction::Download)
}

fn parse_command_with_plain_url_action(
    text: &str,
    plain_url_action: &TelegramPlainUrlAction,
) -> TelegramCommand {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return TelegramCommand::Unsupported;
    }

    let mut parts = trimmed.split_whitespace();
    let command = parts
        .find(|part| part.chars().any(|c| c.is_ascii_alphanumeric()) || part.starts_with('/'))
        .unwrap_or_default();
    let command = command.split('@').next().unwrap_or(command).to_lowercase();

    match command.as_str() {
        "/help" | "help" => TelegramCommand::Help,
        "/start" | "start" => TelegramCommand::Help,
        "/status" | "status" => TelegramCommand::Status,
        "/queue" | "queue" => TelegramCommand::Queue,
        "/run" | "run" => TelegramCommand::Run,
        "/stop" | "stop" => TelegramCommand::Stop,
        "/add" | "add" => parts
            .next()
            .map(|url| TelegramCommand::Add {
                url: url.to_string(),
                quality: parts.next().map(|quality| quality.to_string()),
            })
            .unwrap_or(TelegramCommand::Unsupported),
        "/download" | "download" => parts
            .next()
            .map(|url| TelegramCommand::Download {
                url: url.to_string(),
                quality: parts.next().map(|quality| quality.to_string()),
            })
            .unwrap_or(TelegramCommand::Unsupported),
        _ => parse_plain_url_command(trimmed, plain_url_action)
            .unwrap_or(TelegramCommand::Unsupported),
    }
}

fn parse_plain_url_command(
    text: &str,
    plain_url_action: &TelegramPlainUrlAction,
) -> Option<TelegramCommand> {
    let tokens: Vec<&str> = text.split_whitespace().collect();
    let (index, url) = tokens.iter().enumerate().find_map(|(index, token)| {
        let cleaned = clean_plain_url_token(token);
        if cleaned.starts_with("http://") || cleaned.starts_with("https://") {
            Some((index, cleaned.to_string()))
        } else {
            None
        }
    })?;

    let quality = tokens
        .get(index + 1)
        .map(|token| clean_plain_url_token(token))
        .filter(|token| !token.is_empty())
        .map(ToString::to_string);

    Some(match plain_url_action {
        TelegramPlainUrlAction::Add => TelegramCommand::Add { url, quality },
        TelegramPlainUrlAction::Download => TelegramCommand::Download { url, quality },
    })
}

fn clean_plain_url_token(token: &str) -> &str {
    token
        .trim_matches(|c: char| {
            matches!(
                c,
                '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\'' | ',' | ';'
            )
        })
        .trim_end_matches(|c: char| matches!(c, '.' | '!' | '?'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_help_commands() {
        assert_eq!(parse_command("/help"), TelegramCommand::Help);
        assert_eq!(parse_command("/help@youwee_bot"), TelegramCommand::Help);
        assert_eq!(parse_command("/start"), TelegramCommand::Help);
    }

    #[test]
    fn parses_control_commands() {
        assert_eq!(parse_command("/status"), TelegramCommand::Status);
        assert_eq!(parse_command("Status"), TelegramCommand::Status);
        assert_eq!(parse_command("📊 Status"), TelegramCommand::Status);
        assert_eq!(parse_command("/queue@youwee_bot"), TelegramCommand::Queue);
        assert_eq!(parse_command("Queue"), TelegramCommand::Queue);
        assert_eq!(parse_command("📋 Queue"), TelegramCommand::Queue);
        assert_eq!(parse_command("/run"), TelegramCommand::Run);
        assert_eq!(parse_command("Run Queue"), TelegramCommand::Run);
        assert_eq!(parse_command("▶️ Run Queue"), TelegramCommand::Run);
        assert_eq!(parse_command("⏹ Stop"), TelegramCommand::Stop);
        assert_eq!(parse_command("stop"), TelegramCommand::Stop);
    }

    #[test]
    fn parses_add_command() {
        assert_eq!(
            parse_command("  /add   https://example.com/video  "),
            TelegramCommand::Add {
                url: "https://example.com/video".to_string(),
                quality: None
            }
        );
        assert_eq!(
            parse_command("/add https://example.com/video 720"),
            TelegramCommand::Add {
                url: "https://example.com/video".to_string(),
                quality: Some("720".to_string())
            }
        );
    }

    #[test]
    fn parses_download_command() {
        assert_eq!(
            parse_command("/download https://example.com/video"),
            TelegramCommand::Download {
                url: "https://example.com/video".to_string(),
                quality: None
            }
        );
        assert_eq!(
            parse_command("/download https://example.com/video audio"),
            TelegramCommand::Download {
                url: "https://example.com/video".to_string(),
                quality: Some("audio".to_string())
            }
        );
    }

    #[test]
    fn rejects_missing_url() {
        assert_eq!(parse_command("/add"), TelegramCommand::Unsupported);
        assert_eq!(parse_command("/download"), TelegramCommand::Unsupported);
    }

    #[test]
    fn sanitizes_allowed_chat_ids() {
        let config = sanitize_config(TelegramConfig {
            enabled: true,
            bot_token: " token ".to_string(),
            allowed_chat_ids: vec![
                "123".to_string(),
                "abc".to_string(),
                "123".to_string(),
                "-456".to_string(),
            ],
            plain_url_action: TelegramPlainUrlAction::Download,
        });

        assert_eq!(config.bot_token, "token");
        assert_eq!(config.allowed_chat_ids, vec!["123", "-456"]);
    }

    #[test]
    fn parses_plain_url_as_download_by_default() {
        assert_eq!(
            parse_command("https://example.com/video 720"),
            TelegramCommand::Download {
                url: "https://example.com/video".to_string(),
                quality: Some("720".to_string())
            }
        );
        assert_eq!(
            parse_command("Check this https://example.com/video."),
            TelegramCommand::Download {
                url: "https://example.com/video".to_string(),
                quality: None
            }
        );
    }

    #[test]
    fn parses_plain_url_as_add_when_configured() {
        assert_eq!(
            parse_command_with_plain_url_action(
                "https://example.com/video audio",
                &TelegramPlainUrlAction::Add,
            ),
            TelegramCommand::Add {
                url: "https://example.com/video".to_string(),
                quality: Some("audio".to_string())
            }
        );
    }

    #[test]
    fn computes_next_update_offset() {
        TELEGRAM_LAST_UPDATE_ID.store(41, Ordering::SeqCst);
        let offset = TELEGRAM_LAST_UPDATE_ID
            .load(Ordering::SeqCst)
            .checked_add(1)
            .filter(|value| *value > 1);
        assert_eq!(offset, Some(42));
    }
}
