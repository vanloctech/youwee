use crate::types::{
    BackendError, YoutubeSearchDurationFilter, YoutubeSearchFeatureFilter, YoutubeSearchFilters,
    YoutubeSearchResponse, YoutubeSearchSortFilter, YoutubeSearchUploadDateFilter,
    YoutubeSearchVideo,
};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::StatusCode;
use serde_json::{json, Value};
use std::collections::HashSet;

const YOUTUBE_SEARCH_API_URL: &str = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
const YOUTUBE_WEB_CLIENT_NAME: &str = "WEB";
const YOUTUBE_WEB_CLIENT_VERSION: &str = "2.20240101.00.00";
const DEFAULT_SEARCH_LIMIT: u32 = 20;
const MAX_SEARCH_LIMIT: u32 = 100;

fn clamp_search_limit(limit: Option<u32>) -> usize {
    limit
        .unwrap_or(DEFAULT_SEARCH_LIMIT)
        .clamp(1, MAX_SEARCH_LIMIT) as usize
}

fn write_varint(mut value: u32, output: &mut Vec<u8>) {
    while value >= 0x80 {
        output.push((value as u8) | 0x80);
        value >>= 7;
    }
    output.push(value as u8);
}

fn write_varint_field(output: &mut Vec<u8>, field_number: u32, value: u32) {
    write_varint(field_number << 3, output);
    write_varint(value, output);
}

fn write_length_delimited_field(output: &mut Vec<u8>, field_number: u32, value: &[u8]) {
    write_varint((field_number << 3) | 2, output);
    write_varint(value.len() as u32, output);
    output.extend_from_slice(value);
}

fn upload_date_filter_value(filter: &YoutubeSearchUploadDateFilter) -> u32 {
    match filter {
        YoutubeSearchUploadDateFilter::Today => 2,
        YoutubeSearchUploadDateFilter::ThisWeek => 3,
        YoutubeSearchUploadDateFilter::ThisMonth => 4,
        YoutubeSearchUploadDateFilter::ThisYear => 5,
    }
}

fn duration_filter_value(filter: &YoutubeSearchDurationFilter) -> u32 {
    match filter {
        YoutubeSearchDurationFilter::Short => 1,
        YoutubeSearchDurationFilter::Long => 2,
        YoutubeSearchDurationFilter::Medium => 3,
    }
}

fn sort_filter_value(filter: &YoutubeSearchSortFilter) -> Option<u32> {
    match filter {
        YoutubeSearchSortFilter::Relevance => None,
        YoutubeSearchSortFilter::ViewCount => Some(3),
    }
}

fn feature_filter_field_number(filter: &YoutubeSearchFeatureFilter) -> u32 {
    match filter {
        YoutubeSearchFeatureFilter::Hd => 4,
        YoutubeSearchFeatureFilter::Subtitles => 5,
        YoutubeSearchFeatureFilter::CreativeCommons => 6,
        YoutubeSearchFeatureFilter::ThreeD => 7,
        YoutubeSearchFeatureFilter::Live => 8,
        YoutubeSearchFeatureFilter::FourK => 14,
        YoutubeSearchFeatureFilter::ThreeSixty => 15,
        YoutubeSearchFeatureFilter::Hdr => 25,
        YoutubeSearchFeatureFilter::Vr180 => 26,
    }
}

fn build_search_params(filters: Option<&YoutubeSearchFilters>) -> String {
    let filters = filters.cloned().unwrap_or_default();
    let mut bytes = Vec::new();

    if let Some(sort) = filters.sort.as_ref().and_then(sort_filter_value) {
        write_varint_field(&mut bytes, 1, sort);
    }

    let mut filter_bytes = Vec::new();
    if let Some(upload_date) = filters.upload_date.as_ref() {
        write_varint_field(&mut filter_bytes, 1, upload_date_filter_value(upload_date));
    }

    write_varint_field(&mut filter_bytes, 2, 1);

    if let Some(duration) = filters.duration.as_ref() {
        write_varint_field(&mut filter_bytes, 3, duration_filter_value(duration));
    }

    let mut seen_features = HashSet::new();
    for feature in filters.features {
        if seen_features.insert(feature.clone()) {
            write_varint_field(&mut filter_bytes, feature_filter_field_number(&feature), 1);
        }
    }

    write_length_delimited_field(&mut bytes, 2, &filter_bytes);

    STANDARD.encode(bytes)
}

