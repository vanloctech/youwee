use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use rusqlite::{Connection, params};
use chrono::Utc;

static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

// Global database connection wrapped in Mutex for thread safety
static DB_CONNECTION: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();

const MAX_LOG_ENTRIES: i64 = 500;

/// Log entry structure
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub log_type: String,  // "command" | "success" | "error" | "stderr" | "info"
    pub message: String,
    pub details: Option<String>,
    pub url: Option<String>,
}

/// History entry structure
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub filepath: String,
    pub filesize: Option<u64>,
    pub duration: Option<u64>,
    pub quality: Option<String>,
    pub format: Option<String>,
    pub source: Option<String>,  // "youtube", "tiktok", etc.
    pub downloaded_at: String,
    pub file_exists: bool,
}

/// Initialize the SQLite database
fn init_database(app: &AppHandle) -> Result<(), String> {
    if DB_CONNECTION.get().is_some() {
        return Ok(());
    }
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    
    let db_path = app_data_dir.join("logs.db");
    
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
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
    ).map_err(|e| format!("Failed to create logs table: {}", e))?;
    
    // Create indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(log_type)",
        [],
    ).ok();
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC)",
        [],
    ).ok();
    
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
            downloaded_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create history table: {}", e))?;
    
    // Create history indexes
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_downloaded ON history(downloaded_at DESC)",
        [],
    ).ok();
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_source ON history(source)",
        [],
    ).ok();
    
    DB_CONNECTION.set(Mutex::new(conn))
        .map_err(|_| "Database already initialized".to_string())?;
    
    Ok(())
}

/// Get database connection
fn get_db() -> Result<std::sync::MutexGuard<'static, Connection>, String> {
    DB_CONNECTION.get()
        .ok_or_else(|| "Database not initialized".to_string())?
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))
}

/// Add a log entry to the database
fn add_log_internal(
    log_type: &str,
    message: &str,
    details: Option<&str>,
    url: Option<&str>,
) -> Result<LogEntry, String> {
    let conn = get_db()?;
    
    let id = uuid::Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();
    let created_at = Utc::now().timestamp();
    
    conn.execute(
        "INSERT INTO logs (id, timestamp, log_type, message, details, url, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, timestamp, log_type, message, details, url, created_at],
    ).map_err(|e| format!("Failed to insert log: {}", e))?;
    
    // Prune old entries if exceeding limit
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM logs",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    
    if count > MAX_LOG_ENTRIES {
        let to_delete = count - MAX_LOG_ENTRIES;
        conn.execute(
            "DELETE FROM logs WHERE id IN (
                SELECT id FROM logs ORDER BY created_at ASC LIMIT ?1
            )",
            params![to_delete],
        ).ok();
    }
    
    Ok(LogEntry {
        id,
        timestamp,
        log_type: log_type.to_string(),
        message: message.to_string(),
        details: details.map(|s| s.to_string()),
        url: url.map(|s| s.to_string()),
    })
}

/// Add a history entry (internal use)
fn add_history_internal(
    url: String,
    title: String,
    thumbnail: Option<String>,
    filepath: String,
    filesize: Option<u64>,
    duration: Option<u64>,
    quality: Option<String>,
    format: Option<String>,
    source: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    
    // Get max entries from default (500)
    let max_entries: i64 = 500;
    
    conn.execute(
        "INSERT OR REPLACE INTO history (id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, now],
    ).map_err(|e| format!("Failed to add history: {}", e))?;
    
    // Prune old entries
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY downloaded_at DESC LIMIT ?1)",
        params![max_entries],
    ).ok();
    
    Ok(())
}

/// Get logs from database with optional filters
#[tauri::command]
fn get_logs(
    filter: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LogEntry>, String> {
    let conn = get_db()?;
    
    let limit = limit.unwrap_or(100).min(500);
    
    // Build query dynamically
    let filter_active = filter.as_ref().map(|f| f != "all" && !f.is_empty()).unwrap_or(false);
    let search_active = search.as_ref().map(|s| !s.is_empty()).unwrap_or(false);
    
    let mut query = String::from(
        "SELECT id, timestamp, log_type, message, details, url FROM logs WHERE 1=1"
    );
    
    if filter_active {
        query.push_str(" AND log_type = ?1");
    }
    
    if search_active {
        if filter_active {
            query.push_str(" AND (message LIKE ?2 OR details LIKE ?2 OR url LIKE ?2)");
        } else {
            query.push_str(" AND (message LIKE ?1 OR details LIKE ?1 OR url LIKE ?1)");
        }
    }
    
    query.push_str(" ORDER BY created_at DESC LIMIT ?");
    // Append correct limit param number
    if filter_active && search_active {
        query = query.replace("LIMIT ?", "LIMIT ?3");
    } else if filter_active || search_active {
        query = query.replace("LIMIT ?", "LIMIT ?2");
    } else {
        query = query.replace("LIMIT ?", "LIMIT ?1");
    }
    
    let mut stmt = conn.prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;
    
    // Helper to parse row into LogEntry
    fn parse_row(row: &rusqlite::Row) -> rusqlite::Result<LogEntry> {
        Ok(LogEntry {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            log_type: row.get(2)?,
            message: row.get(3)?,
            details: row.get(4)?,
            url: row.get(5)?,
        })
    }
    
    let logs: Vec<LogEntry> = match (filter_active, search_active) {
        (true, true) => {
            let f = filter.as_ref().unwrap();
            let s = format!("%{}%", search.as_ref().unwrap());
            stmt.query_map(params![f, s, limit], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        }
        (true, false) => {
            let f = filter.as_ref().unwrap();
            stmt.query_map(params![f, limit], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        }
        (false, true) => {
            let s = format!("%{}%", search.as_ref().unwrap());
            stmt.query_map(params![s, limit], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        }
        (false, false) => {
            stmt.query_map(params![limit], parse_row)
                .map_err(|e| format!("Query failed: {}", e))?
                .filter_map(|r| r.ok())
                .collect()
        }
    };
    
    Ok(logs)
}

/// Add a log entry (exposed as Tauri command)
#[tauri::command]
fn add_log(
    log_type: String,
    message: String,
    details: Option<String>,
    url: Option<String>,
) -> Result<LogEntry, String> {
    add_log_internal(
        &log_type,
        &message,
        details.as_deref(),
        url.as_deref(),
    )
}

/// Clear all logs
#[tauri::command]
fn clear_logs() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM logs", [])
        .map_err(|e| format!("Failed to clear logs: {}", e))?;
    Ok(())
}

/// Export logs as JSON
#[tauri::command]
fn export_logs() -> Result<String, String> {
    let logs = get_logs(None, None, Some(MAX_LOG_ENTRIES))?;
    serde_json::to_string_pretty(&logs)
        .map_err(|e| format!("Failed to serialize logs: {}", e))
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    id: String,
    percent: f64,
    speed: String,
    eta: String,
    status: String,
    title: Option<String>,
    playlist_index: Option<u32>,
    playlist_count: Option<u32>,
    // Additional info for completed downloads
    filesize: Option<u64>,
    resolution: Option<String>,
    format_ext: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[allow(dead_code)]
struct PlaylistEntry {
    id: String,
    title: String,
    url: String,
}

#[derive(Clone, Serialize)]
#[allow(dead_code)]
struct PlaylistInfo {
    entries: Vec<PlaylistEntry>,
    title: String,
}

/// Video information returned from yt-dlp
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub channel: Option<String>,
    pub uploader: Option<String>,
    pub upload_date: Option<String>,
    pub view_count: Option<u64>,
    pub description: Option<String>,
    pub is_playlist: bool,
    pub playlist_count: Option<u32>,
    // Source detection
    pub extractor: Option<String>,
    pub extractor_key: Option<String>,
}

/// Format option from yt-dlp
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FormatOption {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
    pub tbr: Option<f64>,
    pub format_note: Option<String>,
    pub fps: Option<f64>,
    pub quality: Option<f64>,
}

/// Response containing video info and available formats
#[derive(Clone, Serialize, Debug)]
pub struct VideoInfoResponse {
    pub info: VideoInfo,
    pub formats: Vec<FormatOption>,
}

/// Helper to run yt-dlp command and get JSON output
async fn run_ytdlp_json(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(args)
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
                        if status.code != Some(0) {
                            return Err("yt-dlp command failed".to_string());
                        }
                    }
                    _ => {}
                }
            }
            
            Ok(output)
        }
        Err(_) => {
            // Fallback to system yt-dlp
            let output = Command::new("yt-dlp")
                .args(args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
            
            if !output.status.success() {
                return Err("yt-dlp command failed".to_string());
            }
            
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        }
    }
}

