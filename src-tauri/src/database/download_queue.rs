use super::get_db;
use chrono::Utc;
use rusqlite::params;

const VALID_QUEUE_KINDS: &[&str] = &["youtube", "universal", "gallery"];

fn validate_queue_kind(queue_kind: &str) -> Result<(), String> {
    if VALID_QUEUE_KINDS.contains(&queue_kind) {
        Ok(())
    } else {
        Err(format!("Invalid download queue kind: {}", queue_kind))
    }
}

pub fn load_download_queue_from_db(queue_kind: String) -> Result<Option<String>, String> {
    validate_queue_kind(&queue_kind)?;

    let conn = get_db()?;
    let result = conn.query_row(
        "SELECT items_json FROM download_queues WHERE queue_kind = ?1",
        params![queue_kind],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(items_json) => Ok(Some(items_json)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to load download queue: {}", e)),
    }
}

pub fn save_download_queue_to_db(queue_kind: String, items_json: String) -> Result<(), String> {
    validate_queue_kind(&queue_kind)?;

    let conn = get_db()?;
    conn.execute(
        "INSERT INTO download_queues (queue_kind, items_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(queue_kind) DO UPDATE SET
            items_json = excluded.items_json,
            updated_at = excluded.updated_at",
        params![queue_kind, items_json, Utc::now().timestamp()],
    )
    .map_err(|e| format!("Failed to save download queue: {}", e))?;

    Ok(())
}

pub fn clear_download_queue_from_db(queue_kind: String) -> Result<(), String> {
    validate_queue_kind(&queue_kind)?;

    let conn = get_db()?;
    conn.execute(
        "DELETE FROM download_queues WHERE queue_kind = ?1",
        params![queue_kind],
    )
    .map_err(|e| format!("Failed to clear download queue: {}", e))?;

    Ok(())
}
