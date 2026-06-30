use std::collections::HashMap;

use super::get_db;
use crate::types::{
    DownloadDuplicateIdentity, DownloadDuplicateMatch, HistoryAdvancedFilters, HistoryCollection,
    HistoryEntry, HistoryFilterMatchMode, HistoryMediaType, HistorySearchScope, HistorySort,
    HistoryTag,
};
use chrono::Utc;
use rusqlite::{params, params_from_iter, types::Value, Connection};

fn parse_history_row(row: &rusqlite::Row) -> rusqlite::Result<HistoryEntry> {
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
        time_range: row.get(12)?,
        tags: Vec::new(),
        collections: Vec::new(),
    })
}

fn audio_media_sql_condition(history_alias: &str) -> String {
    format!(
        "(LOWER(COALESCE({0}.format, '')) IN ('mp3', 'm4a', 'opus', 'flac', 'wav', 'aac', 'ogg', 'oga') OR LOWER(COALESCE({0}.quality, '')) LIKE '%audio%')",
        history_alias
    )
}

fn normalize_list(values: Option<&Vec<String>>) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::new();
    if let Some(items) = values {
        for item in items {
            let value = item.trim().to_lowercase();
            if value.is_empty() || normalized.iter().any(|v| v == &value) {
                continue;
            }
            normalized.push(value);
        }
    }
    normalized
}

fn normalize_id_list(values: Option<&Vec<String>>) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::new();
    if let Some(items) = values {
        for item in items {
            let value = item.trim().to_string();
            if value.is_empty() || normalized.iter().any(|v| v == &value) {
                continue;
            }
            normalized.push(value);
        }
    }
    normalized
}

fn collapse_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_tag_name(value: &str) -> String {
    let stripped = value.trim().trim_start_matches('#').replace('_', " ");
    collapse_whitespace(&stripped).to_lowercase()
}

fn normalize_collection_name(value: &str) -> String {
    collapse_whitespace(value.trim()).to_lowercase()
}

fn sanitize_display_name(value: &str) -> String {
    collapse_whitespace(value.trim().trim_start_matches('#'))
}

fn normalize_quality(value: &str) -> String {
    let lower = value.trim().to_lowercase();
    if lower.contains("audio") {
        "audio".to_string()
    } else if lower.contains("best") {
        "best".to_string()
    } else if lower.contains("8k") {
        "8k".to_string()
    } else if lower.contains("4k") {
        "4k".to_string()
    } else if lower.contains("2k") {
        "2k".to_string()
    } else if lower.contains("1080") {
        "1080".to_string()
    } else if lower.contains("720") {
        "720".to_string()
    } else if lower.contains("480") {
        "480".to_string()
    } else if lower.contains("360") {
        "360".to_string()
    } else {
        lower
    }
}

fn extract_youtube_video_id(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?.trim_start_matches("www.").to_lowercase();

    if host == "youtu.be" {
        return parsed
            .path_segments()
            .and_then(|mut segments| segments.next())
            .filter(|id| !id.is_empty())
            .map(ToString::to_string);
    }

    if host == "youtube.com" || host.ends_with(".youtube.com") {
        if parsed.path() == "/watch" {
            return parsed
                .query_pairs()
                .find(|(key, _)| key == "v")
                .map(|(_, value)| value.into_owned())
                .filter(|id| !id.is_empty());
        }

        let mut segments = parsed.path_segments()?;
        match segments.next() {
            Some("shorts" | "embed" | "live") => segments
                .next()
                .filter(|id| !id.is_empty())
                .map(ToString::to_string),
            _ => None,
        }
    } else {
        None
    }
}

fn canonicalize_download_url(url: &str) -> String {
    let trimmed = url.trim();
    if let Some(video_id) = extract_youtube_video_id(trimmed) {
        return format!("https://www.youtube.com/watch?v={video_id}");
    }

    let Ok(mut parsed) = reqwest::Url::parse(trimmed) else {
        return trimmed.to_string();
    };

    parsed.set_fragment(None);
    parsed.to_string()
}

fn build_download_media_id(url: &str, _source: Option<&str>) -> Option<String> {
    if let Some(video_id) = extract_youtube_video_id(url) {
        return Some(format!("youtube:{video_id}"));
    }

    None
}

fn build_history_identity(url: &str, source: Option<&str>) -> (Option<String>, String) {
    (
        build_download_media_id(url, source),
        canonicalize_download_url(url),
    )
}

fn duplicate_match_from_values(
    history_id: String,
    title: String,
    thumbnail: Option<String>,
    filepath: String,
    downloaded_at: i64,
    media_id: Option<String>,
    canonical_url: Option<String>,
) -> DownloadDuplicateMatch {
    let downloaded_at = chrono::DateTime::from_timestamp(downloaded_at, 0)
        .map(|date| date.to_rfc3339())
        .unwrap_or_default();

    DownloadDuplicateMatch {
        history_id,
        title,
        thumbnail,
        file_exists: std::path::Path::new(&filepath).exists(),
        filepath,
        downloaded_at,
        media_id,
        canonical_url,
    }
}

fn find_legacy_duplicate_download(
    conn: &Connection,
    media_id: Option<&str>,
    canonical_url: Option<&str>,
) -> Result<Option<DownloadDuplicateMatch>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, thumbnail, filepath, downloaded_at, url, source
             FROM history
             WHERE media_id IS NULL OR canonical_url IS NULL
             ORDER BY downloaded_at DESC",
        )
        .map_err(|e| format!("Failed to prepare legacy duplicate lookup: {}", e))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| format!("Failed to query legacy duplicate lookup: {}", e))?;

    while let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to read legacy duplicate lookup: {}", e))?
    {
        let url: String = row
            .get(5)
            .map_err(|e| format!("Failed to read legacy duplicate URL: {}", e))?;
        let source: Option<String> = row
            .get(6)
            .map_err(|e| format!("Failed to read legacy duplicate source: {}", e))?;
        let (row_media_id, row_canonical_url) = build_history_identity(&url, source.as_deref());
        let media_id_matches = media_id
            .zip(row_media_id.as_deref())
            .is_some_and(|(expected, actual)| expected == actual);
        let canonical_url_matches =
            canonical_url.is_some_and(|expected| expected == row_canonical_url);

        if media_id_matches || canonical_url_matches {
            return Ok(Some(duplicate_match_from_values(
                row.get(0)
                    .map_err(|e| format!("Failed to read legacy duplicate id: {}", e))?,
                row.get(1)
                    .map_err(|e| format!("Failed to read legacy duplicate title: {}", e))?,
                row.get(2)
                    .map_err(|e| format!("Failed to read legacy duplicate thumbnail: {}", e))?,
                row.get(3)
                    .map_err(|e| format!("Failed to read legacy duplicate filepath: {}", e))?,
                row.get(4)
                    .map_err(|e| format!("Failed to read legacy duplicate date: {}", e))?,
                row_media_id,
                Some(row_canonical_url),
            )));
        }
    }

    Ok(None)
}