#[tauri::command]
async fn get_video_info(app: AppHandle, url: String) -> Result<VideoInfoResponse, String> {
    // Args for video info fetch:
    // - Skip download
    // - Skip playlist expansion  
    // - Use socket timeout
    // Note: Do NOT skip DASH streams - 2K/4K formats are only available via DASH
    let args = [
        "--dump-json",
        "--no-download",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout", "15",
        &url,
    ];
    
    let json_output = run_ytdlp_json(&app, &args).await?;
    
    // Parse the JSON output
    let json: serde_json::Value = serde_json::from_str(&json_output)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    // Check if it's a playlist
    let is_playlist = json.get("_type").and_then(|v| v.as_str()) == Some("playlist");
    let playlist_count = if is_playlist {
        json.get("playlist_count").and_then(|v| v.as_u64()).map(|v| v as u32)
    } else {
        None
    };
    
    // Extract video info
    let info = VideoInfo {
        id: json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
        thumbnail: json.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string()),
        duration: json.get("duration").and_then(|v| v.as_f64()),
        channel: json.get("channel").and_then(|v| v.as_str()).map(|s| s.to_string()),
        uploader: json.get("uploader").and_then(|v| v.as_str()).map(|s| s.to_string()),
        upload_date: json.get("upload_date").and_then(|v| v.as_str()).map(|s| s.to_string()),
        view_count: json.get("view_count").and_then(|v| v.as_u64()),
        description: json.get("description").and_then(|v| v.as_str()).map(|s| {
            // Truncate description to first 200 chars
            if s.len() > 200 {
                format!("{}...", &s[..200])
            } else {
                s.to_string()
            }
        }),
        is_playlist,
        playlist_count,
        // Source detection
        extractor: json.get("extractor").and_then(|v| v.as_str()).map(|s| s.to_string()),
        extractor_key: json.get("extractor_key").and_then(|v| v.as_str()).map(|s| s.to_string()),
    };
    
    // Extract formats
    let formats = if let Some(formats_arr) = json.get("formats").and_then(|v| v.as_array()) {
        formats_arr.iter().filter_map(|f| {
            let format_id = f.get("format_id").and_then(|v| v.as_str())?;
            let ext = f.get("ext").and_then(|v| v.as_str()).unwrap_or("unknown");
            
            Some(FormatOption {
                format_id: format_id.to_string(),
                ext: ext.to_string(),
                resolution: f.get("resolution").and_then(|v| v.as_str()).map(|s| s.to_string()),
                width: f.get("width").and_then(|v| v.as_u64()).map(|v| v as u32),
                height: f.get("height").and_then(|v| v.as_u64()).map(|v| v as u32),
                vcodec: f.get("vcodec").and_then(|v| v.as_str()).map(|s| s.to_string()),
                acodec: f.get("acodec").and_then(|v| v.as_str()).map(|s| s.to_string()),
                filesize: f.get("filesize").and_then(|v| v.as_u64()),
                filesize_approx: f.get("filesize_approx").and_then(|v| v.as_u64()),
                tbr: f.get("tbr").and_then(|v| v.as_f64()),
                format_note: f.get("format_note").and_then(|v| v.as_str()).map(|s| s.to_string()),
                fps: f.get("fps").and_then(|v| v.as_f64()),
                quality: f.get("quality").and_then(|v| v.as_f64()),
            })
        }).collect()
    } else {
        Vec::new()
    };
    
    Ok(VideoInfoResponse { info, formats })
}

/// Playlist entry with basic video info
#[derive(Clone, Serialize, Debug)]
pub struct PlaylistVideoEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub channel: Option<String>,
}

/// Get all video entries from a playlist
#[tauri::command]
async fn get_playlist_entries(app: AppHandle, url: String, limit: Option<u32>) -> Result<Vec<PlaylistVideoEntry>, String> {
    // Use flat-playlist to get all entries without downloading
    let mut args = vec![
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
        "--socket-timeout", "30",
    ];
    
    // Apply limit if specified
    let limit_str: String;
    if let Some(l) = limit {
        if l > 0 {
            limit_str = l.to_string();
            args.push("--playlist-end");
            args.push(&limit_str);
        }
    }
    
    args.push(&url);
    
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    let output = match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(&args)
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
                            return Err("Failed to fetch playlist info".to_string());
                        }
                    }
                    _ => {}
                }
            }
            
            output
        }
        Err(_) => {
            // Fallback to system yt-dlp
            let result = Command::new("yt-dlp")
                .args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
            
            String::from_utf8_lossy(&result.stdout).to_string()
        }
    };
    
    // Parse JSON lines (each line is a video entry)
    let mut entries: Vec<PlaylistVideoEntry> = Vec::new();
    
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            
            // Skip if no valid ID
            if id.is_empty() {
                continue;
            }
            
            let title = json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
            
            // Build URL from ID
            let video_url = format!("https://www.youtube.com/watch?v={}", id);
            
            let thumbnail = json.get("thumbnail")
                .or_else(|| json.get("thumbnails").and_then(|t| t.as_array()).and_then(|arr| arr.first()))
                .and_then(|v| {
                    if v.is_string() {
                        v.as_str().map(|s| s.to_string())
                    } else {
                        v.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
                    }
                });
            
            let duration = json.get("duration").and_then(|v| v.as_f64());
            let channel = json.get("channel")
                .or_else(|| json.get("uploader"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            
            entries.push(PlaylistVideoEntry {
                id,
                title,
                url: video_url,
                thumbnail,
                duration,
                channel,
            });
        }
    }
    
    if entries.is_empty() {
        return Err("No videos found in playlist".to_string());
    }
    
    Ok(entries)
}

/// Sanitize and validate output path to prevent path traversal attacks
fn sanitize_output_path(path: &str) -> Result<String, String> {
    use std::path::Path;
    
    // Check for obvious path traversal attempts
    if path.contains("..") {
        return Err("Invalid output path: path traversal detected".to_string());
    }
    
    let path = Path::new(path);
    
    // Ensure the path is absolute
    if !path.is_absolute() {
        return Err("Invalid output path: must be an absolute path".to_string());
    }
    
    // Canonicalize to resolve any symlinks and normalize the path
    let canonical = path.canonicalize()
        .map_err(|e| format!("Invalid output path: {}", e))?;
    
    // Verify it's a directory
    if !canonical.is_dir() {
        return Err("Invalid output path: not a directory".to_string());
    }
    
    canonical.to_str()
        .ok_or_else(|| "Invalid output path: contains invalid UTF-8".to_string())
        .map(|s| s.to_string())
}

fn build_format_string(quality: &str, format: &str, video_codec: &str) -> String {
    // Audio-only formats
    if quality == "audio" || format == "mp3" || format == "m4a" || format == "opus" {
        return match format {
            "mp3" => "bestaudio/best".to_string(),
            "m4a" => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
            "opus" => "bestaudio[ext=webm]/bestaudio/best".to_string(),
            _ => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
        };
    }
    
    let height = match quality {
        "8k" => Some("4320"),
        "4k" => Some("2160"),
        "2k" => Some("1440"),
        "1080" => Some("1080"),
        "720" => Some("720"),
        "480" => Some("480"),
        "360" => Some("360"),
        _ => None,
    };
    
    // Build codec filter based on selection
    // h264 = avc, vp9 = vp9/vp09, av1 = av01
    // NOTE: YouTube does NOT offer 4K/2K/8K in H.264, only VP9 or AV1
    // We prefer VP9 over AV1 for better compatibility (macOS QuickTime, etc.)
    let is_high_res = matches!(quality, "8k" | "4k" | "2k");
    let codec_filter = if is_high_res {
        "[vcodec^=vp9]" // Prefer VP9 for high-res (better compatibility than AV1)
    } else {
        match video_codec {
            "h264" => "[vcodec^=avc]",
            "vp9" => "[vcodec^=vp9]",
            "av1" => "[vcodec^=av01]",
            _ => "", // auto - no codec filter
        }
    };
    
    // For high-res, we need fallback chain: VP9 -> any codec
    // This ensures we still get the video if VP9 is not available
    if format == "mp4" {
        if let Some(h) = height {
            if is_high_res {
                // For 8K/4K/2K: prefer VP9 for compatibility, fallback to any codec
                format!(
                    "bestvideo[height<={}][vcodec^=vp9]+bestaudio/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, h, h
                )
            } else if !codec_filter.is_empty() {
                format!(
                    "bestvideo[height<={}]{}[ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={}]{}+bestaudio/bestvideo[height<={}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, codec_filter, h, codec_filter, h, h, h
                )
            } else {
                format!(
                    "bestvideo[height<={}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, h, h
                )
            }
        } else {
            // Best quality - prefer VP9 for compatibility
            "bestvideo[vcodec^=vp9]+bestaudio/bestvideo+bestaudio/best".to_string()
        }
    } else if let Some(h) = height {
        // Non-MP4 formats (MKV, WebM)
        if is_high_res {
            // Prefer VP9 for high-res
            format!(
                "bestvideo[height<={}][vcodec^=vp9]+bestaudio/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                h, h, h
            )
        } else if !codec_filter.is_empty() {
            format!(
                "bestvideo[height<={}]{}+bestaudio/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                h, codec_filter, h, h
            )
        } else {
            format!("bestvideo[height<={}]+bestaudio/best[height<={}]/best", h, h)
        }
    } else {
        // Best quality - prefer VP9
        "bestvideo[vcodec^=vp9]+bestaudio/bestvideo+bestaudio/best".to_string()
    }
}

