use crate::services::search_youtube_videos_internal;
use crate::types::{YoutubeSearchFilters, YoutubeSearchResponse};

#[tauri::command]
pub async fn search_youtube_videos(
    query: String,
    limit: Option<u32>,
    filters: Option<YoutubeSearchFilters>,
    continuation: Option<String>,
    lang: Option<String>,
) -> Result<YoutubeSearchResponse, String> {
    search_youtube_videos_internal(query, limit, filters, continuation, lang).await
}