fn history_search_fts_available(conn: &Connection) -> bool {
    conn.prepare("SELECT rowid FROM history_search_fts WHERE history_search_fts MATCH ? LIMIT 1")
        .is_ok()
}

fn build_fts_query(search: &str, scope: HistorySearchScope) -> Option<String> {
    let terms: Vec<String> = search
        .split_whitespace()
        .map(|term| {
            term.chars()
                .filter(|ch| ch.is_alphanumeric())
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|term| !term.is_empty())
        .take(12)
        .collect();

    if terms.is_empty() {
        return None;
    }

    let column_prefix = match scope {
        HistorySearchScope::All => "",
        HistorySearchScope::Metadata => "{title filepath url}:",
        HistorySearchScope::Summary => "summary:",
    };
    Some(
        terms
            .into_iter()
            .map(|term| format!("{column_prefix}{term}*"))
            .collect::<Vec<_>>()
            .join(" AND "),
    )
}

fn apply_relation_filter(
    query: &mut String,
    params: &mut Vec<Value>,
    history_alias: &str,
    relation_table: &str,
    relation_column: &str,
    ids: &[String],
    match_mode: HistoryFilterMatchMode,
) {
    if ids.is_empty() {
        return;
    }

    let placeholders = vec!["?"; ids.len()].join(", ");
    match match_mode {
        HistoryFilterMatchMode::Any => {
            query.push_str(&format!(
                " AND EXISTS (SELECT 1 FROM {relation_table} rel WHERE rel.history_id = {history_alias}.id AND rel.{relation_column} IN ({placeholders}))"
            ));
        }
        HistoryFilterMatchMode::All => {
            query.push_str(&format!(
                " AND (SELECT COUNT(DISTINCT rel.{relation_column}) FROM {relation_table} rel WHERE rel.history_id = {history_alias}.id AND rel.{relation_column} IN ({placeholders})) = {}",
                ids.len()
            ));
        }
    }

    for id in ids {
        params.push(Value::from(id.clone()));
    }
}

fn apply_history_filters(
    query: &mut String,
    params: &mut Vec<Value>,
    history_alias: &str,
    source: Option<&str>,
    search: Option<&str>,
    filters: Option<&HistoryAdvancedFilters>,
) {
    if let Some(src) = source {
        let src = src.trim();
        if !src.is_empty() && src != "all" {
            query.push_str(&format!(" AND {history_alias}.source = ?"));
            params.push(Value::from(src.to_string()));
        }
    }

    if let Some(search_text) = search.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let search_scope = filters
            .and_then(|filter| filter.search_scope.clone())
            .unwrap_or_default();
        let search_pattern = format!("%{}%", search_text);
        match search_scope {
            HistorySearchScope::All => {
                query.push_str(&format!(
                    " AND ({history_alias}.title LIKE ? OR {history_alias}.filepath LIKE ? OR {history_alias}.url LIKE ? OR COALESCE({history_alias}.summary, '') LIKE ?)"
                ));
                params.push(Value::from(search_pattern.clone()));
                params.push(Value::from(search_pattern.clone()));
                params.push(Value::from(search_pattern.clone()));
                params.push(Value::from(search_pattern));
            }
            HistorySearchScope::Metadata => {
                query.push_str(&format!(
                    " AND ({history_alias}.title LIKE ? OR {history_alias}.filepath LIKE ? OR {history_alias}.url LIKE ?)"
                ));
                params.push(Value::from(search_pattern.clone()));
                params.push(Value::from(search_pattern.clone()));
                params.push(Value::from(search_pattern));
            }
            HistorySearchScope::Summary => {
                query.push_str(&format!(
                    " AND COALESCE({history_alias}.summary, '') LIKE ?"
                ));
                params.push(Value::from(search_pattern));
            }
        }
    }

    if let Some(filter) = filters {
        match filter.media_type {
            Some(HistoryMediaType::Audio) => {
                query.push_str(" AND ");
                query.push_str(&audio_media_sql_condition(history_alias));
            }
            Some(HistoryMediaType::Video) => {
                query.push_str(" AND NOT ");
                query.push_str(&audio_media_sql_condition(history_alias));
                query.push_str(&format!(
                    " AND COALESCE({history_alias}.source, '') != 'data_export'"
                ));
            }
            _ => {}
        }

        if let Some(from) = filter.downloaded_at_from {
            query.push_str(&format!(" AND {history_alias}.downloaded_at >= ?"));
            params.push(Value::from(from));
        }
        if let Some(to) = filter.downloaded_at_to {
            query.push_str(&format!(" AND {history_alias}.downloaded_at <= ?"));
            params.push(Value::from(to));
        }

        let formats = normalize_list(filter.formats.as_ref());
        if !formats.is_empty() {
            query.push_str(&format!(
                " AND LOWER(COALESCE({history_alias}.format, '')) IN ("
            ));
            for (idx, value) in formats.iter().enumerate() {
                if idx > 0 {
                    query.push_str(", ");
                }
                query.push('?');
                params.push(Value::from(value.clone()));
            }
            query.push(')');
        }

        let mut qualities = normalize_list(filter.qualities.as_ref());
        qualities =
            qualities
                .into_iter()
                .map(|q| normalize_quality(&q))
                .fold(Vec::new(), |mut acc, q| {
                    if !q.is_empty() && !acc.iter().any(|existing| existing == &q) {
                        acc.push(q);
                    }
                    acc
                });

        if !qualities.is_empty() {
            query.push_str(" AND (");
            for (idx, quality) in qualities.iter().enumerate() {
                if idx > 0 {
                    query.push_str(" OR ");
                }
                if quality == "audio" {
                    query.push_str(&format!(
                        "(LOWER(COALESCE({history_alias}.quality, '')) LIKE ? OR LOWER(COALESCE({history_alias}.format, '')) IN ('mp3', 'm4a', 'opus', 'flac', 'wav', 'aac', 'ogg', 'oga'))"
                    ));
                } else {
                    query.push_str(&format!(
                        "LOWER(COALESCE({history_alias}.quality, '')) LIKE ?"
                    ));
                }
                params.push(Value::from(format!("%{}%", quality)));
            }
            query.push(')');
        }

        let match_mode = filter.match_mode.clone().unwrap_or_default();
        let tag_ids = normalize_id_list(filter.tag_ids.as_ref());
        apply_relation_filter(
            query,
            params,
            history_alias,
            "history_tags",
            "tag_id",
            &tag_ids,
            match_mode.clone(),
        );

        let collection_ids = normalize_id_list(filter.collection_ids.as_ref());
        apply_relation_filter(
            query,
            params,
            history_alias,
            "history_collections",
            "collection_id",
            &collection_ids,
            match_mode,
        );
    }
}