/// Format file size in human readable format
fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn parse_progress(line: &str) -> Option<(f64, String, String, Option<u32>, Option<u32>)> {
    let mut playlist_index: Option<u32> = None;
    let mut playlist_count: Option<u32> = None;
    
    // Check for playlist progress
    if line.contains("Downloading item") {
        let re = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok()?;
        if let Some(caps) = re.captures(line) {
            playlist_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
            playlist_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
        }
    }
    
    if line.contains("[download]") && line.contains("%") {
        let re = regex::Regex::new(r"(\d+\.?\d*)%.*?(?:at\s+(\S+))?.*?(?:ETA\s+(\S+))?").ok()?;
        if let Some(caps) = re.captures(line) {
            let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
            let speed = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            let eta = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
            return Some((percent, speed, eta, playlist_index, playlist_count));
        }
    }
    
    None
}

/// Kill all yt-dlp and ffmpeg processes
fn kill_all_download_processes() {
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        // Kill all yt-dlp processes
        StdCommand::new("pkill")
            .args(["-9", "-f", "yt-dlp"])
            .spawn()
            .ok();
        // Kill all ffmpeg processes (yt-dlp spawns these)
        StdCommand::new("pkill")
            .args(["-9", "-f", "ffmpeg"])
            .spawn()
            .ok();
    }
    #[cfg(windows)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("taskkill")
            .args(["/F", "/IM", "yt-dlp.exe"])
            .spawn()
            .ok();
        StdCommand::new("taskkill")
            .args(["/F", "/IM", "ffmpeg.exe"])
            .spawn()
            .ok();
    }
}

