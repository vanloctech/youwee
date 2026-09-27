use super::get_db;
use crate::types::{ChannelVideo, CreatorProcessingSettings, FollowedChannel};
use chrono::Utc;
use rusqlite::{params, params_from_iter, types::Value};
use serde::Serialize;

#[derive(Debug, Clone)]
pub struct BulkFollowChannelRecord {
    pub url: String,
    pub name: String,
    pub thumbnail: Option<String>,
    pub platform: String,
    pub download_quality: String,
    pub download_format: String,
    pub download_video_codec: String,
    pub download_audio_bitrate: String,
    pub download_preferred_fps: String,
    pub youtube_content_type: String,
    pub creator_processing: CreatorProcessingSettings,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkChannelMutationResult {
    pub requested: usize,
    pub changed: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

fn parse_creator_processing(value: String) -> CreatorProcessingSettings {
    serde_json::from_str(&value).unwrap_or_default()
}

fn epoch_to_rfc3339(value: Option<i64>) -> Option<String> {
    value
        .and_then(|timestamp| chrono::DateTime::from_timestamp(timestamp, 0))
        .map(|value| value.to_rfc3339())
}

fn parse_edited_output_paths(value: String) -> Vec<String> {
    serde_json::from_str(&value).unwrap_or_default()
}

/// Follow a channel
pub fn follow_channel_db(
    url: String,
    name: String,
    thumbnail: Option<String>,
    platform: String,
    download_quality: String,
    download_format: String,
    download_video_codec: String,
    download_audio_bitrate: String,
    download_preferred_fps: String,
    youtube_content_type: String,
    creator_processing: CreatorProcessingSettings,
) -> Result<String, String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let creator_processing_json = serde_json::to_string(&creator_processing)
        .map_err(|e| format!("Failed to serialize creator settings: {}", e))?;
    let rows = conn.execute(
        "INSERT OR IGNORE INTO followed_channels (id, url, name, thumbnail, platform, download_quality, download_format, download_video_codec, download_audio_bitrate, download_preferred_fps, youtube_content_type, creator_processing_json, download_threads, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 3, ?13)",
        params![id, url, name, thumbnail, platform, download_quality, download_format, download_video_codec, download_audio_bitrate, download_preferred_fps, youtube_content_type, creator_processing_json, now],
    )
    .map_err(|e| format!("Failed to follow channel: {}", e))?;

    if rows > 0 {
        return Ok(id);
    }

    conn.query_row(
        "SELECT id FROM followed_channels WHERE url = ?1",
        params![url],
        |row| row.get::<_, String>(0),
    )
    .map_err(|e| format!("Failed to get existing channel: {}", e))
}

/// Unfollow a channel
pub fn unfollow_channel_db(id: String) -> Result<(), String> {
    let conn = get_db()?;
    // Delete channel videos first (cascade may not work with all SQLite builds)
    conn.execute(
        "DELETE FROM channel_videos WHERE channel_id = ?1",
        params![id],
    )
    .map_err(|e| format!("Failed to delete channel videos: {}", e))?;
    conn.execute("DELETE FROM followed_channels WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to unfollow channel: {}", e))?;
    Ok(())
}

