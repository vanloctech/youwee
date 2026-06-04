use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTag {
    pub id: String,
    pub name: String,
    pub item_count: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCollection {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub item_count: Option<i64>,
}

/// History entry structure
#[derive(Clone, Serialize, Deserialize, Debug, Default)]
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
    pub tags: Vec<HistoryTag>,
    pub collections: Vec<HistoryCollection>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum HistorySort {
    #[default]
    Recent,
    Oldest,
    Title,
    Size,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HistoryMediaType {
    All,
    Video,
    Audio,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum HistoryFilterMatchMode {
    #[default]
    Any,
    All,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum HistorySearchScope {
    #[default]
    All,
    Metadata,
    Summary,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HistoryAdvancedFilters {
    pub search_scope: Option<HistorySearchScope>,
    pub media_type: Option<HistoryMediaType>,
    pub downloaded_at_from: Option<i64>,
    pub downloaded_at_to: Option<i64>,
    pub formats: Option<Vec<String>>,
    pub qualities: Option<Vec<String>>,
    pub tag_ids: Option<Vec<String>>,
    pub collection_ids: Option<Vec<String>>,
    pub match_mode: Option<HistoryFilterMatchMode>,
}
