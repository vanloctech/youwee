use serde::{Deserialize, Serialize};

/// History entry structure
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub filepath: String,
    pub filesize: Option<u64>,
    pub duration: Option<u64>,
    pub quality: Option<String>,
    pub format: Option<String>,
    pub source: Option<String>, // "youtube", "tiktok", etc.
    pub downloaded_at: String,
    pub file_exists: bool,
    pub summary: Option<String>,    // AI-generated summary
    pub time_range: Option<String>, // Time range cut (e.g. "00:10-01:00")
}
