use tauri::AppHandle;

use crate::services::telegram::{self, TelegramConfig, TelegramStatus};

#[tauri::command]
pub fn set_telegram_config(app: AppHandle, config: TelegramConfig) -> Result<(), String> {
    telegram::set_config(app, config);
    Ok(())
}

#[tauri::command]
pub fn get_telegram_status() -> TelegramStatus {
    telegram::get_status()
}

#[tauri::command]
pub async fn send_telegram_reply(
    chat_id: String,
    message_thread_id: Option<i64>,
    text: String,
) -> Result<(), String> {
    telegram::send_reply(chat_id, message_thread_id, text).await
}
