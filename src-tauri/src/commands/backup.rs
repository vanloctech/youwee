//! Download history backup, restore and preview commands.
//!
//! P0-6 "Download history export, import, and backup":
//! portable, versioned JSON backups of the download history plus an optional
//! settings blob supplied by the frontend. Imports are fully validated before
//! any write and applied inside a single SQLite transaction, so a corrupt or
//! incompatible backup can never partially modify existing data.
//!
//! This module is intentionally NOT registered in `lib.rs` by the P0-6
//! implementer; the mainline registers these commands:
//!
//! ```ignore
//! commands::export_backup,
//! commands::export_backup_with_settings,
//! commands::preview_backup,
//! commands::import_backup,
//! ```

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::database::get_db;
use chrono::{Local, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Current backup JSON schema version. Bump when the file layout changes;
/// older versions should be migrated here (or rejected with a clear error).
pub const BACKUP_SCHEMA_VERSION: u32 = 1;

const BACKUP_PREFIX: &str = "weeb-backup";
const PREVIEW_ROW_LIMIT: usize = 10;
const REDACTED_PLACEHOLDER: &str = "[redacted]";

const HISTORY_COLUMNS: &str = "id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at, summary, time_range, media_id, canonical_url";

// ---------------------------------------------------------------------------
// Backup schema types
// ---------------------------------------------------------------------------

/// One history row as stored inside a backup file. `status` is derived from
/// the row's own data ("completed" / "summary_only" / "pending") because the
/// `history` table has no explicit status column.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupHistoryRow {
    pub id: String,
    pub url: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub filepath: String,
    pub filesize: Option<i64>,
    pub duration: Option<i64>,
    pub quality: Option<String>,
    pub format: Option<String>,
    pub source: Option<String>,
    pub downloaded_at: i64,
    pub summary: Option<String>,
    pub time_range: Option<String>,
    pub media_id: Option<String>,
    pub canonical_url: Option<String>,
    /// Derived status, kept in the file for readability on any OS.
    #[serde(default = "default_status")]
    pub status: String,
}

fn default_status() -> String {
    "pending".to_string()
}

/// Top-level backup file structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub schema_version: u32,
    pub exported_at: String,
    pub app_version: String,
    #[serde(default)]
    pub os: String,
    #[serde(default)]
    pub secrets: bool,
    pub history: Vec<BackupHistoryRow>,
    /// Opaque settings blob provided by the frontend (localStorage settings).
    /// Secret keys are redacted unless the user opted in (`secrets: true`).
    pub settings: Option<Value>,
}

