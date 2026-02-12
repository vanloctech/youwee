use super::get_db;
use crate::types::{ChannelVideo, FollowedChannel};
use chrono::Utc;
use rusqlite::params;

/// Follow a channel
pub fn follow_channel_db(
    url: String,
    name: String,
    thumbnail: Option<String>,
    platform: String,
) -> Result<String, String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR IGNORE INTO followed_channels (id, url, name, thumbnail, platform, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, url, name, thumbnail, platform, now],
    )
    .map_err(|e| format!("Failed to follow channel: {}", e))?;

    Ok(id)
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
                    filter_exclude_keywords, filter_max_videos, download_threads
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
                filter_exclude_keywords, filter_max_videos, download_threads
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
    filter_min_duration: Option<i64>,
    filter_max_duration: Option<i64>,
    filter_include_keywords: Option<String>,
    filter_exclude_keywords: Option<String>,
    filter_max_videos: Option<i64>,
    download_threads: i64,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET
            check_interval = ?1, auto_download = ?2, download_quality = ?3,
            download_format = ?4, filter_min_duration = ?5, filter_max_duration = ?6,
            filter_include_keywords = ?7, filter_exclude_keywords = ?8, filter_max_videos = ?9,
            download_threads = ?10
         WHERE id = ?11",
        params![
            check_interval,
            auto_download as i64,
            download_quality,
            download_format,
            filter_min_duration,
            filter_max_duration,
            filter_include_keywords,
            filter_exclude_keywords,
            filter_max_videos,
            download_threads,
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
    let conn = get_db()?;
    let mut inserted = 0;

    for video in &videos {
        let result = conn.execute(
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
        );

        if let Ok(rows) = result {
            if rows > 0 {
                inserted += 1;
            }
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
        "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, status, created_at
         FROM channel_videos WHERE channel_id = ?1 AND status = ?2
         ORDER BY created_at DESC LIMIT ?3"
    } else {
        "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, status, created_at
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
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE channel_videos SET status = ?1 WHERE channel_id = ?2 AND video_id = ?3",
        params![status, channel_id, video_id],
    )
    .map_err(|e| format!("Failed to update video status: {}", e))?;
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