fn run_text(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.get("simpleText").and_then(|v| v.as_str()) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let text = value
        .get("runs")
        .and_then(|runs| runs.as_array())
        .map(|runs| {
            runs.iter()
                .filter_map(|run| run.get("text").and_then(|v| v.as_str()))
                .collect::<String>()
        })
        .unwrap_or_default();
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_thumbnail_url(url: &str) -> String {
    if url.starts_with("//") {
        format!("https:{url}")
    } else {
        url.replace("http://", "https://")
    }
}

fn thumbnail_matches_video(url: &str, video_id: &str) -> bool {
    url.contains(&format!("/vi/{video_id}/")) || url.contains(&format!("/vi_webp/{video_id}/"))
}

fn fallback_thumbnail(video_id: &str) -> String {
    format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
}

fn best_thumbnail(renderer: &Value, video_id: &str) -> String {
    let matching_thumbnail = renderer
        .get("thumbnail")
        .and_then(|thumbnail| thumbnail.get("thumbnails"))
        .and_then(|thumbnails| thumbnails.as_array())
        .and_then(|thumbnails| {
            thumbnails.iter().rev().find_map(|thumbnail| {
                thumbnail
                    .get("url")
                    .and_then(|url| url.as_str())
                    .map(normalize_thumbnail_url)
                    .filter(|url| thumbnail_matches_video(url, video_id))
            })
        });

    matching_thumbnail.unwrap_or_else(|| fallback_thumbnail(video_id))
}

fn parse_video_renderer(renderer: &Value) -> Option<YoutubeSearchVideo> {
    let id = renderer.get("videoId")?.as_str()?.trim();
    if id.is_empty() {
        return None;
    }

    let title = run_text(renderer.get("title"))?;
    if title.is_empty() {
        return None;
    }

    Some(YoutubeSearchVideo {
        id: id.to_string(),
        url: format!("https://www.youtube.com/watch?v={id}"),
        title,
        thumbnail: Some(best_thumbnail(renderer, id)),
        duration: run_text(renderer.get("lengthText")),
        channel: run_text(renderer.get("ownerText"))
            .or_else(|| run_text(renderer.get("longBylineText")))
            .or_else(|| run_text(renderer.get("shortBylineText"))),
        view_count_text: run_text(renderer.get("viewCountText"))
            .or_else(|| run_text(renderer.get("shortViewCountText"))),
        published_time_text: run_text(renderer.get("publishedTimeText")),
    })
}

fn collect_search_parts(
    value: &Value,
    videos: &mut Vec<YoutubeSearchVideo>,
    continuation: &mut Option<String>,
) {
    match value {
        Value::Object(map) => {
            if let Some(renderer) = map.get("videoRenderer") {
                if let Some(video) = parse_video_renderer(renderer) {
                    videos.push(video);
                }
            }

            if continuation.is_none() {
                if let Some(token) = map
                    .get("continuationItemRenderer")
                    .and_then(|renderer| renderer.get("continuationEndpoint"))
                    .and_then(|endpoint| endpoint.get("continuationCommand"))
                    .and_then(|command| command.get("token"))
                    .and_then(|token| token.as_str())
                    .filter(|token| !token.trim().is_empty())
                {
                    *continuation = Some(token.to_string());
                }
            }

            for child in map.values() {
                collect_search_parts(child, videos, continuation);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_search_parts(item, videos, continuation);
            }
        }
        _ => {}
    }
}

fn parse_youtube_search_response(json: &Value) -> YoutubeSearchResponse {
    let mut videos = Vec::new();
    let mut continuation = None;
    collect_search_parts(json, &mut videos, &mut continuation);
    let mut seen_ids = HashSet::new();
    videos.retain(|video| seen_ids.insert(video.id.clone()));
    YoutubeSearchResponse {
        videos,
        continuation,
    }
}

async fn fetch_search_page(
    client: &reqwest::Client,
    query: &str,
    filters: Option<&YoutubeSearchFilters>,
    continuation: Option<&str>,
) -> Result<YoutubeSearchResponse, String> {
    let mut body = json!({
        "context": {
            "client": {
                "clientName": YOUTUBE_WEB_CLIENT_NAME,
                "clientVersion": YOUTUBE_WEB_CLIENT_VERSION,
                "hl": "vi",
                "gl": "VN"
            }
        }
    });

    if let Some(token) = continuation {
        body["continuation"] = Value::String(token.to_string());
    } else {
        body["query"] = Value::String(query.to_string());
        body["params"] = Value::String(build_search_params(filters));
    }

    let response = client
        .post(YOUTUBE_SEARCH_API_URL)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let message = if e.is_timeout() {
                "YouTube search request timed out.".to_string()
            } else if e.is_connect() {
                "Unable to connect to YouTube search.".to_string()
            } else {
                format!("Failed to search YouTube: {e}")
            };
            BackendError::from_message(message).to_wire_string()
        })?;

    let status = response.status();
    if status != StatusCode::OK {
        return Err(
            BackendError::from_message(format!("YouTube search returned HTTP {status}"))
                .to_wire_string(),
        );
    }

    let json = response.json::<Value>().await.map_err(|e| {
        BackendError::from_message(format!("Failed to parse YouTube search response: {e}"))
            .to_wire_string()
    })?;

    Ok(parse_youtube_search_response(&json))
}

