use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct CreatorProcessingSettings {
    pub mode: String,
    pub right_folder: String,
    pub output_folder: String,
    pub split_by: String,
    pub part_seconds: i64,
    pub part_count: i64,
    pub encoder: String,
    pub delete_input_after_success: bool,
}

impl Default for CreatorProcessingSettings {
    fn default() -> Self {
        Self {
            mode: "none".to_string(),
            right_folder: String::new(),
            output_folder: String::new(),
            split_by: "duration".to_string(),
            part_seconds: 60,
            part_count: 3,
            encoder: "libx264".to_string(),
            delete_input_after_success: true,
        }
    }
}

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
    pub last_downloaded_at: Option<String>,
    pub downloaded_video_count: i64,
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
    pub download_video_codec: String,            // video codec (h264, vp9, av1, auto)
    pub download_audio_bitrate: String,          // audio bitrate (128, 192, 256, 320, auto)
    pub download_preferred_fps: String,          // original, 30
    pub youtube_content_type: String,            // videos, shorts, streams, videos_shorts
    pub creator_processing: CreatorProcessingSettings,
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
    pub downloaded_at: Option<String>,
    pub output_path: Option<String>,
    pub edited_output_paths: Vec<String>,
}
