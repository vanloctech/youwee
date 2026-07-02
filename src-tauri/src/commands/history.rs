use std::path::{Path, PathBuf};

use crate::database::{
    add_history_internal, add_history_with_summary, assign_history_collections_in_db,
    assign_history_tags_in_db, clear_history_from_db, create_collection_in_db,
    delete_collection_from_db, delete_history_from_db, get_collections_from_db,
    get_history_count_from_db, get_history_entries_by_ids_from_db, get_history_from_db,
    get_tags_from_db, remove_history_from_collection_in_db, remove_history_tag_from_db,
    rename_collection_in_db, update_history_filepath_and_title,
    update_history_filepath_and_title_by_id, update_history_summary,
};
use crate::types::{
    HistoryAdvancedFilters, HistoryCollection, HistoryEntry, HistorySort, HistoryTag,
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
    add_history_internal(
        url, title, thumbnail, filepath, filesize, duration, quality, format, source, None,
    )
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
    filters: Option<HistoryAdvancedFilters>,
    sort: Option<HistorySort>,
) -> Result<Vec<HistoryEntry>, String> {
    get_history_from_db(limit, offset, source, search, filters, sort)
}

#[tauri::command]
pub fn get_history_entries_by_ids(ids: Vec<String>) -> Result<Vec<HistoryEntry>, String> {
    get_history_entries_by_ids_from_db(ids)
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
    filters: Option<HistoryAdvancedFilters>,
) -> Result<i64, String> {
    get_history_count_from_db(source, search, filters)
}

#[tauri::command]
pub fn get_tags() -> Result<Vec<HistoryTag>, String> {
    get_tags_from_db()
}

#[tauri::command]
pub fn get_collections() -> Result<Vec<HistoryCollection>, String> {
    get_collections_from_db()
}

#[tauri::command]
pub fn create_collection(name: String, color: Option<String>) -> Result<HistoryCollection, String> {
    create_collection_in_db(name, color)
}

#[tauri::command]
pub fn rename_collection(id: String, name: String) -> Result<(), String> {
    rename_collection_in_db(id, name)
}

#[tauri::command]
pub fn delete_collection(id: String) -> Result<(), String> {
    delete_collection_from_db(id)
}

#[tauri::command]
pub fn assign_history_tags(history_id: String, tags: Vec<String>) -> Result<(), String> {
    assign_history_tags_in_db(history_id, tags)
}

#[tauri::command]
pub fn assign_history_collections(
    history_id: String,
    collection_ids: Vec<String>,
) -> Result<(), String> {
    assign_history_collections_in_db(history_id, collection_ids)
}

#[tauri::command]
pub fn remove_history_tag(history_id: String, tag_id: String) -> Result<(), String> {
    remove_history_tag_from_db(history_id, tag_id)
}

#[tauri::command]
pub fn remove_history_from_collection(
    history_id: String,
    collection_id: String,
) -> Result<(), String> {
    remove_history_from_collection_in_db(history_id, collection_id)
}

#[tauri::command]
pub fn check_file_exists(filepath: String) -> bool {
    std::path::Path::new(&filepath).exists()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameDownloadedFileResult {
    pub new_filepath: String,
    pub new_title: String,
}

fn validate_new_name(new_name: &str) -> Result<String, String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("File name cannot be empty".to_string());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("Invalid file name".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("File name cannot contain path separators".to_string());
    }
    if trimmed.contains('\0') {
        return Err("File name contains invalid null byte".to_string());
    }

    Ok(trimmed.to_string())
}

fn build_renamed_path(old_path: &Path, new_name: &str) -> Result<(PathBuf, String), String> {
    if !old_path.exists() {
        return Err("File not found".to_string());
    }
    if !old_path.is_file() {
        return Err("Target is not a file".to_string());
    }

    let validated_name = validate_new_name(new_name)?;

    let parent = old_path
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;

    let mut new_file_name = std::ffi::OsString::from(&validated_name);
    if let Some(ext) = old_path.extension().filter(|e| !e.is_empty()) {
        new_file_name.push(".");
        new_file_name.push(ext);
    }

    Ok((parent.join(new_file_name), validated_name))
}

#[tauri::command]
pub fn rename_downloaded_file(
    filepath: String,
    new_name: String,
    history_id: Option<String>,
) -> Result<RenameDownloadedFileResult, String> {
    let old_path = Path::new(&filepath);
    let (new_path, new_title) = build_renamed_path(old_path, &new_name)?;

    // No-op rename (same target path)
    if new_path == old_path {
        return Ok(RenameDownloadedFileResult {
            new_filepath: filepath,
            new_title,
        });
    }

    if new_path.exists() {
        return Err("A file with this name already exists".to_string());
    }

    std::fs::rename(old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))?;

    let new_filepath = new_path
        .to_str()
        .ok_or_else(|| "New file path contains invalid UTF-8".to_string())?
        .to_string();

    let update_result = if let Some(id) = history_id {
        update_history_filepath_and_title_by_id(id, new_filepath.clone(), new_title.clone())
    } else {
        update_history_filepath_and_title(filepath.clone(), new_filepath.clone(), new_title.clone())
    };

    if let Err(e) = update_result {
        // Best effort rollback to keep DB and filesystem consistent.
        let _ = std::fs::rename(&new_path, old_path);
        return Err(e);
    }

    Ok(RenameDownloadedFileResult {
        new_filepath,
        new_title,
    })
}

#[tauri::command]
pub fn sync_history_renamed_entry(
    id: String,
    filepath: String,
    title: String,
) -> Result<(), String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("File name cannot be empty".to_string());
    }

    update_history_filepath_and_title_by_id(id, filepath, trimmed_title.to_string())
}