fn hydrate_history_metadata(conn: &Connection, entries: &mut [HistoryEntry]) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }

    let ids: Vec<String> = entries.iter().map(|entry| entry.id.clone()).collect();
    let placeholders = vec!["?"; ids.len()].join(", ");
    let id_values: Vec<Value> = ids.iter().map(|id| Value::from(id.clone())).collect();

    let tags_query = format!(
        "SELECT ht.history_id, t.id, t.name
         FROM history_tags ht
         JOIN tags t ON t.id = ht.tag_id
         WHERE ht.history_id IN ({placeholders})
         ORDER BY LOWER(t.name) ASC"
    );
    let mut tag_stmt = conn
        .prepare(&tags_query)
        .map_err(|e| format!("Failed to prepare tags query: {}", e))?;
    let mut tags_by_history: HashMap<String, Vec<HistoryTag>> = HashMap::new();
    let tag_rows = tag_stmt
        .query_map(params_from_iter(id_values.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                HistoryTag {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    item_count: None,
                },
            ))
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?;
    for row in tag_rows {
        let (history_id, tag) = row.map_err(|e| format!("Failed to parse tag row: {}", e))?;
        tags_by_history.entry(history_id).or_default().push(tag);
    }

    let collections_query = format!(
        "SELECT hc.history_id, c.id, c.name, c.color
         FROM history_collections hc
         JOIN collections c ON c.id = hc.collection_id
         WHERE hc.history_id IN ({placeholders})
         ORDER BY LOWER(c.name) ASC"
    );
    let mut collection_stmt = conn
        .prepare(&collections_query)
        .map_err(|e| format!("Failed to prepare collections query: {}", e))?;
    let mut collections_by_history: HashMap<String, Vec<HistoryCollection>> = HashMap::new();
    let collection_rows = collection_stmt
        .query_map(params_from_iter(id_values.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                HistoryCollection {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                    item_count: None,
                },
            ))
        })
        .map_err(|e| format!("Failed to query collections: {}", e))?;
    for row in collection_rows {
        let (history_id, collection) =
            row.map_err(|e| format!("Failed to parse collection row: {}", e))?;
        collections_by_history
            .entry(history_id)
            .or_default()
            .push(collection);
    }

    for entry in entries.iter_mut() {
        entry.tags = tags_by_history.remove(&entry.id).unwrap_or_default();
        entry.collections = collections_by_history.remove(&entry.id).unwrap_or_default();
    }

    Ok(())
}

fn ensure_history_exists(conn: &Connection, history_id: &str) -> Result<(), String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM history WHERE id = ?1",
            params![history_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check history entry: {}", e))?;
    if exists == 0 {
        return Err("History entry not found".to_string());
    }
    Ok(())
}

fn find_tag_id_by_normalized_name(
    conn: &Connection,
    normalized_name: &str,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM tags WHERE normalized_name = ?1 LIMIT 1")
        .map_err(|e| format!("Failed to prepare tag lookup: {}", e))?;
    let mut rows = stmt
        .query(params![normalized_name])
        .map_err(|e| format!("Failed to lookup tag: {}", e))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to read tag row: {}", e))?
    {
        let id: String = row
            .get(0)
            .map_err(|e| format!("Failed to parse tag id: {}", e))?;
        Ok(Some(id))
    } else {
        Ok(None)
    }
}

fn ensure_tag_id(conn: &Connection, raw_name: &str) -> Result<Option<String>, String> {
    let display_name = sanitize_display_name(raw_name);
    let normalized_name = normalize_tag_name(raw_name);
    if display_name.is_empty() || normalized_name.is_empty() {
        return Ok(None);
    }

    if let Some(existing_id) = find_tag_id_by_normalized_name(conn, &normalized_name)? {
        return Ok(Some(existing_id));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO tags (id, name, normalized_name, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, display_name, normalized_name, now],
    )
    .map_err(|e| format!("Failed to create tag: {}", e))?;
    Ok(Some(id))
}

fn find_collection_by_normalized_name(
    conn: &Connection,
    normalized_name: &str,
) -> Result<Option<HistoryCollection>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, color FROM collections WHERE normalized_name = ?1 LIMIT 1")
        .map_err(|e| format!("Failed to prepare collection lookup: {}", e))?;
    let mut rows = stmt
        .query(params![normalized_name])
        .map_err(|e| format!("Failed to lookup collection: {}", e))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| format!("Failed to read collection row: {}", e))?
    {
        Ok(Some(HistoryCollection {
            id: row
                .get(0)
                .map_err(|e| format!("Failed to parse collection id: {}", e))?,
            name: row
                .get(1)
                .map_err(|e| format!("Failed to parse collection name: {}", e))?,
            color: row
                .get(2)
                .map_err(|e| format!("Failed to parse collection color: {}", e))?,
            item_count: None,
        }))
    } else {
        Ok(None)
    }
}