// ---------------------------------------------------------------------------
// Command result types (serialized camelCase for the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResult {
    pub path: String,
    pub count: usize,
    pub secrets: bool,
    pub exported_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreviewRow {
    pub id: String,
    pub url: String,
    pub title: String,
    pub status: String,
    pub source: Option<String>,
    pub filepath: String,
    pub downloaded_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub valid: bool,
    pub schema_version: u32,
    pub count: usize,
    pub errors: Vec<String>,
    pub rows: Vec<BackupPreviewRow>,
    pub additions: usize,
    pub conflicts: usize,
    pub skipped: usize,
    pub secrets: bool,
    pub has_settings: bool,
    pub exported_at: Option<String>,
    pub app_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportResult {
    pub total: usize,
    pub added: usize,
    pub updated: usize,
    pub skipped: usize,
    pub policy: String,
    pub secrets: bool,
    pub settings: Option<Value>,
}

// ---------------------------------------------------------------------------
// Conflict policy
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConflictPolicy {
    Skip,
    Replace,
    Merge,
    Duplicate,
}

impl ConflictPolicy {
    fn parse(raw: Option<String>) -> Result<ConflictPolicy, String> {
        match raw.as_deref().unwrap_or("skip") {
            "skip" => Ok(ConflictPolicy::Skip),
            "replace" => Ok(ConflictPolicy::Replace),
            "merge" => Ok(ConflictPolicy::Merge),
            "duplicate" => Ok(ConflictPolicy::Duplicate),
            other => Err(format!(
                "Invalid conflict policy \"{other}\". Expected one of: skip, replace, merge, duplicate"
            )),
        }
    }

    fn name(self) -> &'static str {
        match self {
            ConflictPolicy::Skip => "skip",
            ConflictPolicy::Replace => "replace",
            ConflictPolicy::Merge => "merge",
            ConflictPolicy::Duplicate => "duplicate",
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// The `history` table has no status column; derive one from the row's data.
fn derive_status(filepath: &str, summary: &Option<String>) -> String {
    if !filepath.trim().is_empty() {
        "completed".to_string()
    } else if summary.as_deref().map(str::trim).is_some_and(|s| !s.is_empty()) {
        "summary_only".to_string()
    } else {
        "pending".to_string()
    }
}

fn row_from_sqlite(row: &rusqlite::Row) -> rusqlite::Result<BackupHistoryRow> {
    let filepath: String = row.get(4)?;
    let summary: Option<String> = row.get(11)?;
    let status = derive_status(&filepath, &summary);
    Ok(BackupHistoryRow {
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
        downloaded_at: row.get(10)?,
        summary,
        time_range: row.get(12)?,
        media_id: row.get(13)?,
        canonical_url: row.get(14)?,
        status,
    })
}

fn load_all_history_rows(conn: &Connection) -> Result<Vec<BackupHistoryRow>, String> {
    let query = format!("SELECT {HISTORY_COLUMNS} FROM history");
    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare history read: {e}"))?;
    let rows = stmt
        .query_map([], row_from_sqlite)
        .map_err(|e| format!("Failed to read history: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("Failed to parse history row: {e}"))?);
    }
    Ok(out)
}

/// Validate schema version and required fields. Returns a list of problems
/// (empty == valid).
fn validate_backup(backup: &BackupFile) -> Vec<String> {
    let mut errors = Vec::new();

    if backup.schema_version != BACKUP_SCHEMA_VERSION {
        if backup.schema_version > BACKUP_SCHEMA_VERSION {
            errors.push(format!(
                "Backup schema version {} is newer than the version this app supports ({}). Update weeb and try again.",
                backup.schema_version, BACKUP_SCHEMA_VERSION
            ));
        } else {
            errors.push(format!(
                "Backup schema version {} is no longer supported (current version is {}).",
                backup.schema_version, BACKUP_SCHEMA_VERSION
            ));
        }
    }

    if backup.exported_at.trim().is_empty() {
        errors.push("Backup is missing the required \"exportedAt\" field.".to_string());
    }
    if backup.app_version.trim().is_empty() {
        errors.push("Backup is missing the required \"appVersion\" field.".to_string());
    }

    let mut seen_ids = HashSet::new();
    for (index, row) in backup.history.iter().enumerate() {
        if row.id.trim().is_empty() {
            errors.push(format!("History entry #{} is missing an id.", index + 1));
        } else if !seen_ids.insert(row.id.clone()) {
            errors.push(format!(
                "History entry #{} has a duplicate id ({}) inside the backup.",
                index + 1,
                row.id
            ));
        }
        if row.url.trim().is_empty() {
            errors.push(format!("History entry #{} is missing a URL.", index + 1));
        }
        if row.title.trim().is_empty() {
            errors.push(format!("History entry #{} is missing a title.", index + 1));
        }
    }

    errors
}

/// Read + parse + validate a backup file. Returns Err(errors) for anything
/// that must not be imported.
fn read_backup_file(path: &str) -> Result<BackupFile, Vec<String>> {
    // Reject oversized files before reading (protects against OOM from
    // accidentally pointing at a multi-GB file).
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() > 50 * 1024 * 1024 {
            return Err(vec!["Backup file is larger than 50 MB and was rejected.".to_string()]);
        }
    }
    let raw = fs::read_to_string(path).map_err(|e| vec![format!("Failed to read backup file: {e}")])?;

    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|e| vec![format!("Backup is not valid JSON: {e}")])?;

    let mut backup: BackupFile = serde_json::from_value(parsed)
        .map_err(|e| vec![format!("Backup does not match the expected schema: {e}")])?;

    // Normalize derived status so matching never depends on untrusted file values.
    for row in backup.history.iter_mut() {
        row.status = derive_status(&row.filepath, &row.summary);
    }

    let errors = validate_backup(&backup);
    if errors.is_empty() {
        Ok(backup)
    } else {
        Err(errors)
    }
}

/// Find an existing row with the same url + derived status (most recent wins).
fn find_matching_existing<'a>(
    existing: &'a [BackupHistoryRow],
    row: &BackupHistoryRow,
) -> Option<&'a BackupHistoryRow> {
    existing
        .iter()
        .filter(|candidate| candidate.url == row.url && candidate.status == row.status)
        .max_by_key(|candidate| candidate.downloaded_at)
}