#[tauri::command]
async fn download_video(
    app: AppHandle,
    id: String,
    url: String,
    output_path: String,
    quality: String,
    format: String,
    download_playlist: bool,
    video_codec: String,
    audio_bitrate: String,
    playlist_limit: Option<u32>,
    // Subtitle settings
    subtitle_mode: String,
    subtitle_langs: String,
    subtitle_embed: bool,
    subtitle_format: String,
    // Logging settings
    log_stderr: Option<bool>,
    // YouTube specific settings
    use_bun_runtime: Option<bool>,
) -> Result<(), String> {
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    
    let should_log_stderr = log_stderr.unwrap_or(true);
    
    // Sanitize and validate output path to prevent path traversal
    let sanitized_path = sanitize_output_path(&output_path)?;
    
    let format_string = build_format_string(&quality, &format, &video_codec);
    let output_template = format!("{}/%(title)s.%(ext)s", sanitized_path);
    
    let mut args = vec![
        "--newline".to_string(),
        "--progress".to_string(),  // Force progress output even when not in TTY
        "--no-warnings".to_string(),
        "-f".to_string(),
        format_string,
        "-o".to_string(),
        output_template,
        // Print final filepath after all post-processing (for accurate filesize)
        "--print".to_string(),
        "after_move:filepath".to_string(),
        // Clean up intermediate files after merging
        "--no-keep-video".to_string(),
        "--no-keep-fragments".to_string(),
    ];
    
    // Add Bun runtime args if enabled and URL is YouTube
    if use_bun_runtime.unwrap_or(false) && (url.contains("youtube.com") || url.contains("youtu.be")) {
        if let Some(bun_path) = get_bun_path(&app).await {
            // Add extractor args to use Bun runtime
            args.push("--extractor-args".to_string());
            args.push(format!("youtube:ejs_runtimes=bun;ejs_bun_path={}", bun_path.to_string_lossy()));
        }
    }
    
    // Add FFmpeg location if available (for merging video+audio)
    if let Some(ffmpeg_path) = get_ffmpeg_path(&app).await {
        if let Some(parent) = ffmpeg_path.parent() {
            args.push("--ffmpeg-location".to_string());
            args.push(parent.to_string_lossy().to_string());
        }
    }
    
    // Handle subtitle settings
    if subtitle_mode != "off" {
        // Write subtitles
        args.push("--write-subs".to_string());
        
        // For auto mode, also get auto-generated subtitles
        if subtitle_mode == "auto" {
            args.push("--write-auto-subs".to_string());
            // Use all available languages for auto mode
            args.push("--sub-langs".to_string());
            args.push("all".to_string());
        } else {
            // Manual mode - use specified languages
            args.push("--sub-langs".to_string());
            args.push(subtitle_langs.clone());
        }
        
        // Set subtitle format
        args.push("--sub-format".to_string());
        args.push(subtitle_format.clone());
        
        // Embed subtitles into video if requested (requires FFmpeg)
        if subtitle_embed {
            args.push("--embed-subs".to_string());
        }
    }
    
    // Handle playlist option
    if !download_playlist {
        args.push("--no-playlist".to_string());
    } else {
        // Apply playlist limit if set (> 0)
        if let Some(limit) = playlist_limit {
            if limit > 0 {
                args.push("--playlist-end".to_string());
                args.push(limit.to_string());
            }
        }
    }
    
    // Audio formats - extract audio and convert
    let is_audio_format = format == "mp3" || format == "m4a" || format == "opus" || quality == "audio";
    
    if is_audio_format {
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        match format.as_str() {
            "mp3" => args.push("mp3".to_string()),
            "m4a" => args.push("m4a".to_string()),
            "opus" => args.push("opus".to_string()),
            _ => args.push("mp3".to_string()), // Default to mp3 for audio
        }
        args.push("--audio-quality".to_string());
        // Set audio quality - YouTube max is ~160kbps
        match audio_bitrate.as_str() {
            "128" => args.push("128K".to_string()),
            _ => args.push("0".to_string()), // "auto" = best quality (~160k)
        }
    } else {
        // Video formats - set merge output format
        args.push("--merge-output-format".to_string());
        args.push(format.clone());
        // Audio quality for video is always best available from YouTube
        // No re-encoding needed since we removed upscaling options
    }
    
    args.push(url.clone());
    
    // Log the command before execution
    let command_str = format!("yt-dlp {}", args.join(" "));
    add_log_internal("command", &command_str, None, Some(&url)).ok();
    
    // Try to use bundled sidecar first, fallback to system yt-dlp
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, child) = sidecar
                .args(&args)
                .spawn()
                .map_err(|e| format!("Failed to start bundled yt-dlp: {}", e))?;
            
            let mut current_title: Option<String> = None;
            let mut current_index: Option<u32> = None;
            let mut total_count: Option<u32> = None;
            let mut total_filesize: u64 = 0; // Sum of all stream sizes
            let mut current_stream_size: Option<u64> = None; // Current stream being downloaded
            let mut final_filepath: Option<String> = None; // Final output file path from --print after_move:filepath
            
            // Use quality setting as resolution display
            let quality_display = match quality.as_str() {
                "8k" => Some("8K".to_string()),
                "4k" => Some("4K".to_string()),
                "2k" => Some("2K".to_string()),
                "1080" => Some("1080p".to_string()),
                "720" => Some("720p".to_string()),
                "480" => Some("480p".to_string()),
                "360" => Some("360p".to_string()),
                "audio" => Some("Audio".to_string()),
                "best" => Some("Best".to_string()),
                _ => None,
            };
            
            while let Some(event) = rx.recv().await {
                // Check cancel flag first
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    child.kill().ok();
                    kill_all_download_processes();
                    return Err("Download cancelled".to_string());
                }
                
                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        
                        // Check for playlist item info
                        if line.contains("Downloading item") {
                            let re = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok();
                            if let Some(re) = re {
                                if let Some(caps) = re.captures(&line) {
                                    current_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
                                    total_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
                                }
                            }
                        }
                        
                        // Extract video title from output
                        if line.contains("[download] Destination:") || line.contains("[ExtractAudio]") {
                            if let Some(start) = line.rfind('/') {
                                let filename = &line[start + 1..];
                                if let Some(end) = filename.rfind('.') {
                                    current_title = Some(filename[..end].to_string());
                                }
                            }
                        }
                        
                        // Capture final filepath from --print after_move:filepath
                        // This line appears as just a file path without any prefix
                        let trimmed = line.trim();
                        if !trimmed.is_empty() 
                            && !trimmed.starts_with('[') 
                            && !trimmed.starts_with("Deleting")
                            && !trimmed.starts_with("WARNING")
                            && !trimmed.starts_with("ERROR")
                            && (trimmed.ends_with(".mp3") 
                                || trimmed.ends_with(".m4a") 
                                || trimmed.ends_with(".opus")
                                || trimmed.ends_with(".mp4")
                                || trimmed.ends_with(".mkv")
                                || trimmed.ends_with(".webm"))
                        {
                            final_filepath = Some(trimmed.to_string());
                        }
                        
                        // Parse filesize from progress line: "[download] 100% of 50.5MiB"
                        // When downloading video+audio, yt-dlp shows size for each stream
                        // We need to sum them up to get total file size
                        if line.contains(" of ") && (line.contains("MiB") || line.contains("GiB") || line.contains("KiB")) {
                            // Pattern: "of 123.45MiB" or "of 1.23GiB"
                            let size_re = regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok();
                            if let Some(re) = size_re {
                                if let Some(caps) = re.captures(&line) {
                                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                                        if let Ok(size) = num.as_str().parse::<f64>() {
                                            let size_bytes = match unit.as_str() {
                                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                                "KiB" => (size * 1024.0) as u64,
                                                _ => size as u64,
                                            };
                                            // If this is a new stream size (different from current), add to total
                                            if current_stream_size != Some(size_bytes) {
                                                if let Some(prev_size) = current_stream_size {
                                                    // We're seeing a new stream, add previous to total
                                                    total_filesize += prev_size;
                                                }
                                                current_stream_size = Some(size_bytes);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        if let Some((percent, speed, eta, pi, pc)) = parse_progress(&line) {
                            if pi.is_some() { current_index = pi; }
                            if pc.is_some() { total_count = pc; }
                            
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                            };
                            app.emit("download-progress", progress).ok();
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let stderr_line = String::from_utf8_lossy(&bytes).trim().to_string();
                        
                        // yt-dlp sends progress to stderr, so we need to parse it here too
                        if let Some((percent, speed, eta, pi, pc)) = parse_progress(&stderr_line) {
                            if pi.is_some() { current_index = pi; }
                            if pc.is_some() { total_count = pc; }
                            
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                            };
                            app.emit("download-progress", progress).ok();
                        }
                        
                        // Also extract title and filesize from stderr
                        if stderr_line.contains("[download] Destination:") || stderr_line.contains("[ExtractAudio]") {
                            if let Some(start) = stderr_line.rfind('/') {
                                let filename = &stderr_line[start + 1..];
                                if let Some(end) = filename.rfind('.') {
                                    current_title = Some(filename[..end].to_string());
                                }
                            }
                        }
                        
                        // Parse filesize from stderr
                        if stderr_line.contains(" of ") && (stderr_line.contains("MiB") || stderr_line.contains("GiB") || stderr_line.contains("KiB")) {
                            let size_re = regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok();
                            if let Some(re) = size_re {
                                if let Some(caps) = re.captures(&stderr_line) {
                                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                                        if let Ok(size) = num.as_str().parse::<f64>() {
                                            let size_bytes = match unit.as_str() {
                                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                                "KiB" => (size * 1024.0) as u64,
                                                _ => size as u64,
                                            };
                                            if current_stream_size != Some(size_bytes) {
                                                if let Some(prev_size) = current_stream_size {
                                                    total_filesize += prev_size;
                                                }
                                                current_stream_size = Some(size_bytes);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        if should_log_stderr {
                            if !stderr_line.is_empty() {
                                add_log_internal("stderr", &stderr_line, None, Some(&url)).ok();
                            }
                        }
                    }
                    CommandEvent::Error(err) => {
                        let error_msg = format!("Process error: {}", err);
                        add_log_internal("error", &error_msg, None, Some(&url)).ok();
                        return Err(error_msg);
                    }
                    CommandEvent::Terminated(status) => {
                        if CANCEL_FLAG.load(Ordering::SeqCst) {
                            add_log_internal("info", "Download cancelled by user", None, Some(&url)).ok();
                            return Err("Download cancelled".to_string());
                        }
                        
                        if status.code == Some(0) {
                            // Try to get actual file size from the final output file
                            // This is more accurate than stream sizes (especially for MP3 conversion)
                            let actual_filesize = if let Some(ref filepath) = final_filepath {
                                std::fs::metadata(filepath)
                                    .ok()
                                    .map(|m| m.len())
                            } else {
                                None
                            };
                            
                            // Use actual file size if available, otherwise fall back to stream sizes
                            let reported_filesize = actual_filesize.or_else(|| {
                                // Add the last stream size to total
                                if let Some(last_size) = current_stream_size {
                                    Some(total_filesize + last_size)
                                } else if total_filesize > 0 {
                                    Some(total_filesize)
                                } else {
                                    None
                                }
                            });
                            
                            // Extract title from final filepath if not already set
                            // Path format: /path/to/Video Title.mp4
                            let display_title = current_title.clone().or_else(|| {
                                final_filepath.as_ref().and_then(|path| {
                                    let path = std::path::Path::new(path);
                                    path.file_stem()
                                        .and_then(|s| s.to_str())
                                        .map(|s| s.to_string())
                                })
                            });
                            
                            // Log success
                            let success_msg = format!(
                                "Downloaded: {}",
                                display_title.clone().unwrap_or_else(|| "Unknown".to_string())
                            );
                            let details = format!(
                                "Size: {} · Quality: {} · Format: {}",
                                reported_filesize.map(|s| format_size(s)).unwrap_or_else(|| "Unknown".to_string()),
                                quality_display.clone().unwrap_or_else(|| quality.clone()),
                                format.clone()
                            );
                            add_log_internal("success", &success_msg, Some(&details), Some(&url)).ok();
                            
                            // Save to history
                            if let Some(ref filepath) = final_filepath {
                                // Detect source from URL
                                let source = if url.contains("youtube.com") || url.contains("youtu.be") {
                                    Some("youtube".to_string())
                                } else if url.contains("tiktok.com") {
                                    Some("tiktok".to_string())
                                } else if url.contains("facebook.com") || url.contains("fb.watch") {
                                    Some("facebook".to_string())
                                } else if url.contains("instagram.com") {
                                    Some("instagram".to_string())
                                } else if url.contains("twitter.com") || url.contains("x.com") {
                                    Some("twitter".to_string())
                                } else {
                                    Some("other".to_string())
                                };
                                
                                // Generate thumbnail URL for YouTube
                                let thumbnail = if url.contains("youtube.com") || url.contains("youtu.be") {
                                    // Extract video ID from URL
                                    let video_id = if url.contains("v=") {
                                        url.split("v=").nth(1).and_then(|s| s.split('&').next())
                                    } else if url.contains("youtu.be/") {
                                        url.split("youtu.be/").nth(1).and_then(|s| s.split('?').next())
                                    } else {
                                        None
                                    };
                                    video_id.map(|id| format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", id))
                                } else {
                                    None
                                };
                                
                                add_history_internal(
                                    url.clone(),
                                    display_title.clone().unwrap_or_else(|| "Unknown".to_string()),
                                    thumbnail,
                                    filepath.clone(),
                                    reported_filesize,
                                    None, // duration
                                    quality_display.clone(),
                                    Some(format.clone()),
                                    source,
                                ).ok();
                            }
                            
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent: 100.0,
                                speed: String::new(),
                                eta: String::new(),
                                status: "finished".to_string(),
                                title: display_title,
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: reported_filesize,
                                resolution: quality_display.clone(),
                                format_ext: Some(format.clone()),
                            };
                            app.emit("download-progress", progress).ok();
                            return Ok(());
                        } else {
                            let error_msg = "Download failed";
                            add_log_internal("error", error_msg, None, Some(&url)).ok();
                            return Err(error_msg.to_string());
                        }
                    }
                    _ => {}
                }
            }
            Ok(())
        }
        Err(_) => {
            // Fallback to system yt-dlp using tokio
            let process = Command::new("yt-dlp")
                .args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}. Please install yt-dlp: brew install yt-dlp", e))?;
            
            handle_tokio_download(app, id, process, quality.clone(), format.clone(), url.clone(), should_log_stderr).await
        }
    }
}

async fn handle_tokio_download(
    app: AppHandle,
    id: String,
    mut process: tokio::process::Child,
    quality: String,
    format: String,
    url: String,
    should_log_stderr: bool,
) -> Result<(), String> {
    let stdout = process.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = process.stderr.take();
    let mut reader = BufReader::new(stdout).lines();
    
    let mut current_title: Option<String> = None;
    let mut current_index: Option<u32> = None;
    let mut total_count: Option<u32> = None;
    let mut total_filesize: u64 = 0;
    let mut current_stream_size: Option<u64> = None;
    let mut final_filepath: Option<String> = None; // Final output file path
    
    // Use quality setting as resolution display
    let quality_display = match quality.as_str() {
        "8k" => Some("8K".to_string()),
        "4k" => Some("4K".to_string()),
        "2k" => Some("2K".to_string()),
        "1080" => Some("1080p".to_string()),
        "720" => Some("720p".to_string()),
        "480" => Some("480p".to_string()),
        "360" => Some("360p".to_string()),
        "audio" => Some("Audio".to_string()),
        "best" => Some("Best".to_string()),
        _ => None,
    };
    
    while let Ok(Some(line)) = reader.next_line().await {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            process.kill().await.ok();
            kill_all_download_processes();
            return Err("Download cancelled".to_string());
        }
        
        // Check for playlist item info
        if line.contains("Downloading item") {
            let re = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok();
            if let Some(re) = re {
                if let Some(caps) = re.captures(&line) {
                    current_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
                    total_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
                }
            }
        }
        
        // Extract video title from output
        if line.contains("[download] Destination:") {
            if let Some(start) = line.rfind('/') {
                let filename = &line[start + 1..];
                if let Some(end) = filename.rfind('.') {
                    current_title = Some(filename[..end].to_string());
                }
            }
        }
        
        // Capture final filepath from --print after_move:filepath
        let trimmed = line.trim();
        if !trimmed.is_empty() 
            && !trimmed.starts_with('[') 
            && !trimmed.starts_with("Deleting")
            && !trimmed.starts_with("WARNING")
            && !trimmed.starts_with("ERROR")
            && (trimmed.ends_with(".mp3") 
                || trimmed.ends_with(".m4a") 
                || trimmed.ends_with(".opus")
                || trimmed.ends_with(".mp4")
                || trimmed.ends_with(".mkv")
                || trimmed.ends_with(".webm"))
        {
            final_filepath = Some(trimmed.to_string());
        }
        
        // Parse filesize from progress line
        if line.contains(" of ") && (line.contains("MiB") || line.contains("GiB") || line.contains("KiB")) {
            let size_re = regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok();
            if let Some(re) = size_re {
                if let Some(caps) = re.captures(&line) {
                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                        if let Ok(size) = num.as_str().parse::<f64>() {
                            let size_bytes = match unit.as_str() {
                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                "KiB" => (size * 1024.0) as u64,
                                _ => size as u64,
                            };
                            // If this is a new stream size, add previous to total
                            if current_stream_size != Some(size_bytes) {
                                if let Some(prev_size) = current_stream_size {
                                    total_filesize += prev_size;
                                }
                                current_stream_size = Some(size_bytes);
                            }
                        }
                    }
                }
            }
        }
        
        if let Some((percent, speed, eta, pi, pc)) = parse_progress(&line) {
            if pi.is_some() { current_index = pi; }
            if pc.is_some() { total_count = pc; }
            
            let progress = DownloadProgress {
                id: id.clone(),
                percent,
                speed,
                eta,
                status: "downloading".to_string(),
                title: current_title.clone(),
                playlist_index: current_index,
                playlist_count: total_count,
                filesize: None,
                resolution: None,
                format_ext: None,
            };
            app.emit("download-progress", progress).ok();
        }
    }
    
    let status = process.wait().await.map_err(|e| format!("Process error: {}", e))?;
    
    // Process stderr if available and logging is enabled
    if should_log_stderr {
        if let Some(stderr_handle) = stderr {
            let mut stderr_reader = BufReader::new(stderr_handle).lines();
            while let Ok(Some(stderr_line)) = stderr_reader.next_line().await {
                let trimmed = stderr_line.trim();
                if !trimmed.is_empty() {
                    add_log_internal("stderr", trimmed, None, Some(&url)).ok();
                }
            }
        }
    }
    
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        add_log_internal("info", "Download cancelled by user", None, Some(&url)).ok();
        return Err("Download cancelled".to_string());
    }
    
    if status.success() {
        // Try to get actual file size from the final output file
        let actual_filesize = if let Some(ref filepath) = final_filepath {
            std::fs::metadata(filepath)
                .ok()
                .map(|m| m.len())
        } else {
            None
        };
        
        // Use actual file size if available, otherwise fall back to stream sizes
        let reported_filesize = actual_filesize.or_else(|| {
            // Add the last stream size to total
            if let Some(last_size) = current_stream_size {
                Some(total_filesize + last_size)
            } else if total_filesize > 0 {
                Some(total_filesize)
            } else {
                None
            }
        });
        
        // Log success
        let success_msg = format!(
            "Downloaded: {}",
            current_title.clone().unwrap_or_else(|| "Unknown".to_string())
        );
        let details = format!(
            "Size: {} · Quality: {} · Format: {}",
            reported_filesize.map(|s| format_size(s)).unwrap_or_else(|| "Unknown".to_string()),
            quality_display.clone().unwrap_or_else(|| quality.clone()),
            format.clone()
        );
        add_log_internal("success", &success_msg, Some(&details), Some(&url)).ok();
        
        let progress = DownloadProgress {
            id: id.clone(),
            percent: 100.0,
            speed: String::new(),
            eta: String::new(),
            status: "finished".to_string(),
            title: current_title,
            playlist_index: current_index,
            playlist_count: total_count,
            filesize: reported_filesize,
            resolution: quality_display,
            format_ext: Some(format),
        };
        app.emit("download-progress", progress).ok();
        Ok(())
    } else {
        let error_msg = "Download failed";
        add_log_internal("error", error_msg, None, Some(&url)).ok();
        Err(error_msg.to_string())
    }
}