pub fn ensure_collection_for_download_in_db(
    name: &str,
    color: Option<String>,
) -> Result<HistoryCollection, String> {
    let conn = get_db()?;
    let display_name = sanitize_display_name(name);
    let normalized_name = normalize_collection_name(name);
    if display_name.is_empty() || normalized_name.is_empty() {
        return Err("Collection name cannot be empty".to_string());
    }

    if let Some(collection) = find_collection_by_normalized_name(&conn, &normalized_name)? {
        return Ok(collection);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO collections (id, name, normalized_name, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, display_name, normalized_name, color, now],
    )
    .map_err(|e| format!("Failed to create collection: {}", e))?;

    Ok(HistoryCollection {
        id,
        name: sanitize_display_name(name),
        color,
        item_count: Some(0),
    })
}

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
    time_range: Option<String>,
) -> Result<String, String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let (media_id, canonical_url) = build_history_identity(&url, source.as_deref());

    conn.execute(
        "INSERT OR REPLACE INTO history (id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at, time_range, media_id, canonical_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            id,
            url,
            title,
            thumbnail,
            filepath,
            filesize,
            duration,
            quality,
            format,
            source,
            now,
            time_range,
            media_id,
            canonical_url
        ],
    )
    .map_err(|e| format!("Failed to add history: {}", e))?;

    conn.execute(
        "DELETE FROM history_tags WHERE history_id NOT IN (SELECT id FROM history)",
        [],
    )
    .ok();
    conn.execute(
        "DELETE FROM history_collections WHERE history_id NOT IN (SELECT id FROM history)",
        [],
    )
    .ok();

    Ok(id)
}

pub fn update_history_summary(id: String, summary: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE history SET summary = ?1 WHERE id = ?2",
        params![summary, id],
    )
    .map_err(|e| format!("Failed to update summary: {}", e))?;
    Ok(())
}

pub fn update_history_download(
    id: String,
    filepath: String,
    filesize: Option<u64>,
    quality: Option<String>,
    format: Option<String>,
    time_range: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE history SET filepath = ?1, filesize = ?2, quality = ?3, format = ?4, downloaded_at = ?5, time_range = ?6 WHERE id = ?7",
        params![filepath, filesize, quality, format, now, time_range, id],
    )
    .map_err(|e| format!("Failed to update history: {}", e))?;
    Ok(())
}

pub fn find_duplicate_downloads_in_history_db(
    identities: Vec<DownloadDuplicateIdentity>,
) -> Result<Vec<DownloadDuplicateMatch>, String> {
    let conn = get_db()?;
    let mut matches = Vec::new();

    for identity in identities {
        let media_id = identity
            .media_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let canonical_url = identity
            .canonical_url
            .as_deref()
            .map(canonicalize_download_url)
            .filter(|value| !value.is_empty());

        if media_id.is_none() && canonical_url.is_none() {
            continue;
        }

        let mut stmt = conn
            .prepare(
                "SELECT id, title, thumbnail, filepath, downloaded_at, media_id, canonical_url
                 FROM history
                 WHERE (?1 IS NOT NULL AND media_id = ?1)
                    OR (?2 IS NOT NULL AND canonical_url = ?2)
                 ORDER BY downloaded_at DESC
                 LIMIT 1",
            )
            .map_err(|e| format!("Failed to prepare duplicate lookup: {}", e))?;

        let row = stmt.query_row(params![media_id, canonical_url.as_deref()], |row| {
            let filepath: String = row.get(3)?;
            Ok(duplicate_match_from_values(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                filepath,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        });

        match row {
            Ok(item) => matches.push(item),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                if let Some(item) =
                    find_legacy_duplicate_download(&conn, media_id, canonical_url.as_deref())?
                {
                    matches.push(item);
                }
            }
            Err(error) => return Err(format!("Failed to lookup duplicate download: {}", error)),
        }
    }

    Ok(matches)
}

pub fn update_history_filepath_and_title(
    old_filepath: String,
    new_filepath: String,
    new_title: String,
) -> Result<(), String> {
    let conn = get_db()?;
    let rows = conn
        .execute(
            "UPDATE history SET filepath = ?1, title = ?2 WHERE filepath = ?3",
            params![new_filepath, new_title, old_filepath],
        )
        .map_err(|e| format!("Failed to update history filepath/title: {}", e))?;
    if rows == 0 {
        return Err("No history entry matched this filepath".to_string());
    }
    Ok(())
}

pub fn update_history_filepath_and_title_by_id(
    id: String,
    new_filepath: String,
    new_title: String,
) -> Result<(), String> {
    let conn = get_db()?;
    let rows = conn
        .execute(
            "UPDATE history SET filepath = ?1, title = ?2 WHERE id = ?3",
            params![new_filepath, new_title, id],
        )
        .map_err(|e| format!("Failed to update history filepath/title by id: {}", e))?;
    if rows == 0 {
        return Err("History entry not found".to_string());
    }
    Ok(())
}

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
    let filepath = "";

    conn.execute(
        "INSERT OR REPLACE INTO history (id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at, summary)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![id, url, title, thumbnail, filepath, Option::<u64>::None, duration, Option::<String>::None, Option::<String>::None, source, now, summary],
    )
    .map_err(|e| format!("Failed to add history: {}", e))?;

    Ok(id)
}