/// Data equality used by the "merge" policy (id and derived status excluded).
fn data_equal(a: &BackupHistoryRow, b: &BackupHistoryRow) -> bool {
    a.url == b.url
        && a.title == b.title
        && a.thumbnail == b.thumbnail
        && a.filepath == b.filepath
        && a.filesize == b.filesize
        && a.duration == b.duration
        && a.quality == b.quality
        && a.format == b.format
        && a.source == b.source
        && a.downloaded_at == b.downloaded_at
        && a.summary == b.summary
        && a.time_range == b.time_range
        && a.media_id == b.media_id
        && a.canonical_url == b.canonical_url
}

/// Preview counts (additions / conflicts / skipped) for a given policy.
fn compute_conflict_counts(
    existing: &[BackupHistoryRow],
    backup: &BackupFile,
    policy: ConflictPolicy,
) -> (usize, usize, usize) {
    let mut additions = 0usize;
    let mut conflicts = 0usize;
    let mut skipped = 0usize;

    for row in &backup.history {
        match policy {
            ConflictPolicy::Duplicate => additions += 1,
            ConflictPolicy::Skip => {
                if find_matching_existing(existing, row).is_some() {
                    skipped += 1;
                } else {
                    additions += 1;
                }
            }
            ConflictPolicy::Replace => {
                if find_matching_existing(existing, row).is_some() {
                    conflicts += 1;
                } else {
                    additions += 1;
                }
            }
            ConflictPolicy::Merge => match find_matching_existing(existing, row) {
                Some(matched) if data_equal(matched, row) => skipped += 1,
                Some(_) => conflicts += 1,
                None => additions += 1,
            },
        }
    }

    (additions, conflicts, skipped)
}

fn insert_row(conn: &Connection, row: &BackupHistoryRow, force_new_id: bool) -> Result<(), String> {
    let id = if force_new_id {
        uuid::Uuid::new_v4().to_string()
    } else {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM history WHERE id = ?1",
                params![&row.id],
                |r| r.get(0),
            )
            .map_err(|e| format!("Failed to check history id: {e}"))?;
        if exists == 0 {
            row.id.clone()
        } else {
            uuid::Uuid::new_v4().to_string()
        }
    };

    conn.execute(
        "INSERT INTO history (id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at, summary, time_range, media_id, canonical_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            id,
            &row.url,
            &row.title,
            &row.thumbnail,
            &row.filepath,
            &row.filesize,
            &row.duration,
            &row.quality,
            &row.format,
            &row.source,
            &row.downloaded_at,
            &row.summary,
            &row.time_range,
            &row.media_id,
            &row.canonical_url,
        ],
    )
    .map_err(|e| format!("Failed to insert history row: {e}"))?;

    Ok(())
}

