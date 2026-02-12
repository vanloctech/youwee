use serde::{Deserialize, Serialize};

/// Channel metadata (name + avatar) extracted from yt-dlp -J
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ChannelInfo {
    pub name: String,
    pub avatar_url: Option<String>,
}

/// A followed YouTube channel
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FollowedChannel {
    pub id: String,
    pub url: String,
    pub name: String,
    pub thumbnail: Option<String>,
    pub platform: String,
    pub last_checked_at: Option<String>,
    pub last_video_id: Option<String>,
    pub check_interval: i64, // minutes
    pub auto_download: bool,
    pub download_quality: String,
    pub download_format: String,
    pub created_at: String,
    // Auto-download filter settings
    pub filter_min_duration: Option<i64>,        // seconds
    pub filter_max_duration: Option<i64>,        // seconds
    pub filter_include_keywords: Option<String>, // comma-separated
    pub filter_exclude_keywords: Option<String>, // comma-separated
    pub filter_max_videos: Option<i64>,          // max videos per check
    pub download_threads: i64,                   // concurrent download threads (default 1)
}

/// A video belonging to a followed channel
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ChannelVideo {
    pub id: String,
    pub channel_id: String,
    pub video_id: String,
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub upload_date: Option<String>,
    pub status: String, // "new", "downloaded", "skipped", "downloading"
    pub created_at: String,
}