pub fn get_history_from_db(
    limit: Option<i64>,
    offset: Option<i64>,
    source: Option<String>,
    search: Option<String>,
    filters: Option<HistoryAdvancedFilters>,
    sort: Option<HistorySort>,
) -> Result<Vec<HistoryEntry>, String> {
    let conn = get_db()?;

    let limit = limit.filter(|value| *value > 0);
    let offset = offset.unwrap_or(0).max(0);
    let trimmed_search = search.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let search_scope = filters
        .as_ref()
        .and_then(|filter| filter.search_scope.clone())
        .unwrap_or_default();
    let fts_query = trimmed_search
        .and_then(|value| build_fts_query(value, search_scope))
        .filter(|_| history_search_fts_available(&conn));

    let mut query = if fts_query.is_some() {
        String::from(
            "SELECT h.id, h.url, h.title, h.thumbnail, h.filepath, h.filesize, h.duration, h.quality, h.format, h.source, h.downloaded_at, h.summary, h.time_range
             FROM history h
             JOIN history_search_fts ON history_search_fts.rowid = h.rowid
             WHERE history_search_fts MATCH ?",
        )
    } else {
        String::from(
            "SELECT h.id, h.url, h.title, h.thumbnail, h.filepath, h.filesize, h.duration, h.quality, h.format, h.source, h.downloaded_at, h.summary, h.time_range
             FROM history h WHERE 1=1",
        )
    };
    let mut query_params: Vec<Value> = Vec::new();
    if let Some(value) = fts_query.clone() {
        query_params.push(Value::from(value));
    }
    apply_history_filters(
        &mut query,
        &mut query_params,
        "h",
        source.as_deref(),
        if fts_query.is_some() {
            None
        } else {
            trimmed_search
        },
        filters.as_ref(),
    );

    match sort.unwrap_or_default() {
        HistorySort::Recent if fts_query.is_some() => {
            query.push_str(" ORDER BY bm25(history_search_fts) ASC, h.downloaded_at DESC")
        }
        HistorySort::Recent => query.push_str(" ORDER BY h.downloaded_at DESC"),
        HistorySort::Oldest => query.push_str(" ORDER BY h.downloaded_at ASC"),
        HistorySort::Title => query.push_str(" ORDER BY LOWER(h.title) ASC"),
        HistorySort::Size => query.push_str(" ORDER BY h.filesize IS NULL ASC, h.filesize DESC"),
    }
    if let Some(limit) = limit {
        query.push_str(" LIMIT ? OFFSET ?");
        query_params.push(Value::from(limit));
        query_params.push(Value::from(offset));
    }

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let mut entries: Vec<HistoryEntry> = stmt
        .query_map(params_from_iter(query_params.iter()), parse_history_row)
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    hydrate_history_metadata(&conn, &mut entries)?;

    Ok(entries)
}

pub fn get_history_entries_by_ids_from_db(ids: Vec<String>) -> Result<Vec<HistoryEntry>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let conn = get_db()?;
    let placeholders = vec!["?"; ids.len()].join(", ");
    let query = format!(
        "SELECT id, url, title, thumbnail, filepath, filesize, duration, quality, format, source, downloaded_at, summary, time_range
         FROM history
         WHERE id IN ({})",
        placeholders
    );
    let query_params: Vec<Value> = ids.into_iter().map(Value::from).collect();

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let mut entries: Vec<HistoryEntry> = stmt
        .query_map(params_from_iter(query_params.iter()), parse_history_row)
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    hydrate_history_metadata(&conn, &mut entries)?;

    Ok(entries)
}

pub fn delete_history_from_db(id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "DELETE FROM history_tags WHERE history_id = ?1",
        params![id.clone()],
    )
    .map_err(|e| format!("Failed to delete history tags: {}", e))?;
    conn.execute(
        "DELETE FROM history_collections WHERE history_id = ?1",
        params![id.clone()],
    )
    .map_err(|e| format!("Failed to delete history collections: {}", e))?;
    conn.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete history: {}", e))?;
    Ok(())
}

pub fn clear_history_from_db() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM history_tags", [])
        .map_err(|e| format!("Failed to clear history tags: {}", e))?;
    conn.execute("DELETE FROM history_collections", [])
        .map_err(|e| format!("Failed to clear history collections: {}", e))?;
    conn.execute("DELETE FROM history", [])
        .map_err(|e| format!("Failed to clear history: {}", e))?;
    Ok(())
}

pub fn get_history_count_from_db(
    source: Option<String>,
    search: Option<String>,
    filters: Option<HistoryAdvancedFilters>,
) -> Result<i64, String> {
    let conn = get_db()?;

    let trimmed_search = search.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let search_scope = filters
        .as_ref()
        .and_then(|filter| filter.search_scope.clone())
        .unwrap_or_default();
    let fts_query = trimmed_search
        .and_then(|value| build_fts_query(value, search_scope))
        .filter(|_| history_search_fts_available(&conn));

    let mut query = if fts_query.is_some() {
        String::from(
            "SELECT COUNT(*) FROM history h
             JOIN history_search_fts ON history_search_fts.rowid = h.rowid
             WHERE history_search_fts MATCH ?",
        )
    } else {
        String::from("SELECT COUNT(*) FROM history h WHERE 1=1")
    };
    let mut query_params: Vec<Value> = Vec::new();
    if let Some(value) = fts_query.clone() {
        query_params.push(Value::from(value));
    }
    apply_history_filters(
        &mut query,
        &mut query_params,
        "h",
        source.as_deref(),
        if fts_query.is_some() {
            None
        } else {
            trimmed_search
        },
        filters.as_ref(),
    );

    let count: i64 = conn
        .query_row(&query, params_from_iter(query_params.iter()), |row| {
            row.get(0)
        })
        .map_err(|e| format!("Failed to count history: {}", e))?;

    Ok(count)
}

pub fn get_tags_from_db() -> Result<Vec<HistoryTag>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, COUNT(ht.history_id) as item_count
             FROM tags t
             LEFT JOIN history_tags ht ON ht.tag_id = t.id
             GROUP BY t.id, t.name
             ORDER BY LOWER(t.name) ASC",
        )
        .map_err(|e| format!("Failed to prepare tags query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(HistoryTag {
                id: row.get(0)?,
                name: row.get(1)?,
                item_count: Some(row.get(2)?),
            })
        })
        .map_err(|e| format!("Failed to fetch tags: {}", e))?;

    let mut tags = Vec::new();
    for row in rows {
        tags.push(row.map_err(|e| format!("Failed to parse tag row: {}", e))?);
    }
    Ok(tags)
}

pub fn get_collections_from_db() -> Result<Vec<HistoryCollection>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.name, c.color, COUNT(hc.history_id) as item_count
             FROM collections c
             LEFT JOIN history_collections hc ON hc.collection_id = c.id
             GROUP BY c.id, c.name, c.color
             ORDER BY LOWER(c.name) ASC",
        )
        .map_err(|e| format!("Failed to prepare collections query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(HistoryCollection {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                item_count: Some(row.get(3)?),
            })
        })
        .map_err(|e| format!("Failed to fetch collections: {}", e))?;

    let mut collections = Vec::new();
    for row in rows {
        collections.push(row.map_err(|e| format!("Failed to parse collection row: {}", e))?);
    }
    Ok(collections)
}

