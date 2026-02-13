use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// Global database connection wrapped in Mutex for thread safety
pub static DB_CONNECTION: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();

pub const MAX_LOG_ENTRIES: i64 = 500;

/// Initialize the SQLite database
pub fn init_database(app: &AppHandle) -> Result<(), String> {
    if DB_CONNECTION.get().is_some() {
        return Ok(());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let db_path = app_data_dir.join("logs.db");

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // Create logs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            log_type TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT,
            url TEXT,
            created_at INTEGER NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create logs table: {}", e))?;

    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(log_type)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC)",
        [],
    )
    .ok();

    // Create history table
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
            summary TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create history table: {}", e))?;

    // Migration: Add summary column if it doesn't exist
    conn.execute("ALTER TABLE history ADD COLUMN summary TEXT", [])
        .ok(); // Ignore error if column already exists

    // Create history indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_downloaded ON history(downloaded_at DESC)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_source ON history(source)",
        [],
    )
    .ok();

    // Create processing_jobs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS processing_jobs (
            id TEXT PRIMARY KEY,
            input_path TEXT NOT NULL,
            output_path TEXT,
            task_type TEXT NOT NULL,
            user_prompt TEXT,
            ffmpeg_command TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            progress REAL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create processing_jobs table: {}", e))?;

    // Create processing_presets table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS processing_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            task_type TEXT NOT NULL,
            prompt_template TEXT NOT NULL,
            icon TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create processing_presets table: {}", e))?;

    // Create processing indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_processing_jobs_created ON processing_jobs(created_at DESC)",
        [],
    )
    .ok();

    // Create followed_channels table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS followed_channels (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            thumbnail TEXT,
            platform TEXT NOT NULL DEFAULT 'youtube',
            last_checked_at TEXT,
            last_video_id TEXT,
            check_interval INTEGER NOT NULL DEFAULT 15,
            auto_download INTEGER NOT NULL DEFAULT 0,
            download_quality TEXT NOT NULL DEFAULT 'best',
            download_format TEXT NOT NULL DEFAULT 'mp4',
            created_at TEXT NOT NULL,
            filter_min_duration INTEGER,
            filter_max_duration INTEGER,
            filter_include_keywords TEXT,
            filter_exclude_keywords TEXT,
            filter_max_videos INTEGER,
            download_threads INTEGER NOT NULL DEFAULT 1,
            download_video_codec TEXT NOT NULL DEFAULT 'h264',
            download_audio_bitrate TEXT NOT NULL DEFAULT '192'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create followed_channels table: {}", e))?;

    // Create channel_videos table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS channel_videos (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            thumbnail TEXT,
            duration REAL,
            upload_date TEXT,
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL,
            FOREIGN KEY (channel_id) REFERENCES followed_channels(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create channel_videos table: {}", e))?;

    // Create channel indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_channel_videos_channel ON channel_videos(channel_id)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_channel_videos_status ON channel_videos(status)",
        [],
    )
    .ok();

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_videos_unique ON channel_videos(channel_id, video_id)",
        [],
    )
    .ok();

    // Migration: Add download_threads column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_threads INTEGER NOT NULL DEFAULT 1",
        [],
    )
    .ok();

    // Migration: Add download_video_codec column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_video_codec TEXT NOT NULL DEFAULT 'h264'",
        [],
    )
    .ok();

    // Migration: Add download_audio_bitrate column if it doesn't exist
    conn.execute(
        "ALTER TABLE followed_channels ADD COLUMN download_audio_bitrate TEXT NOT NULL DEFAULT '192'",
        [],
    )
    .ok();

    DB_CONNECTION
        .set(Mutex::new(conn))
        .map_err(|_| "Database already initialized".to_string())?;

    Ok(())
}

/// Get database connection
pub fn get_db() -> Result<std::sync::MutexGuard<'static, Connection>, String> {
    DB_CONNECTION
        .get()
        .ok_or_else(|| "Database not initialized".to_string())?
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))
}
