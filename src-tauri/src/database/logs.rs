use super::{get_db, MAX_LOG_ENTRIES};
use crate::types::LogEntry;
use chrono::Utc;
use rusqlite::params;

/// Add a log entry to the database (internal use)
pub fn add_log_internal(
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
    )
    .map_err(|e| format!("Failed to insert log: {}", e))?;

    // Prune old entries if exceeding limit
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM logs", [], |row| row.get(0))
        .unwrap_or(0);

    if count > MAX_LOG_ENTRIES {
        let to_delete = count - MAX_LOG_ENTRIES;
        conn.execute(
            "DELETE FROM logs WHERE id IN (
                SELECT id FROM logs ORDER BY created_at ASC LIMIT ?1
            )",
            params![to_delete],
        )
        .ok();
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

/// Get logs from database with optional filters
pub fn get_logs_from_db(
    filter: Option<String>,
    search: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<LogEntry>, String> {
    let conn = get_db()?;

    let limit = limit.unwrap_or(100).min(500);

    // Build query dynamically
    let filter_active = filter
        .as_ref()
        .map(|f| f != "all" && !f.is_empty())
        .unwrap_or(false);
    let search_active = search.as_ref().map(|s| !s.is_empty()).unwrap_or(false);

    let mut query =
        String::from("SELECT id, timestamp, log_type, message, details, url FROM logs WHERE 1=1");

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

    let mut stmt = conn
        .prepare(&query)
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
        (false, false) => stmt
            .query_map(params![limit], parse_row)
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect(),
    };

    Ok(logs)
}

/// Clear all logs
pub fn clear_logs_from_db() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM logs", [])
        .map_err(|e| format!("Failed to clear logs: {}", e))?;
    Ok(())
}

/// Export logs as JSON
pub fn export_logs_from_db() -> Result<String, String> {
    let logs = get_logs_from_db(None, None, Some(MAX_LOG_ENTRIES))?;
    serde_json::to_string_pretty(&logs).map_err(|e| format!("Failed to serialize logs: {}", e))
}