/// Get all followed channels
pub fn get_followed_channels_db() -> Result<Vec<FollowedChannel>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, url, name, thumbnail, platform, last_checked_at, last_video_id,
                    check_interval, auto_download, download_quality, download_format, created_at,
                    filter_min_duration, filter_max_duration, filter_include_keywords,
                    filter_exclude_keywords, filter_max_videos, download_threads,
                    download_video_codec, download_audio_bitrate, download_preferred_fps,
                    youtube_content_type, creator_processing_json,
                    (SELECT MAX(downloaded_at) FROM channel_videos WHERE channel_id = followed_channels.id),
                    (SELECT COUNT(*) FROM channel_videos WHERE channel_id = followed_channels.id AND status = 'downloaded')
             FROM followed_channels ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let channels = stmt
        .query_map([], |row| {
            Ok(FollowedChannel {
                id: row.get(0)?,
                url: row.get(1)?,
                name: row.get(2)?,
                thumbnail: row.get(3)?,
                platform: row.get(4)?,
                last_checked_at: row.get(5)?,
                last_video_id: row.get(6)?,
                last_downloaded_at: epoch_to_rfc3339(row.get(23)?),
                downloaded_video_count: row.get(24)?,
                check_interval: row.get(7)?,
                auto_download: row.get::<_, i64>(8)? != 0,
                download_quality: row.get(9)?,
                download_format: row.get(10)?,
                created_at: row.get(11)?,
                filter_min_duration: row.get(12)?,
                filter_max_duration: row.get(13)?,
                filter_include_keywords: row.get(14)?,
                filter_exclude_keywords: row.get(15)?,
                filter_max_videos: row.get(16)?,
                download_threads: row.get(17)?,
                download_video_codec: row.get(18)?,
                download_audio_bitrate: row.get(19)?,
                download_preferred_fps: row.get(20)?,
                youtube_content_type: row.get(21)?,
                creator_processing: parse_creator_processing(row.get::<_, String>(22)?),
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(channels)
}

/// Get a single followed channel by ID
pub fn get_followed_channel_db(id: String) -> Result<FollowedChannel, String> {
    let conn = get_db()?;
    conn.query_row(
        "SELECT id, url, name, thumbnail, platform, last_checked_at, last_video_id,
                check_interval, auto_download, download_quality, download_format, created_at,
                filter_min_duration, filter_max_duration, filter_include_keywords,
                filter_exclude_keywords, filter_max_videos, download_threads,
                download_video_codec, download_audio_bitrate, download_preferred_fps,
                youtube_content_type, creator_processing_json,
                (SELECT MAX(downloaded_at) FROM channel_videos WHERE channel_id = followed_channels.id),
                (SELECT COUNT(*) FROM channel_videos WHERE channel_id = followed_channels.id AND status = 'downloaded')
         FROM followed_channels WHERE id = ?1",
        params![id],
        |row| {
            Ok(FollowedChannel {
                id: row.get(0)?,
                url: row.get(1)?,
                name: row.get(2)?,
                thumbnail: row.get(3)?,
                platform: row.get(4)?,
                last_checked_at: row.get(5)?,
                last_video_id: row.get(6)?,
                last_downloaded_at: epoch_to_rfc3339(row.get(23)?),
                downloaded_video_count: row.get(24)?,
                check_interval: row.get(7)?,
                auto_download: row.get::<_, i64>(8)? != 0,
                download_quality: row.get(9)?,
                download_format: row.get(10)?,
                created_at: row.get(11)?,
                filter_min_duration: row.get(12)?,
                filter_max_duration: row.get(13)?,
                filter_include_keywords: row.get(14)?,
                filter_exclude_keywords: row.get(15)?,
                filter_max_videos: row.get(16)?,
                download_threads: row.get(17)?,
                download_video_codec: row.get(18)?,
                download_audio_bitrate: row.get(19)?,
                download_preferred_fps: row.get(20)?,
                youtube_content_type: row.get(21)?,
                creator_processing: parse_creator_processing(row.get::<_, String>(22)?),
            })
        },
    )
    .map_err(|e| format!("Channel not found: {}", e))
}

/// Update channel settings
pub fn update_channel_settings_db(
    id: String,
    check_interval: i64,
    auto_download: bool,
    download_quality: String,
    download_format: String,
    download_video_codec: String,
    download_audio_bitrate: String,
    download_preferred_fps: String,
    filter_min_duration: Option<i64>,
    filter_max_duration: Option<i64>,
    filter_include_keywords: Option<String>,
    filter_exclude_keywords: Option<String>,
    filter_max_videos: Option<i64>,
    download_threads: i64,
    youtube_content_type: String,
    creator_processing: CreatorProcessingSettings,
) -> Result<(), String> {
    let conn = get_db()?;
    let creator_processing_json = serde_json::to_string(&creator_processing)
        .map_err(|e| format!("Failed to serialize creator settings: {}", e))?;
    conn.execute(
        "UPDATE followed_channels SET
            check_interval = ?1, auto_download = ?2, download_quality = ?3,
            download_format = ?4, download_video_codec = ?5, download_audio_bitrate = ?6,
            download_preferred_fps = ?7, filter_min_duration = ?8, filter_max_duration = ?9,
            filter_include_keywords = ?10, filter_exclude_keywords = ?11, filter_max_videos = ?12,
            download_threads = ?13, youtube_content_type = ?14, creator_processing_json = ?15
         WHERE id = ?16",
        params![
            check_interval,
            auto_download as i64,
            download_quality,
            download_format,
            download_video_codec,
            download_audio_bitrate,
            download_preferred_fps,
            filter_min_duration,
            filter_max_duration,
            filter_include_keywords,
            filter_exclude_keywords,
            filter_max_videos,
            download_threads,
            youtube_content_type,
            creator_processing_json,
            id,
        ],
    )
    .map_err(|e| format!("Failed to update channel settings: {}", e))?;
    Ok(())
}

/// Update last checked info for a channel
pub fn update_channel_last_checked_db(
    id: String,
    last_video_id: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE followed_channels SET last_checked_at = ?1, last_video_id = ?2 WHERE id = ?3",
        params![now, last_video_id, id],
    )
    .map_err(|e| format!("Failed to update last checked: {}", e))?;
    Ok(())
}

/// Save channel videos (upsert - skip existing)
pub fn save_channel_videos_db(
    channel_id: String,
    videos: Vec<ChannelVideo>,
) -> Result<usize, String> {
    Ok(save_new_channel_videos_db(channel_id, videos)?.len())
}

/// Follow many channels in one SQLite transaction. Duplicate URLs are skipped.
pub fn bulk_follow_channels_db(
    records: Vec<BulkFollowChannelRecord>,
) -> Result<BulkChannelMutationResult, String> {
    let mut conn = get_db()?;
    let requested = records.len();
    let transaction = conn
        .transaction()
        .map_err(|e| format!("Failed to start bulk follow transaction: {}", e))?;
    let now = Utc::now().to_rfc3339();
    let mut result = BulkChannelMutationResult {
        requested,
        ..Default::default()
    };

    for record in records {
        if record.url.trim().is_empty() || record.name.trim().is_empty() {
            result.skipped += 1;
            result
                .errors
                .push("Channel URL or name is empty".to_string());
            continue;
        }
        let id = uuid::Uuid::new_v4().to_string();
        let creator_processing_json = serde_json::to_string(&record.creator_processing)
            .map_err(|e| format!("Failed to serialize creator settings: {}", e))?;
        let rows = transaction
            .execute(
                "INSERT OR IGNORE INTO followed_channels
                 (id, url, name, thumbnail, platform, download_quality, download_format,
                  download_video_codec, download_audio_bitrate, download_preferred_fps,
                  youtube_content_type, creator_processing_json, download_threads, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 3, ?13)",
                params![
                    id,
                    record.url,
                    record.name,
                    record.thumbnail,
                    record.platform,
                    record.download_quality,
                    record.download_format,
                    record.download_video_codec,
                    record.download_audio_bitrate,
                    record.download_preferred_fps,
                    record.youtube_content_type,
                    creator_processing_json,
                    now,
                ],
            )
            .map_err(|e| format!("Failed to bulk follow channel: {}", e))?;
        if rows == 0 {
            result.skipped += 1;
        } else {
            result.changed += 1;
        }
    }

    transaction
        .commit()
        .map_err(|e| format!("Failed to commit bulk follow: {}", e))?;
    Ok(result)
}

/// Unfollow many channels in one SQLite transaction. Saved channel videos are
/// removed just like the single-channel unfollow command; download history is
/// intentionally preserved for duplicate detection and the Library page.
pub fn bulk_unfollow_channels_db(ids: Vec<String>) -> Result<BulkChannelMutationResult, String> {
    let mut conn = get_db()?;
    let requested = ids.len();
    let transaction = conn
        .transaction()
        .map_err(|e| format!("Failed to start bulk unfollow transaction: {}", e))?;
    let mut result = BulkChannelMutationResult {
        requested,
        ..Default::default()
    };

    for id in ids {
        let deleted_videos = transaction
            .execute(
                "DELETE FROM channel_videos WHERE channel_id = ?1",
                params![id],
            )
            .map_err(|e| format!("Failed to delete channel videos: {}", e))?;
        let deleted_channel = transaction
            .execute("DELETE FROM followed_channels WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to bulk unfollow channel: {}", e))?;
        if deleted_channel == 0 && deleted_videos == 0 {
            result.skipped += 1;
        } else {
            result.changed += 1;
        }
    }

    transaction
        .commit()
        .map_err(|e| format!("Failed to commit bulk unfollow: {}", e))?;
    Ok(result)
}

/// Apply shared download settings to many followed channels in one transaction.
pub fn bulk_update_channel_settings_db(
    ids: Vec<String>,
    check_interval: i64,
    auto_download: bool,
    download_quality: String,
    download_format: String,
    download_video_codec: String,
    download_audio_bitrate: String,
    download_preferred_fps: String,
    download_threads: i64,
    youtube_content_type: String,
    creator_processing: CreatorProcessingSettings,
) -> Result<BulkChannelMutationResult, String> {
    let mut conn = get_db()?;
    let requested = ids.len();
    let transaction = conn
        .transaction()
        .map_err(|e| format!("Failed to start bulk update transaction: {}", e))?;
    let mut result = BulkChannelMutationResult {
        requested,
        ..Default::default()
    };
    let creator_processing_json = serde_json::to_string(&creator_processing)
        .map_err(|e| format!("Failed to serialize creator settings: {}", e))?;

    for id in ids {
        let rows = transaction
            .execute(
                "UPDATE followed_channels SET
                    check_interval = ?1, auto_download = ?2, download_quality = ?3,
                    download_format = ?4, download_video_codec = ?5, download_audio_bitrate = ?6,
                    download_preferred_fps = ?7, download_threads = ?8, youtube_content_type = ?9,
                    creator_processing_json = ?10
                 WHERE id = ?11",
                params![
                    check_interval,
                    auto_download as i64,
                    download_quality,
                    download_format,
                    download_video_codec,
                    download_audio_bitrate,
                    download_preferred_fps,
                    download_threads,
                    youtube_content_type,
                    creator_processing_json,
                    id,
                ],
            )
            .map_err(|e| format!("Failed to bulk update channel settings: {}", e))?;
        if rows == 0 {
            result.skipped += 1;
        } else {
            result.changed += 1;
        }
    }

    transaction
        .commit()
        .map_err(|e| format!("Failed to commit bulk update: {}", e))?;
    Ok(result)
}

/// Apply only the creator/edit snapshot to many channels without changing
/// their auto-download, quality, filters, or polling settings.
pub fn bulk_update_channel_creator_processing_db(
    ids: Vec<String>,
    creator_processing: CreatorProcessingSettings,
) -> Result<BulkChannelMutationResult, String> {
    let mut conn = get_db()?;
    let requested = ids.len();
    let transaction = conn
        .transaction()
        .map_err(|e| format!("Failed to start bulk creator update transaction: {}", e))?;
    let creator_processing_json = serde_json::to_string(&creator_processing)
        .map_err(|e| format!("Failed to serialize creator settings: {}", e))?;
    let mut result = BulkChannelMutationResult {
        requested,
        ..Default::default()
    };

    for id in ids {
        let rows = transaction
            .execute(
                "UPDATE followed_channels SET creator_processing_json = ?1 WHERE id = ?2",
                params![creator_processing_json, id],
            )
            .map_err(|e| format!("Failed to bulk update channel creator settings: {}", e))?;
        if rows == 0 {
            result.skipped += 1;
        } else {
            result.changed += 1;
        }
    }

    transaction
        .commit()
        .map_err(|e| format!("Failed to commit bulk creator update: {}", e))?;
    Ok(result)
}

/// Save channel videos and return only rows inserted by this call.
///
/// The polling service uses this result for notifications. Returning the
/// inserted rows prevents a repeated scan from notifying about videos that
/// were already present in the database.
pub fn save_new_channel_videos_db(
    channel_id: String,
    videos: Vec<ChannelVideo>,
) -> Result<Vec<ChannelVideo>, String> {
    let conn = get_db()?;
    let mut inserted = Vec::new();

    for video in &videos {
        let rows = conn
            .execute(
            "INSERT OR IGNORE INTO channel_videos
                (id, channel_id, video_id, title, url, thumbnail, duration, upload_date, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                video.id,
                channel_id,
                video.video_id,
                video.title,
                video.url,
                video.thumbnail,
                video.duration,
                video.upload_date,
                video.status,
                video.created_at,
            ],
            )
            .map_err(|e| format!("Failed to save channel video: {}", e))?;

        if rows > 0 {
            inserted.push(video.clone());
        }
    }

    Ok(inserted)
}

/// Get videos for a channel
pub fn get_channel_videos_db(
    channel_id: String,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ChannelVideo>, String> {
    let conn = get_db()?;
    let limit = limit.unwrap_or(50);

    let has_status = status
        .as_ref()
        .map(|s| !s.is_empty() && s != "all")
        .unwrap_or(false);

    let query = if has_status {
        "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, status, created_at,
                downloaded_at, output_path, edited_output_paths_json
         FROM channel_videos WHERE channel_id = ?1 AND status = ?2
         ORDER BY created_at DESC LIMIT ?3"
    } else {
        "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, status, created_at,
                downloaded_at, output_path, edited_output_paths_json
         FROM channel_videos WHERE channel_id = ?1
         ORDER BY created_at DESC LIMIT ?2"
    };

    let mut stmt = conn
        .prepare(query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let parse_row = |row: &rusqlite::Row| -> rusqlite::Result<ChannelVideo> {
        Ok(ChannelVideo {
            id: row.get(0)?,
            channel_id: row.get(1)?,
            video_id: row.get(2)?,
            title: row.get(3)?,
            url: row.get(4)?,
            thumbnail: row.get(5)?,
            duration: row.get(6)?,
            upload_date: row.get(7)?,
            status: row.get(8)?,
            created_at: row.get(9)?,
            downloaded_at: epoch_to_rfc3339(row.get(10)?),
            output_path: row.get(11)?,
            edited_output_paths: parse_edited_output_paths(row.get(12)?),
        })
    };

    let videos: Vec<ChannelVideo> = if has_status {
        let s = status.unwrap();
        stmt.query_map(params![channel_id, s, limit], parse_row)
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map(params![channel_id, limit], parse_row)
            .map_err(|e| format!("Query failed: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(videos)
}

/// Get videos for a channel by exact video IDs
pub fn get_channel_videos_by_video_ids_db(
    channel_id: String,
    video_ids: Vec<String>,
) -> Result<Vec<ChannelVideo>, String> {
    if video_ids.is_empty() {
        return Ok(Vec::new());
    }

    let conn = get_db()?;
    sync_channel_video_statuses_from_history(&conn, &channel_id, &video_ids)?;

    let placeholders = std::iter::repeat("?")
        .take(video_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, status, created_at,
                downloaded_at, output_path, edited_output_paths_json
         FROM channel_videos
         WHERE channel_id = ? AND video_id IN ({placeholders})"
    );

    let mut values = Vec::with_capacity(video_ids.len() + 1);
    values.push(Value::Text(channel_id));
    values.extend(video_ids.into_iter().map(Value::Text));

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let videos = stmt
        .query_map(params_from_iter(values), |row| {
            Ok(ChannelVideo {
                id: row.get(0)?,
                channel_id: row.get(1)?,
                video_id: row.get(2)?,
                title: row.get(3)?,
                url: row.get(4)?,
                thumbnail: row.get(5)?,
                duration: row.get(6)?,
                upload_date: row.get(7)?,
                status: row.get(8)?,
                created_at: row.get(9)?,
                downloaded_at: epoch_to_rfc3339(row.get(10)?),
                output_path: row.get(11)?,
                edited_output_paths: parse_edited_output_paths(row.get(12)?),
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(videos)
}

fn sync_channel_video_statuses_from_history(
    conn: &rusqlite::Connection,
    channel_id: &str,
    video_ids: &[String],
) -> Result<(), String> {
    if video_ids.is_empty() {
        return Ok(());
    }

    let placeholders = std::iter::repeat("?")
        .take(video_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!(
        "SELECT cv.id, h.filepath
         FROM channel_videos cv
         JOIN history h ON h.filepath != ''
            AND (h.url = cv.url OR h.url LIKE '%' || cv.video_id || '%')
         WHERE cv.channel_id = ?
            AND cv.video_id IN ({placeholders})
            AND cv.status != 'downloaded'"
    );

    let mut values = Vec::with_capacity(video_ids.len() + 1);
    values.push(Value::Text(channel_id.to_string()));
    values.extend(video_ids.iter().cloned().map(Value::Text));

    let candidate_ids = {
        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare history sync query: {}", e))?;
        let rows = stmt
            .query_map(params_from_iter(values), |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("History sync query failed: {}", e))?;
        rows.filter_map(|row| row.ok())
            .filter(|(_, filepath)| std::path::Path::new(filepath).exists())
            .collect::<Vec<_>>()
    };

    for (id, filepath) in candidate_ids {
        conn.execute(
            "UPDATE channel_videos SET status = 'downloaded', output_path = ?2,
                downloaded_at = COALESCE(downloaded_at, ?3) WHERE id = ?1",
            params![id, filepath, chrono::Utc::now().timestamp()],
        )
        .map_err(|e| format!("Failed to sync channel video status from history: {}", e))?;
    }

    Ok(())
}

/// Update video status
pub fn update_channel_video_status_db(id: String, status: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE channel_videos SET status = ?1 WHERE id = ?2",
        params![status, id],
    )
    .map_err(|e| format!("Failed to update video status: {}", e))?;
    Ok(())
}

/// Update video status by channel_id + video_id (YouTube video ID)
pub fn update_channel_video_status_by_video_id_db(
    channel_id: String,
    video_id: String,
    status: String,
    filepath: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    let downloaded_at = (status == "downloaded").then(|| chrono::Utc::now().timestamp());
    conn.execute(
        "UPDATE channel_videos SET status = ?1,
            downloaded_at = COALESCE(?4, downloaded_at),
            output_path = COALESCE(?5, output_path)
         WHERE channel_id = ?2 AND video_id = ?3",
        params![status, channel_id, video_id, downloaded_at, filepath],
    )
    .map_err(|e| format!("Failed to update video status: {}", e))?;
    Ok(())
}

pub fn complete_channel_creator_processing_db(
    channel_id: String,
    video_id: String,
    output_paths: Vec<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    let output_paths_json = serde_json::to_string(&output_paths)
        .map_err(|error| format!("Failed to serialize edited output paths: {error}"))?;
    let primary_path = output_paths.first().cloned();
    conn.execute(
        "UPDATE channel_videos SET status = 'downloaded', downloaded_at = ?1,
            edited_output_paths_json = ?2, output_path = COALESCE(?3, output_path)
         WHERE channel_id = ?4 AND video_id = ?5",
        params![
            chrono::Utc::now().timestamp(),
            output_paths_json,
            primary_path,
            channel_id,
            video_id
        ],
    )
    .map_err(|error| format!("Failed to save edited channel outputs: {error}"))?;
    Ok(())
}

/// Get channel_id for a followed channel by URL
pub fn get_channel_id_by_url_db(url: String) -> Result<Option<String>, String> {
    let conn = get_db()?;
    let result = conn.query_row(
        "SELECT id FROM followed_channels WHERE url = ?1",
        params![url],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get channel id: {}", e)),
    }
}

/// Update channel name and thumbnail (avatar)
pub fn update_channel_info_db(
    id: String,
    name: String,
    thumbnail: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET name = ?1, thumbnail = ?2 WHERE id = ?3",
        params![name, thumbnail, id],
    )
    .map_err(|e| format!("Failed to update channel info: {}", e))?;
    Ok(())
}

/// Get count of new videos for a channel
pub fn get_new_videos_count_db(channel_id: Option<String>) -> Result<i64, String> {
    let conn = get_db()?;
    let count: i64 = if let Some(cid) = channel_id {
        conn.query_row(
            "SELECT COUNT(*) FROM channel_videos WHERE channel_id = ?1 AND status = 'new'",
            params![cid],
            |row| row.get(0),
        )
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM channel_videos WHERE status = 'new'",
            [],
            |row| row.get(0),
        )
    }
    .map_err(|e| format!("Failed to count new videos: {}", e))?;

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{db_test_guard, get_db, DB_CONNECTION};
    use std::sync::Mutex;

    fn ensure_test_channel_tables() {
        if DB_CONNECTION.get().is_none() {
            let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
            let _ = DB_CONNECTION.set(Mutex::new(conn));
        }

        let conn = get_db().expect("get db");
        conn.execute_batch(
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
                download_threads INTEGER NOT NULL DEFAULT 3,
                download_video_codec TEXT NOT NULL DEFAULT 'h264',
                download_audio_bitrate TEXT NOT NULL DEFAULT '192',
                download_preferred_fps TEXT NOT NULL DEFAULT 'original',
                youtube_content_type TEXT NOT NULL DEFAULT 'videos',
                creator_processing_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS channel_videos (
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
                downloaded_at INTEGER,
                output_path TEXT,
                edited_output_paths_json TEXT NOT NULL DEFAULT '[]'
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_videos_unique
                ON channel_videos(channel_id, video_id);
            CREATE TABLE IF NOT EXISTS history (
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
            );
            DELETE FROM history;
            DELETE FROM channel_videos;
            DELETE FROM followed_channels;",
        )
        .expect("create channel videos table");
    }

    fn insert_channel_video(channel_id: &str, video_id: &str, status: &str, created_at: &str) {
        let conn = get_db().expect("get db");
        conn.execute(
            "INSERT INTO channel_videos
                (id, channel_id, video_id, title, url, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                channel_id,
                video_id,
                format!("Video {video_id}"),
                format!("https://youtube.com/watch?v={video_id}"),
                status,
                created_at,
            ],
        )
        .expect("insert channel video");
    }

    fn make_temp_download_file() -> String {
        let dir =
            std::env::temp_dir().join(format!("youwee-channel-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("download.mp4");
        std::fs::write(&path, b"download").expect("write temp download");
        path.to_string_lossy().to_string()
    }

    fn insert_history_row(url: &str, filepath: &str) {
        let conn = get_db().expect("get db");
        conn.execute(
            "INSERT INTO history (id, url, title, filepath, downloaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                url,
                "Downloaded video",
                filepath,
                0_i64,
            ],
        )
        .expect("insert history row");
    }

    #[test]
    fn get_channel_videos_by_video_ids_returns_requested_old_records() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        for index in 0..200 {
            insert_channel_video(
                "channel-1",
                &format!("video-{index}"),
                if index % 2 == 0 { "downloaded" } else { "new" },
                &format!("2026-06-17T00:{index:03}:00Z"),
            );
        }

        let videos = get_channel_videos_by_video_ids_db(
            "channel-1".to_string(),
            vec![
                "video-0".to_string(),
                "video-42".to_string(),
                "video-199".to_string(),
            ],
        )
        .expect("get videos by ids");

        let statuses: std::collections::HashMap<_, _> = videos
            .into_iter()
            .map(|video| (video.video_id, video.status))
            .collect();

        assert_eq!(
            statuses.get("video-0").map(String::as_str),
            Some("downloaded")
        );
        assert_eq!(
            statuses.get("video-42").map(String::as_str),
            Some("downloaded")
        );
        assert_eq!(statuses.get("video-199").map(String::as_str), Some("new"));
    }

    #[test]
    fn get_channel_videos_by_video_ids_marks_existing_history_file_as_downloaded() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        insert_channel_video("channel-1", "abc123", "new", "2026-06-17T00:00:00Z");
        let filepath = make_temp_download_file();
        insert_history_row("https://www.youtube.com/watch?v=abc123", &filepath);

        let videos =
            get_channel_videos_by_video_ids_db("channel-1".to_string(), vec!["abc123".to_string()])
                .expect("get videos by ids");

        assert_eq!(
            videos.first().map(|video| video.status.as_str()),
            Some("downloaded")
        );
    }

    #[test]
    fn follow_channel_db_returns_existing_id_for_duplicate_url() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        let first_id = follow_channel_db(
            "https://www.youtube.com/@demo".to_string(),
            "Demo".to_string(),
            None,
            "youtube".to_string(),
            "best".to_string(),
            "mp4".to_string(),
            "h264".to_string(),
            "192".to_string(),
            "original".to_string(),
            "videos".to_string(),
            CreatorProcessingSettings::default(),
        )
        .expect("follow channel first time");

        let second_id = follow_channel_db(
            "https://www.youtube.com/@demo".to_string(),
            "Demo again".to_string(),
            None,
            "youtube".to_string(),
            "best".to_string(),
            "mp4".to_string(),
            "h264".to_string(),
            "192".to_string(),
            "original".to_string(),
            "videos".to_string(),
            CreatorProcessingSettings::default(),
        )
        .expect("follow channel second time");

        let count: i64 = get_db()
            .expect("get db")
            .query_row(
                "SELECT COUNT(*) FROM followed_channels WHERE url = ?1",
                params!["https://www.youtube.com/@demo"],
                |row| row.get(0),
            )
            .expect("count followed channels");

        assert_eq!(second_id, first_id);
        assert_eq!(count, 1);
    }

    #[test]
    fn bulk_creator_update_preserves_channel_download_settings() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();

        let id = follow_channel_db(
            "https://www.youtube.com/@creator-settings".to_string(),
            "Creator settings".to_string(),
            None,
            "youtube".to_string(),
            "1080".to_string(),
            "mkv".to_string(),
            "vp9".to_string(),
            "320".to_string(),
            "30".to_string(),
            "shorts".to_string(),
            CreatorProcessingSettings::default(),
        )
        .expect("follow channel");
        get_db()
            .expect("get db")
            .execute(
                "UPDATE followed_channels SET auto_download = 1, check_interval = 42 WHERE id = ?1",
                params![id],
            )
            .expect("customize channel settings");

        let creator_processing = CreatorProcessingSettings {
            mode: "parts".to_string(),
            part_count: 5,
            ..Default::default()
        };
        let result =
            bulk_update_channel_creator_processing_db(vec![id.clone()], creator_processing.clone())
                .expect("bulk update creator settings");
        let channel = get_followed_channel_db(id).expect("load updated channel");

        assert_eq!(result.changed, 1);
        assert!(channel.auto_download);
        assert_eq!(channel.check_interval, 42);
        assert_eq!(channel.download_quality, "1080");
        assert_eq!(channel.download_format, "mkv");
        assert_eq!(channel.creator_processing.mode, "parts");
        assert_eq!(channel.creator_processing.part_count, 5);
    }

    #[test]
    fn channel_download_history_tracks_original_and_edited_outputs() {
        let _guard = db_test_guard();
        ensure_test_channel_tables();
        let channel_id = follow_channel_db(
            "https://www.youtube.com/@history".to_string(),
            "History".to_string(),
            None,
            "youtube".to_string(),
            "best".to_string(),
            "mp4".to_string(),
            "h264".to_string(),
            "192".to_string(),
            "original".to_string(),
            "videos".to_string(),
            CreatorProcessingSettings::default(),
        )
        .expect("follow history channel");
        insert_channel_video(&channel_id, "video-history", "new", "2026-09-26T00:00:00Z");

        update_channel_video_status_by_video_id_db(
            channel_id.clone(),
            "video-history".to_string(),
            "downloaded".to_string(),
            Some("C:/Downloads/original.mp4".to_string()),
        )
        .expect("record original download");
        complete_channel_creator_processing_db(
            channel_id.clone(),
            "video-history".to_string(),
            vec![
                "C:/Downloads/Edited/part-1.mp4".to_string(),
                "C:/Downloads/Edited/part-2.mp4".to_string(),
            ],
        )
        .expect("record edited outputs");

        let channel = get_followed_channel_db(channel_id.clone()).expect("load channel stats");
        let videos = get_channel_videos_db(channel_id, Some("downloaded".to_string()), Some(10))
            .expect("load channel history");

        assert_eq!(channel.downloaded_video_count, 1);
        assert!(channel.last_downloaded_at.is_some());
        assert_eq!(
            videos[0].output_path.as_deref(),
            Some("C:/Downloads/Edited/part-1.mp4")
        );
        assert_eq!(videos[0].edited_output_paths.len(), 2);
    }
}