pub fn create_collection_in_db(
    name: String,
    color: Option<String>,
) -> Result<HistoryCollection, String> {
    let conn = get_db()?;
    let display_name = sanitize_display_name(&name);
    let normalized_name = normalize_collection_name(&name);
    if display_name.is_empty() || normalized_name.is_empty() {
        return Err("Collection name cannot be empty".to_string());
    }

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM collections WHERE normalized_name = ?1",
            params![normalized_name],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check collection: {}", e))?;
    if exists > 0 {
        return Err("Collection already exists".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    conn.execute(
        "INSERT INTO collections (id, name, normalized_name, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, display_name, normalized_name, color, now],
    )
    .map_err(|e| format!("Failed to create collection: {}", e))?;

    Ok(HistoryCollection {
        id,
        name: sanitize_display_name(&name),
        color,
        item_count: Some(0),
    })
}

pub fn rename_collection_in_db(id: String, name: String) -> Result<(), String> {
    let conn = get_db()?;
    let display_name = sanitize_display_name(&name);
    let normalized_name = normalize_collection_name(&name);
    if display_name.is_empty() || normalized_name.is_empty() {
        return Err("Collection name cannot be empty".to_string());
    }

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM collections WHERE normalized_name = ?1 AND id != ?2",
            params![normalized_name, id.clone()],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check collection: {}", e))?;
    if exists > 0 {
        return Err("Collection already exists".to_string());
    }

    let rows = conn
        .execute(
            "UPDATE collections SET name = ?1, normalized_name = ?2 WHERE id = ?3",
            params![display_name, normalized_name, id],
        )
        .map_err(|e| format!("Failed to rename collection: {}", e))?;
    if rows == 0 {
        return Err("Collection not found".to_string());
    }
    Ok(())
}

pub fn delete_collection_from_db(id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "DELETE FROM history_collections WHERE collection_id = ?1",
        params![id.clone()],
    )
    .map_err(|e| format!("Failed to remove collection links: {}", e))?;
    conn.execute("DELETE FROM collections WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete collection: {}", e))?;
    Ok(())
}

pub fn assign_history_tags_in_db(history_id: String, tags: Vec<String>) -> Result<(), String> {
    let conn = get_db()?;
    ensure_history_exists(&conn, &history_id)?;

    let mut tag_ids = Vec::new();
    for raw_tag in tags {
        if let Some(tag_id) = ensure_tag_id(&conn, &raw_tag)? {
            if !tag_ids.iter().any(|existing| existing == &tag_id) {
                tag_ids.push(tag_id);
            }
        }
    }

    conn.execute(
        "DELETE FROM history_tags WHERE history_id = ?1",
        params![history_id.clone()],
    )
    .map_err(|e| format!("Failed to clear history tags: {}", e))?;
    for tag_id in tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO history_tags (history_id, tag_id) VALUES (?1, ?2)",
            params![history_id.clone(), tag_id],
        )
        .map_err(|e| format!("Failed to assign tag: {}", e))?;
    }
    Ok(())
}

pub fn assign_history_collections_in_db(
    history_id: String,
    collection_ids: Vec<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    ensure_history_exists(&conn, &history_id)?;
    let normalized_ids = normalize_id_list(Some(&collection_ids));

    for collection_id in &normalized_ids {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM collections WHERE id = ?1",
                params![collection_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to validate collection: {}", e))?;
        if exists == 0 {
            return Err("Collection not found".to_string());
        }
    }

    conn.execute(
        "DELETE FROM history_collections WHERE history_id = ?1",
        params![history_id.clone()],
    )
    .map_err(|e| format!("Failed to clear history collections: {}", e))?;
    for collection_id in normalized_ids {
        conn.execute(
            "INSERT OR IGNORE INTO history_collections (history_id, collection_id) VALUES (?1, ?2)",
            params![history_id.clone(), collection_id],
        )
        .map_err(|e| format!("Failed to assign collection: {}", e))?;
    }
    Ok(())
}

pub fn add_history_collection_in_db(
    history_id: String,
    collection_id: String,
) -> Result<(), String> {
    let conn = get_db()?;
    ensure_history_exists(&conn, &history_id)?;
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM collections WHERE id = ?1",
            params![collection_id.clone()],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to validate collection: {}", e))?;
    if exists == 0 {
        return Err("Collection not found".to_string());
    }

    conn.execute(
        "INSERT OR IGNORE INTO history_collections (history_id, collection_id) VALUES (?1, ?2)",
        params![history_id, collection_id],
    )
    .map_err(|e| format!("Failed to assign collection: {}", e))?;
    Ok(())
}

pub fn remove_history_tag_from_db(history_id: String, tag_id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "DELETE FROM history_tags WHERE history_id = ?1 AND tag_id = ?2",
        params![history_id, tag_id],
    )
    .map_err(|e| format!("Failed to remove history tag: {}", e))?;
    Ok(())
}