pub async fn search_youtube_videos_internal(
    query: String,
    limit: Option<u32>,
    filters: Option<YoutubeSearchFilters>,
    continuation: Option<String>,
) -> Result<YoutubeSearchResponse, String> {
    let query = query.trim().to_string();
    let initial_continuation = continuation
        .as_deref()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_string);

    if query.is_empty() && initial_continuation.is_none() {
        return Err(BackendError::from_message("Search query is required.").to_wire_string());
    }

    let limit = clamp_search_limit(limit);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| {
            BackendError::from_message(format!("Failed to create YouTube search client: {e}"))
                .to_wire_string()
        })?;

    let mut videos = Vec::new();
    let mut next_continuation = initial_continuation;

    loop {
        let page = fetch_search_page(
            &client,
            &query,
            filters.as_ref(),
            next_continuation.as_deref(),
        )
        .await?;
        for video in page.videos {
            if !videos
                .iter()
                .any(|existing: &YoutubeSearchVideo| existing.id == video.id)
            {
                videos.push(video);
            }
            if videos.len() >= limit {
                break;
            }
        }

        next_continuation = page.continuation;
        if videos.len() >= limit || next_continuation.is_none() {
            break;
        }
    }

    videos.truncate(limit);
    Ok(YoutubeSearchResponse {
        videos,
        continuation: next_continuation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_default_video_filter_params() {
        assert_eq!(build_search_params(None), "EgIQAQ==");
    }

    #[test]
    fn builds_combined_filter_params() {
        let params = build_search_params(Some(&YoutubeSearchFilters {
            upload_date: Some(YoutubeSearchUploadDateFilter::ThisWeek),
            duration: Some(YoutubeSearchDurationFilter::Long),
            sort: Some(YoutubeSearchSortFilter::ViewCount),
            features: vec![
                YoutubeSearchFeatureFilter::Hd,
                YoutubeSearchFeatureFilter::FourK,
                YoutubeSearchFeatureFilter::Hdr,
                YoutubeSearchFeatureFilter::Hd,
            ],
        }));

        assert_eq!(params, "CAMSDQgDEAEYAiABcAHIAQE=");
    }

    #[test]
    fn parses_video_renderer_and_continuation() {
        let json = json!({
            "contents": {
                "itemSectionRenderer": {
                    "contents": [
                        {
                            "videoRenderer": {
                                "videoId": "abc123",
                                "title": {"runs": [{"text": "Test "}, {"text": "Video"}]},
                                "thumbnail": {
                                    "thumbnails": [
                                        {"url": "http://i.ytimg.com/vi/abc123/mqdefault.jpg", "width": 320},
                                        {"url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg", "width": 480}
                                    ]
                                },
                                "lengthText": {"simpleText": "3:21"},
                                "ownerText": {"runs": [{"text": "Channel"}]},
                                "viewCountText": {"simpleText": "1,234 views"},
                                "publishedTimeText": {"simpleText": "1 day ago"}
                            }
                        },
                        {
                            "continuationItemRenderer": {
                                "continuationEndpoint": {
                                    "continuationCommand": {"token": "next-token"}
                                }
                            }
                        }
                    ]
                }
            }
        });

        let response = parse_youtube_search_response(&json);

        assert_eq!(response.continuation.as_deref(), Some("next-token"));
        assert_eq!(response.videos.len(), 1);
        assert_eq!(response.videos[0].id, "abc123");
        assert_eq!(response.videos[0].title, "Test Video");
        assert_eq!(
            response.videos[0].url,
            "https://www.youtube.com/watch?v=abc123"
        );
        assert_eq!(
            response.videos[0].thumbnail.as_deref(),
            Some("https://i.ytimg.com/vi/abc123/hqdefault.jpg")
        );
        assert_eq!(response.videos[0].duration.as_deref(), Some("3:21"));
        assert_eq!(response.videos[0].channel.as_deref(), Some("Channel"));
    }

    #[test]
    fn serializes_response_with_sdk_camel_case_fields() {
        let response = YoutubeSearchResponse {
            videos: vec![YoutubeSearchVideo {
                id: "abc123".to_string(),
                url: "https://www.youtube.com/watch?v=abc123".to_string(),
                title: "Test Video".to_string(),
                thumbnail: Some("https://i.ytimg.com/vi/abc123/hqdefault.jpg".to_string()),
                duration: Some("3:21".to_string()),
                channel: Some("Channel".to_string()),
                view_count_text: Some("1,234 views".to_string()),
                published_time_text: Some("1 day ago".to_string()),
            }],
            continuation: Some("next-token".to_string()),
        };

        let json = serde_json::to_value(response).expect("serialize response");

        assert_eq!(json["videos"][0]["viewCountText"], "1,234 views");
        assert_eq!(json["videos"][0]["publishedTimeText"], "1 day ago");
        assert!(json["videos"][0].get("view_count_text").is_none());
        assert!(json["videos"][0].get("published_time_text").is_none());
    }

    #[test]
    fn falls_back_when_thumbnail_does_not_match_video_id() {
        let json = json!({
            "items": [
                {
                    "videoRenderer": {
                        "videoId": "abc123",
                        "title": {"simpleText": "Correct video"},
                        "thumbnail": {
                            "thumbnails": [
                                {"url": "https://i.ytimg.com/vi/other-id/hqdefault.jpg"}
                            ]
                        }
                    }
                }
            ]
        });

        let response = parse_youtube_search_response(&json);

        assert_eq!(response.videos.len(), 1);
        assert_eq!(
            response.videos[0].thumbnail.as_deref(),
            Some("https://i.ytimg.com/vi/abc123/hqdefault.jpg")
        );
    }

    #[test]
    fn skips_renderers_without_video_id_or_title() {
        let json = json!({
            "items": [
                {"videoRenderer": {"title": {"simpleText": "Missing id"}}},
                {"videoRenderer": {"videoId": "missing-title"}}
            ]
        });

        let response = parse_youtube_search_response(&json);

        assert!(response.videos.is_empty());
        assert!(response.continuation.is_none());
    }

    #[test]
    fn handles_response_without_videos() {
        let json = json!({"contents": []});

        let response = parse_youtube_search_response(&json);

        assert!(response.videos.is_empty());
        assert!(response.continuation.is_none());
    }
}