#[tauri::command]
async fn stop_download() -> Result<(), String> {
    // Set cancel flag
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    
    // Kill all yt-dlp and ffmpeg processes immediately
    kill_all_download_processes();
    
    // Wait a bit and kill again to make sure
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    kill_all_download_processes();
    
    Ok(())
}

/// yt-dlp version information
#[derive(Clone, Serialize)]
pub struct YtdlpVersionInfo {
    pub version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub is_bundled: bool,
    pub binary_path: String,
}

/// Get yt-dlp version by running --version command
#[tauri::command]
async fn get_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String> {
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    let (version, is_bundled, binary_path) = match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(["--version"])
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
            
            let mut output = String::new();
            while let Some(event) = rx.recv().await {
                if let CommandEvent::Stdout(bytes) = event {
                    output.push_str(&String::from_utf8_lossy(&bytes));
                }
            }
            
            let version = output.trim().to_string();
            // Get bundled binary path
            let resource_dir = app.path().resource_dir().ok();
            let bin_path = resource_dir
                .map(|p| p.join("bin").join("yt-dlp").to_string_lossy().to_string())
                .unwrap_or_else(|| "bundled".to_string());
            
            (version, true, bin_path)
        }
        Err(_) => {
            // Fallback to system yt-dlp
            let output = Command::new("yt-dlp")
                .args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("yt-dlp not found: {}", e))?;
            
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            
            // Try to find system binary path
            let which_output = Command::new("which")
                .arg("yt-dlp")
                .output()
                .await
                .ok();
            
            let bin_path = which_output
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_else(|| "system".to_string());
            
            (version, false, bin_path)
        }
    };
    
    Ok(YtdlpVersionInfo {
        version,
        latest_version: None,
        update_available: false,
        is_bundled,
        binary_path,
    })
}

/// GitHub release info structure
#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
}

/// FFmpeg version information
#[derive(Clone, Serialize)]
pub struct FfmpegVersionInfo {
    pub version: String,
    pub is_system: bool,
    pub binary_path: String,
}

/// FFmpeg status response
#[derive(Clone, Serialize)]
pub struct FfmpegStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub is_system: bool,
}

/// Bun runtime status response
#[derive(Clone, Serialize)]
pub struct BunStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub is_system: bool,
}

/// Subtitle information
#[derive(Clone, Serialize, Debug)]
pub struct SubtitleInfo {
    pub lang: String,
    pub name: String,
    pub is_auto_generated: bool,
}

