use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub id: String,
    pub percent: f64,
    pub speed: String,
    pub eta: String,
    pub status: String,
    pub title: Option<String>,
    pub playlist_index: Option<u32>,
    pub playlist_count: Option<u32>,
    pub filesize: Option<u64>,
    pub resolution: Option<String>,
    pub format_ext: Option<String>,
    pub error_message: Option<String>,
    pub downloaded_size: Option<String>, // For live streams: "2.87 MiB"
    pub elapsed_time: Option<String>,    // For live streams: "00:00:07"
}
