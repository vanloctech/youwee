use super::get_db;
use crate::types::{ChannelVideo, FollowedChannel};
use chrono::Utc;
use rusqlite::{params, params_from_iter, types::Value};

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
) -> Result<String, String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let rows = conn.execute(
        "INSERT OR IGNORE INTO followed_channels (id, url, name, thumbnail, platform, download_quality, download_format, download_video_codec, download_audio_bitrate, download_preferred_fps, youtube_content_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![id, url, name, thumbnail, platform, download_quality, download_format, download_video_codec, download_audio_bitrate, download_preferred_fps, youtube_content_type, now],
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
                    youtube_content_type
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
                download_video_codec: row.get(18)?,
                download_audio_bitrate: row.get(19)?,
                download_preferred_fps: row.get(20)?,
                youtube_content_type: row.get(21)?,
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
                youtube_content_type
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
                download_video_codec: row.get(18)?,
                download_audio_bitrate: row.get(19)?,
                download_preferred_fps: row.get(20)?,
                youtube_content_type: row.get(21)?,
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
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "UPDATE followed_channels SET
            check_interval = ?1, auto_download = ?2, download_quality = ?3,
            download_format = ?4, download_video_codec = ?5, download_audio_bitrate = ?6,
            download_preferred_fps = ?7, filter_min_duration = ?8, filter_max_duration = ?9,
            filter_include_keywords = ?10, filter_exclude_keywords = ?11, filter_max_videos = ?12,
            download_threads = ?13, youtube_content_type = ?14
         WHERE id = ?15",
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
        "SELECT id, channel_id, video_id, title, url, thumbnail, duration, upload_date, status, created_at
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
            .map(|(id, _)| id)
            .collect::<Vec<_>>()
    };

    for id in candidate_ids {
        conn.execute(
            "UPDATE channel_videos SET status = 'downloaded' WHERE id = ?1",
            params![id],
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
                download_threads INTEGER NOT NULL DEFAULT 1,
                download_video_codec TEXT NOT NULL DEFAULT 'h264',
                download_audio_bitrate TEXT NOT NULL DEFAULT '192',
                download_preferred_fps TEXT NOT NULL DEFAULT 'original',
                youtube_content_type TEXT NOT NULL DEFAULT 'videos'
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
                created_at TEXT NOT NULL
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
}