/// Get available subtitles for a video
#[tauri::command]
async fn get_available_subtitles(app: AppHandle, url: String) -> Result<Vec<SubtitleInfo>, String> {
    let args = [
        "--list-subs",
        "--skip-download",
        "--no-warnings",
        &url,
    ];
    
    let output = run_ytdlp_json(&app, &args).await;
    
    // Parse the output to extract subtitle info
    // yt-dlp outputs subtitle info in a specific format
    let mut subtitles: Vec<SubtitleInfo> = Vec::new();
    
    // Common language codes and names
    let lang_names: std::collections::HashMap<&str, &str> = [
        ("en", "English"),
        ("vi", "Vietnamese"),
        ("ja", "Japanese"),
        ("ko", "Korean"),
        ("zh", "Chinese"),
        ("zh-Hans", "Chinese (Simplified)"),
        ("zh-Hant", "Chinese (Traditional)"),
        ("th", "Thai"),
        ("id", "Indonesian"),
        ("ms", "Malay"),
        ("fr", "French"),
        ("de", "German"),
        ("es", "Spanish"),
        ("pt", "Portuguese"),
        ("ru", "Russian"),
        ("ar", "Arabic"),
        ("hi", "Hindi"),
        ("it", "Italian"),
        ("nl", "Dutch"),
        ("pl", "Polish"),
        ("tr", "Turkish"),
        ("uk", "Ukrainian"),
    ].iter().cloned().collect();
    
    if let Ok(text) = output {
        let mut is_auto_section = false;
        
        for line in text.lines() {
            let line = line.trim();
            
            // Detect auto-generated section
            if line.contains("automatic captions") || line.contains("auto-generated") {
                is_auto_section = true;
                continue;
            }
            
            // Detect manual subtitles section
            if line.contains("subtitles") && !line.contains("auto") {
                is_auto_section = false;
                continue;
            }
            
            // Parse language codes (format: "en", "vi", etc.)
            // Skip header lines and empty lines
            if line.is_empty() || line.starts_with("Language") || line.starts_with("[") || line.contains("Available") {
                continue;
            }
            
            // Extract language code from line (first word usually)
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(lang_code) = parts.first() {
                let lang = lang_code.to_string();
                // Skip if already added
                if subtitles.iter().any(|s| s.lang == lang && s.is_auto_generated == is_auto_section) {
                    continue;
                }
                
                let name = lang_names.get(lang.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| lang.clone());
                
                subtitles.push(SubtitleInfo {
                    lang,
                    name,
                    is_auto_generated: is_auto_section,
                });
            }
        }
    }
    
    // If no subtitles found, return common languages as options
    if subtitles.is_empty() {
        subtitles = vec![
            SubtitleInfo { lang: "en".to_string(), name: "English".to_string(), is_auto_generated: false },
            SubtitleInfo { lang: "vi".to_string(), name: "Vietnamese".to_string(), is_auto_generated: false },
            SubtitleInfo { lang: "ja".to_string(), name: "Japanese".to_string(), is_auto_generated: false },
            SubtitleInfo { lang: "ko".to_string(), name: "Korean".to_string(), is_auto_generated: false },
            SubtitleInfo { lang: "zh".to_string(), name: "Chinese".to_string(), is_auto_generated: false },
        ];
    }
    
    Ok(subtitles)
}

/// Check for yt-dlp updates from GitHub
#[tauri::command]
async fn check_ytdlp_update() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.2.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Request timed out. Please try again later.".to_string()
            } else if e.is_connect() {
                "Unable to connect. Please check your internet connection.".to_string()
            } else {
                format!("Failed to check for updates: {}", e)
            }
        })?;
    
    let status = response.status();
    
    // Handle rate limiting and other HTTP errors
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        // Check for rate limit headers
        let retry_after = response
            .headers()
            .get("x-ratelimit-reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok());
        
        if let Some(reset_time) = retry_after {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let wait_minutes = ((reset_time - now) / 60).max(1);
            return Err(format!("GitHub API rate limit exceeded. Try again in {} minutes.", wait_minutes));
        }
        return Err("GitHub API rate limit exceeded. Please try again later.".to_string());
    }
    
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err("Release not found. The repository may have changed.".to_string());
    }
    
    if !status.is_success() {
        return Err(format!("GitHub API error: {} {}", status.as_u16(), status.canonical_reason().unwrap_or("Unknown")));
    }
    
    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;
    
    Ok(release.tag_name)
}

/// Get the appropriate download URL and binary name for current platform
fn get_ytdlp_download_info() -> (&'static str, &'static str, &'static str) {
    // Returns (download_url, filename, checksum_filename)
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos", "yt-dlp", "yt-dlp_macos") }
        #[cfg(target_arch = "x86_64")]
        { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos_legacy", "yt-dlp", "yt-dlp_macos_legacy") }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos", "yt-dlp", "yt-dlp_macos") }
    }
    #[cfg(target_os = "linux")]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux", "yt-dlp", "yt-dlp_linux") }
    #[cfg(target_os = "windows")]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", "yt-dlp.exe", "yt-dlp.exe") }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp", "yt-dlp", "yt-dlp") }
}

/// Verify SHA256 checksum of downloaded binary
fn verify_sha256(data: &[u8], expected_hash: &str) -> bool {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    let computed_hash = hex::encode(result);
    computed_hash.eq_ignore_ascii_case(expected_hash)
}

/// Update yt-dlp by downloading latest binary from GitHub with checksum verification
#[tauri::command]
async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    let (download_url, filename, checksum_filename) = get_ytdlp_download_info();
    
    // Get app data directory for storing updated binary
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    // Create bin directory if it doesn't exist
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let binary_path = bin_dir.join(filename);
    
    // Create HTTP client with timeout
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.2.0")
        .timeout(std::time::Duration::from_secs(300)) // 5 min timeout for large downloads
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Step 1: Download SHA256SUMS file for verification
    let checksums_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
    let checksums_response = client
        .get(checksums_url)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Download timed out. Please try again.".to_string()
            } else if e.is_connect() {
                "Unable to connect. Please check your internet connection.".to_string()
            } else {
                format!("Failed to download checksums: {}", e)
            }
        })?;
    
    let status = checksums_response.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("GitHub rate limit exceeded. Please try again in a few minutes.".to_string());
    }
    if !status.is_success() {
        return Err(format!("Failed to download checksums: HTTP {}", status));
    }
    
    let checksums_text = checksums_response
        .text()
        .await
        .map_err(|e| format!("Failed to read checksums: {}", e))?;
    
    // Parse checksums file to find the expected hash for our binary
    // Format: "<hash>  <filename>" (two spaces between hash and filename)
    let expected_hash = checksums_text
        .lines()
        .find_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == checksum_filename {
                Some(parts[0].to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| format!("Checksum not found for {}", checksum_filename))?;
    
    // Step 2: Download the binary
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Download timed out. Please try again.".to_string()
            } else if e.is_connect() {
                "Unable to connect. Please check your internet connection.".to_string()
            } else {
                format!("Failed to download yt-dlp: {}", e)
            }
        })?;
    
    let status = response.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("GitHub rate limit exceeded. Please try again in a few minutes.".to_string());
    }
    if !status.is_success() {
        return Err(format!("Download failed with status: {}", status));
    }
    
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Step 3: Verify SHA256 checksum BEFORE writing to disk
    if !verify_sha256(&bytes, &expected_hash) {
        return Err("Security error: SHA256 checksum verification failed. The downloaded file may be corrupted or tampered with.".to_string());
    }
    
    // Step 4: Write verified binary to temporary file, then rename
    let temp_path = binary_path.with_extension("tmp");
    tokio::fs::write(&temp_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write binary: {}", e))?;
    
    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&temp_path)
            .await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&temp_path, perms)
            .await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    // Rename temp file to final path (atomic on most filesystems)
    tokio::fs::rename(&temp_path, &binary_path)
        .await
        .map_err(|e| format!("Failed to rename binary: {}", e))?;
    
    // Get the new version
    let output = Command::new(&binary_path)
        .args(["--version"])
        .output()
        .await
        .map_err(|e| format!("Failed to verify update: {}", e))?;
    
    let new_version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    Ok(new_version)
}

/// Get the FFmpeg binary path (app data or system)
async fn get_ffmpeg_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let ffmpeg_path = bin_dir.join("ffmpeg.exe");
        #[cfg(not(windows))]
        let ffmpeg_path = bin_dir.join("ffmpeg");
        
        if ffmpeg_path.exists() {
            return Some(ffmpeg_path);
        }
    }
    
    // Fallback: check if system ffmpeg is available
    #[cfg(unix)]
    {
        let output = Command::new("which")
            .arg("ffmpeg")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Some(std::path::PathBuf::from(path_str));
            }
        }
    }
    
    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg("ffmpeg")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).lines().next()?.to_string();
            if !path_str.is_empty() {
                return Some(std::path::PathBuf::from(path_str));
            }
        }
    }
    
    None
}

