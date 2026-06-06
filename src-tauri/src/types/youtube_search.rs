use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeSearchVideo {
    pub id: String,
    pub url: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<String>,
    pub channel: Option<String>,
    #[serde(alias = "view_count_text")]
    pub view_count_text: Option<String>,
    #[serde(alias = "published_time_text")]
    pub published_time_text: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeSearchResponse {
    pub videos: Vec<YoutubeSearchVideo>,
    pub continuation: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeSearchFilters {
    pub upload_date: Option<YoutubeSearchUploadDateFilter>,
    pub duration: Option<YoutubeSearchDurationFilter>,
    pub sort: Option<YoutubeSearchSortFilter>,
    #[serde(default)]
    pub features: Vec<YoutubeSearchFeatureFilter>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum YoutubeSearchUploadDateFilter {
    Today,
    ThisWeek,
    ThisMonth,
    ThisYear,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum YoutubeSearchDurationFilter {
    Short,
    Medium,
    Long,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum YoutubeSearchSortFilter {
    Relevance,
    ViewCount,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum YoutubeSearchFeatureFilter {
    Live,
    FourK,
    Hd,
    Subtitles,
    CreativeCommons,
    ThreeSixty,
    Vr180,
    ThreeD,
    Hdr,
}