fn update_row(conn: &Connection, id: &str, row: &BackupHistoryRow) -> Result<(), String> {
    conn.execute(
        "UPDATE history SET url = ?2, title = ?3, thumbnail = ?4, filepath = ?5, filesize = ?6, duration = ?7, quality = ?8, format = ?9, source = ?10, downloaded_at = ?11, summary = ?12, time_range = ?13, media_id = ?14, canonical_url = ?15 WHERE id = ?1",
        params![
            id,
            &row.url,
            &row.title,
            &row.thumbnail,
            &row.filepath,
            &row.filesize,
            &row.duration,
            &row.quality,
            &row.format,
            &row.source,
            &row.downloaded_at,
            &row.summary,
            &row.time_range,
            &row.media_id,
            &row.canonical_url,
        ],
    )
    .map_err(|e| format!("Failed to update history row: {e}"))?;
    Ok(())
}

/// Recursively replace values of sensitive keys with a placeholder.
const SENSITIVE_KEY_PARTS: &[&str] = &[
    "token",
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "api-key",
];

fn is_sensitive_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    SENSITIVE_KEY_PARTS
        .iter()
        .any(|part| lower.contains(part))
}

fn redact_settings(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut redacted = serde_json::Map::with_capacity(map.len());
            for (key, child) in map {
                if is_sensitive_key(key) {
                    redacted.insert(key.clone(), Value::String(REDACTED_PLACEHOLDER.to_string()));
                } else {
                    redacted.insert(key.clone(), redact_settings(child));
                }
            }
            Value::Object(redacted)
        }
        Value::Array(items) => Value::Array(items.iter().map(redact_settings).collect()),
        other => other.clone(),
    }
}

fn build_backup_file(
    app: &tauri::AppHandle,
    include_secrets: bool,
    settings: Option<Value>,
) -> Result<(BackupFile, Vec<BackupHistoryRow>), String> {
    let conn = get_db()?;
    let rows = load_all_history_rows(&conn)?;

    let settings = settings.map(|settings| {
        if include_secrets {
            settings
        } else {
            redact_settings(&settings)
        }
    });

    let backup = BackupFile {
        schema_version: BACKUP_SCHEMA_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        app_version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        secrets: include_secrets,
        history: rows.clone(),
        settings,
    };

    Ok((backup, rows))
}