/// Check if FFmpeg is installed and get its status
#[tauri::command]
async fn check_ffmpeg(app: AppHandle) -> Result<FfmpegStatus, String> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let ffmpeg_path = bin_dir.join("ffmpeg.exe");
        #[cfg(not(windows))]
        let ffmpeg_path = bin_dir.join("ffmpeg");
        
        if ffmpeg_path.exists() {
            // Get version
            let output = Command::new(&ffmpeg_path)
                .args(["-version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await;
            
            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let version = parse_ffmpeg_version(&stdout);
                return Ok(FfmpegStatus {
                    installed: true,
                    version: Some(version),
                    binary_path: Some(ffmpeg_path.to_string_lossy().to_string()),
                    is_system: false,
                });
            }
        }
    }
    
    // Check system FFmpeg
    let output = Command::new("ffmpeg")
        .args(["-version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let version = parse_ffmpeg_version(&stdout);
            
            // Get binary path
            #[cfg(unix)]
            let path = Command::new("which")
                .arg("ffmpeg")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
            
            #[cfg(windows)]
            let path = Command::new("where")
                .arg("ffmpeg")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string());
            
            Ok(FfmpegStatus {
                installed: true,
                version: Some(version),
                binary_path: path,
                is_system: true,
            })
        }
        _ => Ok(FfmpegStatus {
            installed: false,
            version: None,
            binary_path: None,
            is_system: false,
        }),
    }
}

/// Parse FFmpeg version from output
fn parse_ffmpeg_version(output: &str) -> String {
    // ffmpeg version N-xxxxx-gxxxxxxx or ffmpeg version 6.0
    if let Some(line) = output.lines().next() {
        if let Some(version_part) = line.strip_prefix("ffmpeg version ") {
            // Take first word (version number)
            return version_part.split_whitespace().next().unwrap_or("unknown").to_string();
        }
    }
    "unknown".to_string()
}

/// Get the appropriate FFmpeg download URL for current platform
fn get_ffmpeg_download_info() -> (&'static str, &'static str) {
    // Returns (download_url, archive_type)
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        { ("https://github.com/vanloctech/youwee/releases/download/ffmpeg-v1.0.0/ffmpeg-macos-arm64.tar.gz", "tar.gz") }
        #[cfg(target_arch = "x86_64")]
        { ("https://github.com/vanloctech/youwee/releases/download/ffmpeg-v1.0.0/ffmpeg-macos-x64.tar.gz", "tar.gz") }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { ("https://github.com/vanloctech/youwee/releases/download/ffmpeg-v1.0.0/ffmpeg-macos-arm64.tar.gz", "tar.gz") }
    }
    #[cfg(target_os = "windows")]
    { ("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", "zip") }
    #[cfg(target_os = "linux")]
    { ("https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz", "tar.xz") }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    { ("", "") }
}

/// Download and install FFmpeg
#[tauri::command]
async fn download_ffmpeg(app: AppHandle) -> Result<String, String> {
    let (download_url, archive_type) = get_ffmpeg_download_info();
    
    if download_url.is_empty() {
        return Err("Unsupported platform".to_string());
    }
    
    // Get app data directory
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    // Create bin directory if it doesn't exist
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    // Create HTTP client
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.2.1")
        .timeout(std::time::Duration::from_secs(600)) // 10 min timeout for large downloads
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Download the archive
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Download timed out. Please try again.".to_string()
            } else if e.is_connect() {
                "Unable to connect. Please check your internet connection.".to_string()
            } else {
                format!("Failed to download FFmpeg: {}", e)
            }
        })?;
    
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Download failed with status: {}", status));
    }
    
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Extract the archive based on type
    #[cfg(windows)]
    let ffmpeg_binary = "ffmpeg.exe";
    #[cfg(not(windows))]
    let ffmpeg_binary = "ffmpeg";
    
    let ffmpeg_path = bin_dir.join(ffmpeg_binary);
    
    match archive_type {
        "tar.gz" => {
            extract_tar_gz(&bytes, &bin_dir, ffmpeg_binary).await?;
        }
        "tar.xz" => {
            extract_tar_xz(&bytes, &bin_dir, ffmpeg_binary).await?;
        }
        "zip" => {
            extract_zip(&bytes, &bin_dir, ffmpeg_binary).await?;
        }
        _ => return Err("Unsupported archive type".to_string()),
    }
    
    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&ffmpeg_path)
            .await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&ffmpeg_path, perms)
            .await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    // Verify installation by getting version
    let output = Command::new(&ffmpeg_path)
        .args(["-version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to verify FFmpeg installation: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = parse_ffmpeg_version(&stdout);
    
    Ok(version)
}

/// Extract tar.gz archive (for macOS)
async fn extract_tar_gz(data: &[u8], dest_dir: &std::path::Path, target_binary: &str) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use tar::Archive;
    use std::io::Cursor;
    
    let cursor = Cursor::new(data);
    let gz = GzDecoder::new(cursor);
    let mut archive = Archive::new(gz);
    
    let entries = archive.entries()
        .map_err(|e| format!("Failed to read archive: {}", e))?;
    
    for entry in entries {
        let mut entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path().map_err(|e| format!("Failed to get path: {}", e))?;
        let path_str = path.to_string_lossy();
        
        // Look for ffmpeg binary in any path
        if path_str.ends_with("/ffmpeg") || path_str == "ffmpeg" {
            let dest_path = dest_dir.join(target_binary);
            entry.unpack(&dest_path)
                .map_err(|e| format!("Failed to extract ffmpeg: {}", e))?;
            return Ok(());
        }
    }
    
    Err("FFmpeg binary not found in archive".to_string())
}

/// Extract tar.xz archive (for Linux)
async fn extract_tar_xz(data: &[u8], dest_dir: &std::path::Path, target_binary: &str) -> Result<(), String> {
    use xz2::read::XzDecoder;
    use tar::Archive;
    use std::io::Cursor;
    
    let cursor = Cursor::new(data);
    let xz = XzDecoder::new(cursor);
    let mut archive = Archive::new(xz);
    
    let entries = archive.entries()
        .map_err(|e| format!("Failed to read archive: {}", e))?;
    
    for entry in entries {
        let mut entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path().map_err(|e| format!("Failed to get path: {}", e))?;
        let path_str = path.to_string_lossy();
        
        // Look for ffmpeg binary in any path
        if path_str.ends_with("/ffmpeg") || path_str == "ffmpeg" {
            let dest_path = dest_dir.join(target_binary);
            entry.unpack(&dest_path)
                .map_err(|e| format!("Failed to extract ffmpeg: {}", e))?;
            return Ok(());
        }
    }
    
    Err("FFmpeg binary not found in archive".to_string())
}

/// Extract zip archive (for Windows)
async fn extract_zip(data: &[u8], dest_dir: &std::path::Path, target_binary: &str) -> Result<(), String> {
    use zip::ZipArchive;
    use std::io::Cursor;
    
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to open zip: {}", e))?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        
        let name = file.name().to_string();
        
        // Look for ffmpeg.exe in the bin folder
        if name.ends_with("/bin/ffmpeg.exe") || name == "ffmpeg.exe" {
            let dest_path = dest_dir.join(target_binary);
            let mut outfile = std::fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract: {}", e))?;
            return Ok(());
        }
    }
    
    Err("FFmpeg binary not found in archive".to_string())
}

/// Get FFmpeg binary path for yt-dlp to use
#[tauri::command]
async fn get_ffmpeg_path_for_ytdlp(app: AppHandle) -> Result<Option<String>, String> {
    if let Some(path) = get_ffmpeg_path(&app).await {
        // Return the directory containing ffmpeg, not the binary itself
        // yt-dlp's --ffmpeg-location expects a directory
        if let Some(parent) = path.parent() {
            return Ok(Some(parent.to_string_lossy().to_string()));
        }
        return Ok(Some(path.to_string_lossy().to_string()));
    }
    Ok(None)
}

// ============================================================================
// History Commands
// ============================================================================

/// Add a download to history
#[tauri::command]
fn add_history(
    url: String,
    title: String,
    thumbnail: Option<String>,
    filepath: String,
    filesize: Option<u64>,
    duration: Option<u64>,
    quality: Option<String>,
    format: Option<String>,
    source: Option<String>,
    max_entries: Option<i64>,
) -> Result<(), String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let max = max_entries.unwrap_or(500);
    
    conn.execute(
        "INSERT OR REPLACE INTO history (id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, now],
    ).map_err(|e| format!("Failed to add history: {}", e))?;
    
    // Prune old entries
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY downloaded_at DESC LIMIT ?1)",
        params![max],
    ).ok();
    
    Ok(())
}