#[tauri::command]
pub async fn open_file_location(filepath: String) -> Result<(), String> {
    let path = Path::new(&filepath);

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{db_test_guard, get_db, DB_CONNECTION};
    use rusqlite::params;
    use std::fs;
    use std::sync::Mutex;

    fn make_temp_file(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("youwee-history-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join(name);
        fs::write(&path, b"hello").expect("write temp file");
        path
    }

    #[test]
    fn build_renamed_path_keeps_extension() {
        let old = make_temp_file("video.mp4");
        let (new_path, new_title) =
            build_renamed_path(&old, "new video").expect("build renamed path");
        assert_eq!(new_title, "new video");
        assert_eq!(
            new_path.file_name().and_then(|s| s.to_str()),
            Some("new video.mp4")
        );
        let _ = fs::remove_file(&old);
        let _ = fs::remove_dir_all(old.parent().unwrap_or_else(|| Path::new("/")));
    }

    #[test]
    fn build_renamed_path_rejects_empty_name() {
        let old = make_temp_file("video.mp4");
        let err = build_renamed_path(&old, "  ").expect_err("expected empty name error");
        assert!(err.contains("cannot be empty"));
        let _ = fs::remove_file(&old);
        let _ = fs::remove_dir_all(old.parent().unwrap_or_else(|| Path::new("/")));
    }

    #[test]
    fn build_renamed_path_rejects_path_separator() {
        let old = make_temp_file("video.mp4");
        let err = build_renamed_path(&old, "bad/name").expect_err("expected separator error");
        assert!(err.contains("path separators"));
        let _ = fs::remove_file(&old);
        let _ = fs::remove_dir_all(old.parent().unwrap_or_else(|| Path::new("/")));
    }

    #[test]
    fn build_renamed_path_fails_for_missing_file() {
        let missing =
            std::env::temp_dir().join(format!("youwee-missing-{}.mp4", uuid::Uuid::new_v4()));
        let err = build_renamed_path(&missing, "new").expect_err("expected missing file error");
        assert!(err.contains("File not found"));
    }

    fn ensure_test_history_table() {
        if DB_CONNECTION.get().is_none() {
            let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
            let _ = DB_CONNECTION.set(Mutex::new(conn));
        }

        let conn = get_db().expect("get db");
        conn.execute(
            "CREATE TABLE IF NOT EXISTS history (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                thumbnail TEXT,
                filepath TEXT NOT NULL,
                filesize INTEGER,
                duration INTEGER,
                quality TEXT,
                format TEXT,
                source TEXT,
                downloaded_at INTEGER NOT NULL,
                summary TEXT,
                time_range TEXT
            )",
            [],
        )
        .expect("create history table");
        conn.execute("DELETE FROM history", [])
            .expect("clear history table");
    }

    #[test]
    fn rename_downloaded_file_updates_history_by_id() {
        let _guard = db_test_guard();
        ensure_test_history_table();
        let old = make_temp_file("video.mp4");
        let old_path = old.to_string_lossy().to_string();
        let history_id = uuid::Uuid::new_v4().to_string();

        {
            let conn = get_db().expect("get db");
            conn.execute(
                "INSERT INTO history (id, url, title, filepath, downloaded_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![history_id, "https://example.com/v", "video", old_path, 0_i64],
            )
            .expect("insert history row");
        }

        let result = rename_downloaded_file(
            old.to_string_lossy().to_string(),
            "renamed".to_string(),
            Some(history_id.clone()),
        )
        .expect("rename should succeed");

        let (db_title, db_filepath): (String, String) = {
            let conn = get_db().expect("get db");
            conn.query_row(
                "SELECT title, filepath FROM history WHERE id = ?1",
                params![history_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query updated history row")
        };

        assert_eq!(db_title, "renamed");
        assert_eq!(db_filepath, result.new_filepath);
        assert!(Path::new(&result.new_filepath).exists());

        let _ = fs::remove_file(&result.new_filepath);
        let _ = fs::remove_dir_all(
            Path::new(&result.new_filepath)
                .parent()
                .unwrap_or_else(|| Path::new("/")),
        );
    }

    #[test]
    fn rename_downloaded_file_updates_history_by_filepath_fallback() {
        let _guard = db_test_guard();
        ensure_test_history_table();
        let old = make_temp_file("movie.mkv");
        let old_path = old.to_string_lossy().to_string();
        let history_id = uuid::Uuid::new_v4().to_string();

        {
            let conn = get_db().expect("get db");
            conn.execute(
                "INSERT INTO history (id, url, title, filepath, downloaded_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![history_id, "https://example.com/m", "movie", old_path, 0_i64],
            )
            .expect("insert history row");
        }

        let result = rename_downloaded_file(
            old.to_string_lossy().to_string(),
            "movie-new".to_string(),
            None,
        )
        .expect("rename should succeed");

        let (db_title, db_filepath): (String, String) = {
            let conn = get_db().expect("get db");
            conn.query_row(
                "SELECT title, filepath FROM history WHERE id = ?1",
                params![history_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query updated history row")
        };

        assert_eq!(db_title, "movie-new");
        assert_eq!(db_filepath, result.new_filepath);
        assert!(Path::new(&result.new_filepath).exists());

        let _ = fs::remove_file(&result.new_filepath);
        let _ = fs::remove_dir_all(
            Path::new(&result.new_filepath)
                .parent()
                .unwrap_or_else(|| Path::new("/")),
        );
    }
}