fn write_backup_file(dest_dir: &str, backup: &BackupFile) -> Result<PathBuf, String> {
    let dir = Path::new(dest_dir);
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create backup folder: {e}"))?;

    let stamp = Local::now().format("%Y%m%d-%H%M%S");
    let file_name = format!("{BACKUP_PREFIX}-{stamp}.json");
    let final_path = dir.join(&file_name);
    let temp_path = dir.join(format!("{file_name}.tmp"));

    let content = serde_json::to_string_pretty(backup)
        .map_err(|e| format!("Failed to serialize backup: {e}"))?;
    fs::write(&temp_path, content).map_err(|e| format!("Failed to write backup file: {e}"))?;
    fs::rename(&temp_path, &final_path)
        .map_err(|e| format!("Failed to finalize backup file: {e}"))?;

    Ok(final_path)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Export download history (no settings) to a versioned JSON backup file in
/// `dest_dir`. Never writes cookie values or tokens; `include_secrets` only
/// controls the optional settings blob (see `export_backup_with_settings`).
#[tauri::command]
pub fn export_backup(
    app: tauri::AppHandle,
    include_secrets: bool,
    dest_dir: String,
) -> Result<BackupExportResult, String> {
    let (backup, rows) = build_backup_file(&app, include_secrets, None)?;
    let path = write_backup_file(&dest_dir, &backup)?;
    Ok(BackupExportResult {
        path: path.to_string_lossy().into_owned(),
        count: rows.len(),
        secrets: include_secrets,
        exported_at: backup.exported_at,
    })
}

/// Like `export_backup`, but embeds a settings blob supplied by the frontend
/// (serialized localStorage settings). When `include_secrets` is false, keys
/// that look sensitive (tokens, passwords, API keys) are redacted; when true,
/// the blob is embedded as-is.
#[tauri::command]
pub fn export_backup_with_settings(
    app: tauri::AppHandle,
    include_secrets: bool,
    dest_dir: String,
    settings_json: Option<String>,
) -> Result<BackupExportResult, String> {
    let settings = match settings_json {
        Some(raw) => Some(
            serde_json::from_str(&raw).map_err(|e| format!("Failed to parse settings blob: {e}"))?,
        ),
        None => None,
    };
    let (backup, rows) = build_backup_file(&app, include_secrets, settings)?;
    let path = write_backup_file(&dest_dir, &backup)?;
    Ok(BackupExportResult {
        path: path.to_string_lossy().into_owned(),
        count: rows.len(),
        secrets: include_secrets,
        exported_at: backup.exported_at,
    })
}

/// Validate a backup file and return a preview (first N rows + per-policy
/// conflict counts) WITHOUT writing anything. Invalid or corrupt files return
/// `Ok` with `valid == false` and a list of errors.
#[tauri::command]
pub fn preview_backup(
    path: String,
    conflict_policy: Option<String>,
) -> Result<BackupPreview, String> {
    let policy = ConflictPolicy::parse(conflict_policy)?;

    let backup = match read_backup_file(&path) {
        Ok(backup) => backup,
        Err(errors) => {
            return Ok(BackupPreview {
                valid: false,
                schema_version: 0,
                count: 0,
                errors,
                rows: Vec::new(),
                additions: 0,
                conflicts: 0,
                skipped: 0,
                secrets: false,
                has_settings: false,
                exported_at: None,
                app_version: None,
            });
        }
    };

    let conn = get_db()?;
    let existing = load_all_history_rows(&conn)?;
    let (additions, conflicts, skipped) = compute_conflict_counts(&existing, &backup, policy);

    let rows = backup
        .history
        .iter()
        .take(PREVIEW_ROW_LIMIT)
        .map(|row| BackupPreviewRow {
            id: row.id.clone(),
            url: row.url.clone(),
            title: row.title.clone(),
            status: row.status.clone(),
            source: row.source.clone(),
            filepath: row.filepath.clone(),
            downloaded_at: row.downloaded_at,
        })
        .collect();

    Ok(BackupPreview {
        valid: true,
        schema_version: backup.schema_version,
        count: backup.history.len(),
        errors: Vec::new(),
        rows,
        additions,
        conflicts,
        skipped,
        secrets: backup.secrets,
        has_settings: backup.settings.is_some(),
        exported_at: Some(backup.exported_at),
        app_version: Some(backup.app_version),
    })
}

/// Re-validate a backup file and apply it with the chosen conflict policy
/// inside a single transaction. Any validation or write error aborts the
/// whole import, so existing data is never partially modified.
///
/// Policies: "skip" (skip rows whose url+status already exist), "replace"
/// (update matching rows), "merge" (insert missing + update changed), and
/// "duplicate" (always insert with fresh ids).
#[tauri::command]
pub fn import_backup(
    path: String,
    conflict_policy: Option<String>,
) -> Result<BackupImportResult, String> {
    let policy = ConflictPolicy::parse(conflict_policy)?;
    let backup = read_backup_file(&path).map_err(|errors| errors.join("\n"))?;

    let mut conn = get_db()?;
    let existing = load_all_history_rows(&conn)?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start import transaction: {e}"))?;

    let mut added = 0usize;
    let mut updated = 0usize;
    let mut skipped = 0usize;

    for row in &backup.history {
        match policy {
            ConflictPolicy::Duplicate => {
                insert_row(&tx, row, true)?;
                added += 1;
            }
            ConflictPolicy::Skip => {
                if find_matching_existing(&existing, row).is_some() {
                    skipped += 1;
                } else {
                    insert_row(&tx, row, false)?;
                    added += 1;
                }
            }
            ConflictPolicy::Replace => {
                if let Some(matched) = find_matching_existing(&existing, row) {
                    update_row(&tx, &matched.id, row)?;
                    updated += 1;
                } else {
                    insert_row(&tx, row, false)?;
                    added += 1;
                }
            }
            ConflictPolicy::Merge => match find_matching_existing(&existing, row) {
                Some(matched) if data_equal(matched, row) => skipped += 1,
                Some(matched) => {
                    update_row(&tx, &matched.id, row)?;
                    updated += 1;
                }
                None => {
                    insert_row(&tx, row, false)?;
                    added += 1;
                }
            },
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit import transaction: {e}"))?;

    Ok(BackupImportResult {
        total: backup.history.len(),
        added,
        updated,
        skipped,
        policy: policy.name().to_string(),
        secrets: backup.secrets,
        settings: backup.settings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row(id: &str, url: &str) -> BackupHistoryRow {
        BackupHistoryRow {
            id: id.to_string(),
            url: url.to_string(),
            title: "Sample video".to_string(),
            thumbnail: None,
            filepath: "/tmp/sample.mp4".to_string(),
            filesize: Some(1024),
            duration: Some(60),
            quality: Some("1080".to_string()),
            format: Some("mp4".to_string()),
            source: Some("youtube".to_string()),
            downloaded_at: 1_700_000_000,
            summary: None,
            time_range: None,
            media_id: None,
            canonical_url: None,
            status: "completed".to_string(),
        }
    }

    #[test]
    fn derive_status_maps_filepath_and_summary() {
        assert_eq!(derive_status("", &None), "pending");
        assert_eq!(derive_status("", &Some("hello".to_string())), "summary_only");
        assert_eq!(derive_status("  ", &Some("".to_string())), "pending");
        assert_eq!(derive_status("/a/b.mp4", &None), "completed");
    }

    #[test]
    fn matching_requires_same_url_and_status() {
        let existing = vec![sample_row("a", "https://example.com/v")];
        let same = sample_row("b", "https://example.com/v");
        assert!(find_matching_existing(&existing, &same).is_some());

        let different_url = sample_row("c", "https://example.com/other");
        assert!(find_matching_existing(&existing, &different_url).is_none());

        let mut different_status = sample_row("d", "https://example.com/v");
        different_status.filepath = "".to_string();
        different_status.status = "pending".to_string();
        assert!(find_matching_existing(&existing, &different_status).is_none());
    }

    #[test]
    fn validation_rejects_wrong_schema_and_duplicate_ids() {
        let mut backup = BackupFile {
            schema_version: 2,
            exported_at: "2026-08-27T00:00:00Z".to_string(),
            app_version: "0.20.3".to_string(),
            os: "windows".to_string(),
            secrets: false,
            history: vec![sample_row("dup", "https://example.com/1"), sample_row("dup", "https://example.com/2")],
            settings: None,
        };
        let errors = validate_backup(&backup);
        assert!(errors.iter().any(|e| e.contains("newer")));
        assert!(errors.iter().any(|e| e.contains("duplicate id")));

        backup.schema_version = BACKUP_SCHEMA_VERSION;
        backup.history[1].id = "other".to_string();
        assert!(validate_backup(&backup).is_empty());
    }

    #[test]
    fn redaction_hides_tokens_passwords_and_api_keys() {
        let value = serde_json::json!({
            "download": { "quality": "1080", "telegramBotToken": "123:ABC", "nested": { "api_key": "sk-secret", "keep": "value" } },
            "proxy": { "password": "pw", "host": "1.2.3.4" },
            "list": [{"token": "x"}, {"safe": 1}]
        });
        let redacted = redact_settings(&value);
        assert_eq!(redacted["download"]["telegramBotToken"], "[redacted]");
        assert_eq!(redacted["download"]["nested"]["api_key"], "[redacted]");
        assert_eq!(redacted["proxy"]["password"], "[redacted]");
        assert_eq!(redacted["list"][0]["token"], "[redacted]");
        assert_eq!(redacted["download"]["quality"], "1080");
        assert_eq!(redacted["download"]["nested"]["keep"], "value");
        assert_eq!(redacted["list"][1]["safe"], 1);
    }

    #[test]
    fn data_equal_ignores_id_and_status() {
        let a = sample_row("a", "https://example.com/v");
        let mut b = sample_row("b", "https://example.com/v");
        b.status = "completed".to_string();
        assert!(data_equal(&a, &b));

        b.title = "Changed".to_string();
        assert!(!data_equal(&a, &b));
    }
}