/// Get history entries with pagination and optional filters
#[tauri::command]
fn get_history(
    limit: Option<i64>,
    offset: Option<i64>,
    source_filter: Option<String>,
    search: Option<String>,
) -> Result<Vec<HistoryEntry>, String> {
    let conn = get_db()?;
    let limit = limit.unwrap_or(50).min(500);
    let offset = offset.unwrap_or(0);
    
    let mut query = String::from(
        "SELECT id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at 
         FROM history WHERE 1=1"
    );
    
    if source_filter.is_some() {
        query.push_str(" AND source = ?1");
    }
    
    if search.is_some() {
        if source_filter.is_some() {
            query.push_str(" AND title LIKE ?2");
        } else {
            query.push_str(" AND title LIKE ?1");
        }
    }
    
    query.push_str(" ORDER BY downloaded_at DESC LIMIT ?3 OFFSET ?4");
    
    // Build query dynamically based on filters
    let mut stmt = conn.prepare(&format!(
        "SELECT id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at 
         FROM history 
         WHERE (?1 IS NULL OR source = ?1) AND (?2 IS NULL OR title LIKE '%' || ?2 || '%')
         ORDER BY downloaded_at DESC LIMIT ?3 OFFSET ?4"
    )).map_err(|e| format!("Failed to prepare query: {}", e))?;
    
    let entries = stmt.query_map(
        params![source_filter, search, limit, offset],
        |row| {
            let filepath: String = row.get(4)?;
            let file_exists = std::path::Path::new(&filepath).exists();
            let downloaded_at: i64 = row.get(10)?;
            
            Ok(HistoryEntry {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                thumbnail: row.get(3)?,
                filepath,
                filesize: row.get(5)?,
                duration: row.get(6)?,
                quality: row.get(7)?,
                format: row.get(8)?,
                source: row.get(9)?,
                downloaded_at: chrono::DateTime::from_timestamp(downloaded_at, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| "Unknown".to_string()),
                file_exists,
            })
        }
    ).map_err(|e| format!("Failed to query history: {}", e))?;
    
    let result: Vec<HistoryEntry> = entries.filter_map(|e| e.ok()).collect();
    Ok(result)
}

/// Delete a history entry
#[tauri::command]
fn delete_history(id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete history: {}", e))?;
    Ok(())
}

/// Clear all history
#[tauri::command]
fn clear_history() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM history", [])
        .map_err(|e| format!("Failed to clear history: {}", e))?;
    Ok(())
}

/// Get history count
#[tauri::command]
fn get_history_count() -> Result<i64, String> {
    let conn = get_db()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count history: {}", e))?;
    Ok(count)
}

/// Open file location in system file manager
#[tauri::command]
async fn open_file_location(filepath: String) -> Result<(), String> {
    let path = std::path::Path::new(&filepath);
    
    // Get parent directory
    let folder = if path.is_file() {
        path.parent().map(|p| p.to_path_buf())
    } else if path.is_dir() {
        Some(path.to_path_buf())
    } else {
        // File doesn't exist, try parent anyway
        path.parent().map(|p| p.to_path_buf())
    };
    
    let folder = folder.ok_or_else(|| "Invalid path".to_string())?;
    
    if !folder.exists() {
        return Err("Folder does not exist".to_string());
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&folder)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&folder)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    Ok(())
}

/// Check if a file exists
#[tauri::command]
fn check_file_exists(filepath: String) -> bool {
    std::path::Path::new(&filepath).exists()
}

/// Get the Bun binary path (bundled or system)
async fn get_bun_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    // First check app data directory for bundled bun
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let bun_path = bin_dir.join("bun.exe");
        #[cfg(not(windows))]
        let bun_path = bin_dir.join("bun");
        
        if bun_path.exists() {
            return Some(bun_path);
        }
    }
    
    // Check system bun
    #[cfg(unix)]
    {
        let output = Command::new("which")
            .arg("bun")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(std::path::PathBuf::from(path));
            }
        }
    }
    
    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg("bun")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            if !path.is_empty() {
                return Some(std::path::PathBuf::from(path));
            }
        }
    }
    
    None
}

/// Check if Bun is installed and get its status
#[tauri::command]
async fn check_bun(app: AppHandle) -> Result<BunStatus, String> {
    // First check app data directory for bundled bun
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let bun_path = bin_dir.join("bun.exe");
        #[cfg(not(windows))]
        let bun_path = bin_dir.join("bun");
        
        if bun_path.exists() {
            // Get version
            let output = Command::new(&bun_path)
                .args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await;
            
            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let version = stdout.trim().to_string();
                return Ok(BunStatus {
                    installed: true,
                    version: Some(version),
                    binary_path: Some(bun_path.to_string_lossy().to_string()),
                    is_system: false,
                });
            }
        }
    }
    
    // Check system bun
    let output = Command::new("bun")
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let version = stdout.trim().to_string();
            
            // Get binary path
            #[cfg(unix)]
            let path = Command::new("which")
                .arg("bun")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
            
            #[cfg(windows)]
            let path = Command::new("where")
                .arg("bun")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string());
            
            Ok(BunStatus {
                installed: true,
                version: Some(version),
                binary_path: path,
                is_system: true,
            })
        }
        _ => Ok(BunStatus {
            installed: false,
            version: None,
            binary_path: None,
            is_system: false,
        }),
    }
}

/// Get the appropriate Bun download URL for current platform
fn get_bun_download_url() -> &'static str {
    // Bun releases: https://github.com/oven-sh/bun/releases
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-aarch64.zip" }
        #[cfg(target_arch = "x86_64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-x64.zip" }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { "" }
    }
    #[cfg(target_os = "windows")]
    { "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip" }
    #[cfg(target_os = "linux")]
    {
        #[cfg(target_arch = "aarch64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-linux-aarch64.zip" }
        #[cfg(target_arch = "x86_64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip" }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { "" }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    { "" }
}

/// Download and install Bun runtime
#[tauri::command]
async fn download_bun(app: AppHandle) -> Result<String, String> {
    let download_url = get_bun_download_url();
    
    if download_url.is_empty() {
        return Err("Unsupported platform".to_string());
    }
    
    // Get app data directory
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    // Create bin directory if it doesn't exist
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    // Create HTTP client
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.3.0")
        .timeout(std::time::Duration::from_secs(300)) // 5 min timeout
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Download the zip
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Download timed out. Please try again.".to_string()
            } else if e.is_connect() {
                "Unable to connect. Please check your internet connection.".to_string()
            } else {
                format!("Failed to download Bun: {}", e)
            }
        })?;
    
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Download failed with status: {}", status));
    }
    
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Extract bun from zip
    #[cfg(windows)]
    let bun_binary = "bun.exe";
    #[cfg(not(windows))]
    let bun_binary = "bun";
    
    let bun_path = bin_dir.join(bun_binary);
    
    // Extract the zip
    extract_bun_from_zip(&bytes, &bin_dir, bun_binary).await?;
    
    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&bun_path)
            .await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&bun_path, perms)
            .await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    // Verify installation by getting version
    let output = Command::new(&bun_path)
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to verify Bun installation: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let version = stdout.trim().to_string();
    
    Ok(version)
}

/// Extract bun binary from zip archive
async fn extract_bun_from_zip(data: &[u8], dest_dir: &std::path::Path, target_binary: &str) -> Result<(), String> {
    use zip::ZipArchive;
    use std::io::Cursor;
    
    let cursor = Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to open zip: {}", e))?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;
        
        let name = file.name().to_string();
        
        // Look for bun binary - it's usually in a folder like bun-darwin-aarch64/bun
        #[cfg(windows)]
        let is_bun = name.ends_with("/bun.exe") || name == "bun.exe";
        #[cfg(not(windows))]
        let is_bun = (name.ends_with("/bun") || name == "bun") && !name.ends_with(".dSYM/bun");
        
        if is_bun {
            let dest_path = dest_dir.join(target_binary);
            let mut outfile = std::fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract: {}", e))?;
            return Ok(());
        }
    }
    
    Err("Bun binary not found in archive".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Initialize the logs database
            if let Err(e) = init_database(&app.handle()) {
                log::error!("Failed to initialize logs database: {}", e);
            }
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            download_video, 
            stop_download, 
            get_video_info,
            get_playlist_entries,
            get_ytdlp_version,
            check_ytdlp_update,
            update_ytdlp,
            check_ffmpeg,
            download_ffmpeg,
            get_ffmpeg_path_for_ytdlp,
            get_available_subtitles,
            get_logs,
            add_log,
            clear_logs,
            export_logs,
            // History commands
            add_history,
            get_history,
            delete_history,
            clear_history,
            get_history_count,
            open_file_location,
            check_file_exists,
            // Bun runtime commands
            check_bun,
            download_bun
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
