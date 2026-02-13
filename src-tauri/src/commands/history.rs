use crate::types::HistoryEntry;
use crate::database::{
    add_history_internal, get_history_from_db, delete_history_from_db,
    clear_history_from_db, get_history_count_from_db, update_history_summary,
    add_history_with_summary
};

#[tauri::command]
pub fn add_history(
    url: String,
    title: String,
    thumbnail: Option<String>,
    filepath: String,
    filesize: Option<u64>,
    duration: Option<u64>,
    quality: Option<String>,
    format: Option<String>,
    source: Option<String>,
) -> Result<String, String> {
    add_history_internal(url, title, thumbnail, filepath, filesize, duration, quality, format, source, None)
}

#[tauri::command]
pub fn update_summary(id: String, summary: String) -> Result<(), String> {
    update_history_summary(id, summary)
}

/// Add a summary-only history entry (for videos summarized without downloading)
#[tauri::command]
pub fn add_summary_only_history(
    url: String,
    title: String,
    thumbnail: Option<String>,
    duration: Option<u64>,
    source: Option<String>,
    summary: String,
) -> Result<String, String> {
    add_history_with_summary(url, title, thumbnail, duration, source, summary)
}

#[tauri::command]
pub fn get_history(
    limit: Option<i64>,
    offset: Option<i64>,
    source: Option<String>,
    search: Option<String>,
) -> Result<Vec<HistoryEntry>, String> {
    get_history_from_db(limit, offset, source, search)
}

#[tauri::command]
pub fn delete_history(id: String) -> Result<(), String> {
    delete_history_from_db(id)
}

#[tauri::command]
pub fn clear_history() -> Result<(), String> {
    clear_history_from_db()
}

#[tauri::command]
pub fn get_history_count(
    source: Option<String>,
    search: Option<String>,
) -> Result<i64, String> {
    get_history_count_from_db(source, search)
}

#[tauri::command]
pub fn check_file_exists(filepath: String) -> bool {
    std::path::Path::new(&filepath).exists()
}

#[tauri::command]
pub async fn open_file_location(filepath: String) -> Result<(), String> {
    let path = std::path::Path::new(&filepath);
    
    if !path.exists() {
        return Err("File not found".to_string());
    }
    
    let is_dir = path.is_dir();
    
    #[cfg(target_os = "macos")]
    {
        if is_dir {
            // Open directory directly in Finder
            tokio::process::Command::new("open")
                .arg(&filepath)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {}", e))?;
        } else {
            // Reveal file in Finder
            tokio::process::Command::new("open")
                .arg("-R")
                .arg(&filepath)
                .spawn()
                .map_err(|e| format!("Failed to open location: {}", e))?;
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        if is_dir {
            // Open directory in Explorer
            tokio::process::Command::new("explorer")
                .arg(&filepath)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {}", e))?;
        } else {
            // Select file in Explorer
            tokio::process::Command::new("explorer")
                .arg("/select,")
                .arg(&filepath)
                .spawn()
                .map_err(|e| format!("Failed to open location: {}", e))?;
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        if is_dir {
            // Open directory directly
            tokio::process::Command::new("xdg-open")
                .arg(&filepath)
                .spawn()
                .map_err(|e| format!("Failed to open folder: {}", e))?;
        } else {
            // Open parent directory (Linux doesn't have native file select)
            let dir = path.parent().unwrap_or(path);
            tokio::process::Command::new("xdg-open")
                .arg(dir)
                .spawn()
                .map_err(|e| format!("Failed to open location: {}", e))?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn open_macos_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Open Privacy & Security > Full Disk Access in System Settings
        // This URL scheme works on macOS Ventura (13.0) and later
        tokio::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
            .spawn()
            .map_err(|e| format!("Failed to open Privacy Settings: {}", e))?;
        return Ok(());
    }
    
    #[cfg(not(target_os = "macos"))]
    Err("This command is only available on macOS".to_string())
}