pub fn remove_history_from_collection_in_db(
    history_id: String,
    collection_id: String,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "DELETE FROM history_collections WHERE history_id = ?1 AND collection_id = ?2",
        params![history_id, collection_id],
    )
    .map_err(|e| format!("Failed to remove history collection: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{db_test_guard, get_db, DB_CONNECTION};
    use rusqlite::params;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    fn make_temp_file(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("youwee-history-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join(name);
        fs::write(&path, b"hello").expect("write temp file");
        path
    }

    fn ensure_test_history_tables() {
        if DB_CONNECTION.get().is_none() {
            let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
            let _ = DB_CONNECTION.set(Mutex::new(conn));
        }

        let conn = get_db().expect("get db");
        conn.execute_batch(
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
                time_range TEXT,
                media_id TEXT,
                canonical_url TEXT
            );
            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                normalized_name TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_tags (
                history_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                UNIQUE(history_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                normalized_name TEXT NOT NULL UNIQUE,
                color TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_collections (
                history_id TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                UNIQUE(history_id, collection_id)
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS history_search_fts USING fts5(
                history_id UNINDEXED,
                title,
                filepath,
                url,
                summary,
                tokenize = 'unicode61 remove_diacritics 2'
            );
            CREATE TRIGGER IF NOT EXISTS history_search_insert AFTER INSERT ON history BEGIN
                INSERT INTO history_search_fts (rowid, history_id, title, filepath, url, summary)
                VALUES (new.rowid, new.id, new.title, new.filepath, new.url, COALESCE(new.summary, ''));
            END;
            CREATE TRIGGER IF NOT EXISTS history_search_delete AFTER DELETE ON history BEGIN
                DELETE FROM history_search_fts WHERE rowid = old.rowid;
            END;
            CREATE TRIGGER IF NOT EXISTS history_search_update AFTER UPDATE ON history BEGIN
                DELETE FROM history_search_fts WHERE rowid = old.rowid;
                INSERT INTO history_search_fts (rowid, history_id, title, filepath, url, summary)
                VALUES (new.rowid, new.id, new.title, new.filepath, new.url, COALESCE(new.summary, ''));
            END;",
        )
        .expect("create tables");
        conn.execute("ALTER TABLE history ADD COLUMN summary TEXT", [])
            .ok();
        conn.execute("ALTER TABLE history ADD COLUMN time_range TEXT", [])
            .ok();
        conn.execute("ALTER TABLE history ADD COLUMN media_id TEXT", [])
            .ok();
        conn.execute("ALTER TABLE history ADD COLUMN canonical_url TEXT", [])
            .ok();
        conn.execute("DELETE FROM history_search_fts", [])
            .expect("clear history search");
        conn.execute("DELETE FROM history_tags", [])
            .expect("clear history tags");
        conn.execute("DELETE FROM history_collections", [])
            .expect("clear history collections");
        conn.execute("DELETE FROM tags", []).expect("clear tags");
        conn.execute("DELETE FROM collections", [])
            .expect("clear collections");
        conn.execute("DELETE FROM history", [])
            .expect("clear history");
    }

    fn insert_history_row(id: &str, filepath: &str) {
        let conn = get_db().expect("get db");
        conn.execute(
            "INSERT INTO history (id, url, title, filepath, downloaded_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, "https://example.com/v", "video", filepath, 0_i64],
        )
        .expect("insert history row");
    }

    fn insert_history_search_row(id: &str, title: &str, summary: &str) {
        let conn = get_db().expect("get db");
        conn.execute(
            "INSERT INTO history (id, url, title, filepath, downloaded_at, summary) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, "https://example.com/v", title, "", 0_i64, summary],
        )
        .expect("insert searchable history row");
    }

    #[test]
    fn build_normalized_tag_name_strips_hash_and_underscores() {
        assert_eq!(normalize_tag_name("#Hoc_tap"), "hoc tap");
        assert_eq!(normalize_tag_name("  #Giải_trí  "), "giải trí");
    }

    #[test]
    fn assign_history_tags_reuses_existing_tag() {
        let _guard = db_test_guard();
        ensure_test_history_tables();
        let history_id = uuid::Uuid::new_v4().to_string();
        insert_history_row(&history_id, "");

        assign_history_tags_in_db(
            history_id.clone(),
            vec!["#Học_tập".to_string(), "Học tập".to_string()],
        )
        .expect("assign tags");

        let conn = get_db().expect("get db");
        let tag_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .expect("count tags");
        let rel_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM history_tags", [], |row| row.get(0))
            .expect("count history tags");
        assert_eq!(tag_count, 1);
        assert_eq!(rel_count, 1);
    }

    #[test]
    fn history_filters_by_tag_any_mode() {
        let _guard = db_test_guard();
        ensure_test_history_tables();
        let first_id = uuid::Uuid::new_v4().to_string();
        let second_id = uuid::Uuid::new_v4().to_string();
        insert_history_row(&first_id, "");
        insert_history_row(&second_id, "");

        assign_history_tags_in_db(first_id.clone(), vec!["Study".to_string()]).expect("tag first");
        assign_history_tags_in_db(second_id.clone(), vec!["Fun".to_string()]).expect("tag second");
        let tags = get_tags_from_db().expect("get tags");
        let study_tag_id = tags
            .iter()
            .find(|tag| tag.name == "Study")
            .map(|tag| tag.id.clone())
            .expect("study tag id");

        let filters = HistoryAdvancedFilters {
            tag_ids: Some(vec![study_tag_id]),
            match_mode: Some(HistoryFilterMatchMode::Any),
            ..Default::default()
        };
        let result = get_history_from_db(Some(50), Some(0), None, None, Some(filters), None)
            .expect("filter history");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, first_id);
    }

    #[test]
    fn create_and_assign_collection_counts_items() {
        let _guard = db_test_guard();
        ensure_test_history_tables();
        let history_id = uuid::Uuid::new_v4().to_string();
        insert_history_row(&history_id, "");
        let collection =
            create_collection_in_db("Favorites".to_string(), None).expect("create collection");

        assign_history_collections_in_db(history_id, vec![collection.id.clone()])
            .expect("assign collection");
        let collections = get_collections_from_db().expect("get collections");
        let favorites = collections
            .into_iter()
            .find(|item| item.id == collection.id)
            .expect("favorites collection");
        assert_eq!(favorites.item_count, Some(1));
    }

    #[test]
    fn ensure_collection_reuses_existing_collection_by_normalized_name() {
        let _guard = db_test_guard();
        ensure_test_history_tables();
        let first =
            ensure_collection_for_download_in_db("My Playlist", None).expect("create collection");
        let second = ensure_collection_for_download_in_db("  my playlist  ", None)
            .expect("reuse collection");

        assert_eq!(first.id, second.id);
        assert_eq!(first.name, "My Playlist");
    }

    #[test]
    fn add_history_collection_preserves_existing_assignments() {
        let _guard = db_test_guard();
        ensure_test_history_tables();
        let history_id = uuid::Uuid::new_v4().to_string();
        insert_history_row(&history_id, "");
        let manual =
            create_collection_in_db("Manual".to_string(), None).expect("create manual collection");
        let auto =
            create_collection_in_db("Auto".to_string(), None).expect("create auto collection");

        assign_history_collections_in_db(history_id.clone(), vec![manual.id.clone()])
            .expect("assign manual");
        add_history_collection_in_db(history_id.clone(), auto.id.clone()).expect("append auto");

        let entries = get_history_entries_by_ids_from_db(vec![history_id]).expect("get entry");
        let collection_names: Vec<_> = entries[0]
            .collections
            .iter()
            .map(|collection| collection.name.as_str())
            .collect();
        assert!(collection_names.contains(&"Manual"));
        assert!(collection_names.contains(&"Auto"));
    }

    #[test]
    fn history_fts_search_can_scope_to_ai_summary() {
        let _guard = db_test_guard();
        ensure_test_history_tables();
        let summary_id = uuid::Uuid::new_v4().to_string();
        let title_id = uuid::Uuid::new_v4().to_string();
        insert_history_search_row(
            &summary_id,
            "Cooking notes",
            "SQLite FTS5 keeps local AI summary search fast.",
        );
        insert_history_search_row(&title_id, "SQLite tutorial", "");

        let summary_filters = HistoryAdvancedFilters {
            search_scope: Some(HistorySearchScope::Summary),
            ..Default::default()
        };
        let summary_result = get_history_from_db(
            Some(50),
            Some(0),
            None,
            Some("sqlite".to_string()),
            Some(summary_filters),
            None,
        )
        .expect("search summary");
        assert_eq!(summary_result.len(), 1);
        assert_eq!(summary_result[0].id, summary_id);

        let metadata_filters = HistoryAdvancedFilters {
            search_scope: Some(HistorySearchScope::Metadata),
            ..Default::default()
        };
        let metadata_result = get_history_from_db(
            Some(50),
            Some(0),
            None,
            Some("sqlite".to_string()),
            Some(metadata_filters),
            None,
        )
        .expect("search metadata");
        assert_eq!(metadata_result.len(), 1);
        assert_eq!(metadata_result[0].id, title_id);
    }

    #[test]
    fn add_history_keeps_more_than_legacy_500_entries() {
        let _guard = db_test_guard();
        ensure_test_history_tables();

        for index in 0..501 {
            add_history_internal(
                format!("https://www.youtube.com/watch?v=keep{index}"),
                format!("Video {index}"),
                None,
                format!("/tmp/keep-{index}.mp4"),
                None,
                None,
                Some("1080p".to_string()),
                Some("mp4".to_string()),
                Some("youtube".to_string()),
                None,
            )
            .expect("add history");
        }

        let conn = get_db().expect("get db");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
            .expect("count history");
        assert_eq!(count, 501);
    }

    #[test]
    fn duplicate_download_lookup_matches_media_id_and_canonical_url() {
        let _guard = db_test_guard();
        ensure_test_history_tables();
        let media_id = uuid::Uuid::new_v4().to_string();
        let canonical_id = uuid::Uuid::new_v4().to_string();
        let legacy_id = uuid::Uuid::new_v4().to_string();

        let conn = get_db().expect("get db");
        conn.execute(
            "INSERT INTO history (id, url, title, thumbnail, filepath, source, downloaded_at, media_id, canonical_url)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                media_id,
                "https://www.youtube.com/watch?v=abc123",
                "Existing by ID",
                "https://img.example.com/abc123.jpg",
                "/tmp/id.mp4",
                "youtube",
                1_i64,
                "youtube:abc123",
                "https://www.youtube.com/watch?v=abc123"
            ],
        )
        .expect("insert media id history");
        conn.execute(
            "INSERT INTO history (id, url, title, filepath, source, downloaded_at, media_id, canonical_url)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                canonical_id,
                "https://example.com/watch/456",
                "Existing by URL",
                "/tmp/url.mp4",
                "other",
                2_i64,
                Option::<String>::None,
                "https://example.com/watch/456"
            ],
        )
        .expect("insert canonical history");
        conn.execute(
            "INSERT INTO history (id, url, title, filepath, source, downloaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                legacy_id,
                "https://youtu.be/legacy123?si=abc",
                "Existing legacy URL",
                "/tmp/legacy.mp4",
                "youtube",
                3_i64,
            ],
        )
        .expect("insert legacy history");
        drop(conn);

        let matches = find_duplicate_downloads_in_history_db(vec![
            DownloadDuplicateIdentity {
                media_id: Some("youtube:abc123".to_string()),
                canonical_url: Some("https://www.youtube.com/watch?v=abc123&list=PL".to_string()),
            },
            DownloadDuplicateIdentity {
                media_id: None,
                canonical_url: Some("https://example.com/watch/456".to_string()),
            },
            DownloadDuplicateIdentity {
                media_id: Some("youtube:legacy123".to_string()),
                canonical_url: Some("https://www.youtube.com/watch?v=legacy123".to_string()),
            },
            DownloadDuplicateIdentity {
                media_id: Some("youtube:not-downloaded".to_string()),
                canonical_url: None,
            },
        ])
        .expect("find duplicates");

        assert_eq!(matches.len(), 3);
        assert_eq!(matches[0].title, "Existing by ID");
        assert_eq!(
            matches[0].thumbnail.as_deref(),
            Some("https://img.example.com/abc123.jpg")
        );
        assert_eq!(matches[1].title, "Existing by URL");
        assert_eq!(matches[2].history_id, legacy_id);
        assert_eq!(matches[2].title, "Existing legacy URL");
        assert_eq!(
            matches[2].canonical_url.as_deref(),
            Some("https://www.youtube.com/watch?v=legacy123")
        );
    }

    #[test]
    fn build_renamed_path_keeps_extension() {
        let old = make_temp_file("video.mp4");
        let old_path = old.clone();
        let validated_name = "new video".to_string();
        let mut new_file_name = std::ffi::OsString::from(&validated_name);
        if let Some(ext) = old.extension().filter(|e| !e.is_empty()) {
            new_file_name.push(".");
            new_file_name.push(ext);
        }
        let new_path = old.parent().unwrap().join(new_file_name);
        assert_eq!(
            new_path.file_name().and_then(|s| s.to_str()),
            Some("new video.mp4")
        );
        let _ = fs::remove_file(&old_path);
        let _ = fs::remove_dir_all(old_path.parent().unwrap_or_else(|| Path::new("/")));
    }
}
