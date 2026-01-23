use super::get_db;
use crate::types::HistoryEntry;
use chrono::Utc;
use rusqlite::params;

/// Add a history entry (internal use)
pub fn add_history_internal(
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

    Ok(id)
}

/// Update summary for a history entry
pub fn update_history_summary(id: String, summary: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE history SET summary = ?1 WHERE id = ?2",
        params![summary, id],
    )
    .map_err(|e| format!("Failed to update summary: {}", e))?;
    Ok(())
}

/// Update a history entry with download info (for re-downloads)
pub fn update_history_download(
    id: String,
    filepath: String,
    filesize: Option<u64>,
    quality: Option<String>,
    format: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE history SET filepath = ?1, filesize = ?2, quality = ?3, format = ?4, downloaded_at = ?5 WHERE id = ?6",
        params![filepath, filesize, quality, format, now, id],
    )
    .map_err(|e| format!("Failed to update history: {}", e))?;
    Ok(())
}

/// Add a history entry with summary (for videos summarized without downloading)
pub fn add_history_with_summary(
    url: String,
    title: String,
    thumbnail: Option<String>,
    duration: Option<u64>,
    source: Option<String>,
    summary: String,
) -> Result<String, String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    // Use empty filepath to indicate it's summary-only (not downloaded)
    let filepath = "";

    conn.execute(
        "INSERT OR REPLACE INTO history (id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at, summary)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![id, url, title, thumbnail, filepath, Option::<u64>::None, duration, Option::<String>::None, Option::<String>::None, source, now, summary],
    ).map_err(|e| format!("Failed to add history: {}", e))?;

    Ok(id)
}

/// Get history entries
pub fn get_history_from_db(
    limit: Option<i64>,
    offset: Option<i64>,
    source: Option<String>,
) -> Result<Vec<HistoryEntry>, String> {
    let conn = get_db()?;

    let limit = limit.unwrap_or(50).min(500);
    let offset = offset.unwrap_or(0);

    let mut query = String::from(
        "SELECT id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at, summary 
         FROM history WHERE 1=1"
    );

    let source_filter = source
        .as_ref()
        .map(|s| s != "all" && !s.is_empty())
        .unwrap_or(false);

    if source_filter {
        query.push_str(" AND source = ?1 ORDER BY downloaded_at DESC LIMIT ?2 OFFSET ?3");
    } else {
        query.push_str(" ORDER BY downloaded_at DESC LIMIT ?1 OFFSET ?2");
    }

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    fn parse_row(row: &rusqlite::Row) -> rusqlite::Result<HistoryEntry> {
        let filepath: String = row.get(4)?;
        let file_exists = std::path::Path::new(&filepath).exists();
        let downloaded_at: i64 = row.get(10)?;
        let dt = chrono::DateTime::from_timestamp(downloaded_at, 0)
            .map(|d| d.to_rfc3339())
            .unwrap_or_default();

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
            downloaded_at: dt,
            file_exists,
            summary: row.get(11)?,
        })
    }

    let entries: Vec<HistoryEntry> = if source_filter {
        let s = source.as_ref().unwrap();
        stmt.query_map(params![s, limit, offset], parse_row)
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map(params![limit, offset], parse_row)
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(entries)
}

/// Delete a history entry
pub fn delete_history_from_db(id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete history: {}", e))?;
    Ok(())
}

/// Clear all history
pub fn clear_history_from_db() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM history", [])
        .map_err(|e| format!("Failed to clear history: {}", e))?;
    Ok(())
}

/// Get history count
pub fn get_history_count_from_db() -> Result<i64, String> {
    let conn = get_db()?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count history: {}", e))?;
    Ok(count)
}
