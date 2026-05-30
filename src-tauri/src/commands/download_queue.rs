use crate::database::{
    clear_download_queue_from_db, load_download_queue_from_db, save_download_queue_to_db,
};

#[tauri::command]
pub fn load_download_queue(queue_kind: String) -> Result<Option<String>, String> {
    load_download_queue_from_db(queue_kind)
}

#[tauri::command]
pub fn save_download_queue(queue_kind: String, items_json: String) -> Result<(), String> {
    save_download_queue_to_db(queue_kind, items_json)
}

#[tauri::command]
pub fn clear_download_queue(queue_kind: String) -> Result<(), String> {
    clear_download_queue_from_db(queue_kind)
}
