use crate::database::{
    add_log_internal, clear_logs_from_db, export_logs_from_db, get_logs_from_db,
};
use crate::types::LogEntry;

#[tauri::command]
pub fn get_logs(
    filter: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LogEntry>, String> {
    get_logs_from_db(filter, search, limit)
}

#[tauri::command]
pub fn add_log(
    log_type: String,
    message: String,
    details: Option<String>,
    url: Option<String>,
) -> Result<LogEntry, String> {
    add_log_internal(&log_type, &message, details.as_deref(), url.as_deref())
}

#[tauri::command]
pub fn clear_logs() -> Result<(), String> {
    clear_logs_from_db()
}

#[tauri::command]
pub fn export_logs() -> Result<String, String> {
    export_logs_from_db()
}
