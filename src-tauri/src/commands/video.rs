use crate::database::add_log_internal;
use crate::services::{
    build_cookie_args, build_proxy_args, build_site_header_args, get_deno_path, parse_ytdlp_error,
    run_ytdlp_json_with_cookies, run_ytdlp_with_stderr, run_ytdlp_with_stderr_and_cookies,
};
use crate::types::{
    BackendError, FormatOption, PlaylistVideoEntry, SubtitleInfo, VideoInfo, VideoInfoResponse,
};
use crate::utils::{normalize_url, validate_url};
use std::time::Duration;
use tauri::AppHandle;
use tokio::time::timeout;
use uuid::Uuid;

fn default_transcript_languages(url: &str) -> Vec<String> {
    let lowered = url.to_lowercase();
    if lowered.contains("douyin.com")
        || lowered.contains("iesdouyin.com")
        || lowered.contains("bilibili.com")
        || lowered.contains("b23.tv")
    {
        return vec![
            "zh-Hans".to_string(),
            "zh-CN".to_string(),
            "zh".to_string(),
            "en".to_string(),
        ];
    }
    if lowered.contains("tiktok.com") {
        return vec!["en".to_string()];
    }
    vec!["en".to_string()]
}

fn parse_basic_video_info_output(
    output: &str,
) -> Result<(String, Option<String>, Option<f64>), String> {
    let line = output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .ok_or_else(|| "Failed to fetch video information".to_string())?;

    let mut parts = line.splitn(3, "|||");
    let title = parts.next().unwrap_or("").trim();
    let thumbnail = parts.next().unwrap_or("").trim();
    let duration = parts.next().unwrap_or("").trim();

    if title.is_empty() || title == "NA" {
        return Err("Failed to fetch video title".to_string());
    }

    let thumbnail = if thumbnail.is_empty() || thumbnail == "NA" {
        None
    } else {
        Some(thumbnail.to_string())
    };

    let duration = if duration.is_empty() || duration == "NA" {
        None
    } else {
        duration.parse::<f64>().ok()
    };

    Ok((title.to_string(), thumbnail, duration))
}

fn json_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(|v| v.as_str()))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn playlist_title_from_json(value: &serde_json::Value) -> Option<String> {
    json_string(value, &["playlist_title", "playlist", "title"])
}

fn playlist_title_from_entry_json(value: &serde_json::Value) -> Option<String> {
    json_string(value, &["playlist_title", "playlist"])
}

fn playlist_entry_from_json(
    json: &serde_json::Value,
    fallback_playlist_title: Option<&str>,
) -> Option<PlaylistVideoEntry> {
    if json.get("_type").and_then(|v| v.as_str()) == Some("playlist") {
        return None;
    }

    let id = json_string(json, &["id"])?;
    let title = json_string(json, &["title"]).unwrap_or_else(|| "Unknown".to_string());
    let video_url = json_string(json, &["url", "webpage_url"])
        .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", id));

    let thumbnail = json
        .get("thumbnail")
        .or_else(|| {
            json.get("thumbnails")
                .and_then(|t| t.as_array())
                .and_then(|arr| arr.first())
        })
        .and_then(|v| {
            if v.is_string() {
                v.as_str().map(|s| s.to_string())
            } else {
                v.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
            }
        });

    let duration = json.get("duration").and_then(|v| v.as_f64());
    let channel = json_string(json, &["channel", "uploader"]);
    let upload_date = json_string(json, &["upload_date"]);
    let playlist_title = playlist_title_from_entry_json(json)
        .or_else(|| fallback_playlist_title.map(ToString::to_string));

    Some(PlaylistVideoEntry {
        id,
        title,
        url: video_url,
        thumbnail,
        duration,
        channel,
        upload_date,
        playlist_title,
    })
}

fn parse_playlist_entries_output(
    output: &str,
    fallback_playlist_title: Option<&str>,
) -> Vec<PlaylistVideoEntry> {
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(entries) = json.get("entries").and_then(|value| value.as_array()) {
            let playlist_title = playlist_title_from_json(&json).or(fallback_playlist_title
                .filter(|title| !title.trim().is_empty())
                .map(ToString::to_string));

            return entries
                .iter()
                .filter_map(|entry| playlist_entry_from_json(entry, playlist_title.as_deref()))
                .collect();
        }
    }

    let mut entries = Vec::new();
    let mut playlist_title = fallback_playlist_title
        .filter(|title| !title.trim().is_empty())
        .map(ToString::to_string);

    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            if json.get("_type").and_then(|v| v.as_str()) == Some("playlist") {
                if playlist_title.is_none() {
                    playlist_title = playlist_title_from_json(&json);
                }
                continue;
            }

            if let Some(entry) = playlist_entry_from_json(&json, playlist_title.as_deref()) {
                entries.push(entry);
            }
        }
    }

    entries
}

/// Get video transcript/subtitles for AI summarization
#[tauri::command]
pub async fn get_video_transcript(
    app: AppHandle,
    url: String,
    languages: Option<Vec<String>>,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<String, String> {
    // Log the URL being processed
    #[cfg(debug_assertions)]
    println!("[TRANSCRIPT] Fetching transcript for URL: {}", &url);

    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    add_log_internal(
        "info",
        &format!("Fetching transcript for AI summary"),
        None,
        Some(&url),
    )
    .ok();

    // Create unique temp directory for this request (using UUID to prevent any contamination)
    let request_id = Uuid::new_v4();
    let temp_dir = std::env::temp_dir().join(format!("youwee_subs_{}", request_id));

    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        let error_msg = format!("Failed to create temp directory: {}", e);
        add_log_internal("error", &error_msg, None, Some(&url)).ok();
        return Err(BackendError::from_message(error_msg).to_wire_string());
    }

    let temp_path = temp_dir.join("transcript");
    let temp_path_str = temp_path.to_string_lossy().to_string();

    // Clone URL for use in args (ensure we're using the correct URL)
    let url_for_subs = url.clone();
    let url_for_info = url.clone();

    // Use provided languages or default
    let lang_list: Vec<String> = languages.unwrap_or_else(|| default_transcript_languages(&url));

    #[cfg(debug_assertions)]
    println!("[TRANSCRIPT] Languages to try: {:?}", lang_list);

    add_log_internal(
        "info",
        &format!("Trying languages: {}", lang_list.join(", ")),
        None,
        Some(&url),
    )
    .ok();

    // Get Deno runtime args for YouTube
    let deno_args: Vec<String> = if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            vec![
                "--js-runtimes".to_string(),
                format!("deno:{}", deno_path.to_string_lossy()),
            ]
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    // Track if we hit a rate limit error
    let mut rate_limited = false;
    let mut specific_error: Option<BackendError> = None;
    let mut subtitle_files: Vec<std::path::PathBuf> = Vec::new();

    for (idx, lang) in lang_list.iter().enumerate() {
        #[cfg(debug_assertions)]
        println!(
            "[TRANSCRIPT] Trying language: {} ({}/{})",
            lang,
            idx + 1,
            lang_list.len()
        );

        let mut subtitle_args: Vec<String> = vec![
            "--skip-download".to_string(),
            "--no-playlist".to_string(),
            "--ignore-no-formats-error".to_string(),
            "--write-auto-subs".to_string(),
            "--write-subs".to_string(),
            "--sub-langs".to_string(),
            lang.clone(),
            "--convert-subs".to_string(),
            "vtt".to_string(),
            "-o".to_string(),
            temp_path_str.clone(),
            "--no-warnings".to_string(),
            "--no-check-certificates".to_string(),
            "--no-cache-dir".to_string(),
            "--socket-timeout".to_string(),
            "30".to_string(),
        ];
        subtitle_args.extend(deno_args.clone());
        subtitle_args.push("--".to_string());
        subtitle_args.push(url_for_subs.clone());

        let subtitle_args_ref: Vec<&str> = subtitle_args.iter().map(|s| s.as_str()).collect();

        if idx == 0 {
            let subtitle_cmd = format!("yt-dlp {}", subtitle_args.join(" "));
            add_log_internal("command", &subtitle_cmd, None, Some(&url)).ok();
        }

        let subtitle_result = timeout(
            Duration::from_secs(45),
            run_ytdlp_with_stderr_and_cookies(
                &app,
                &subtitle_args_ref,
                cookie_mode.as_deref(),
                cookie_browser.as_deref(),
                cookie_browser_profile.as_deref(),
                cookie_file_path.as_deref(),
                cookie_skip_patterns.as_deref(),
                proxy_url.as_deref(),
            ),
        )
        .await;

        match &subtitle_result {
            Ok(Ok(output)) => {
                // Check stderr for errors
                if !output.stderr.is_empty() {
                    #[cfg(debug_assertions)]
                    println!(
                        "[TRANSCRIPT] yt-dlp stderr for {}: {}",
                        lang,
                        output.stderr.trim()
                    );

                    if output.stderr.to_lowercase().contains("429") {
                        rate_limited = true;
                        add_log_internal(
                            "stderr",
                            &format!("Rate limited on language: {}", lang),
                            None,
                            Some(&url),
                        )
                        .ok();
                        // Wait a bit before trying next language
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }

                    // Parse for known errors
                    if let Some(error_msg) = parse_ytdlp_error(&output.stderr) {
                        if specific_error.is_none() {
                            specific_error = Some(error_msg.clone());
                        }
                    }
                }

                // Check if any subtitle files were downloaded
                if let Ok(entries) = std::fs::read_dir(&temp_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if let Some(ext) = path.extension() {
                            if ext == "vtt" || ext == "srt" {
                                if !subtitle_files.contains(&path) {
                                    subtitle_files.push(path);
                                }
                            }
                        }
                    }
                }

                // If we got subtitles, stop trying more languages
                if !subtitle_files.is_empty() {
                    #[cfg(debug_assertions)]
                    println!(
                        "[TRANSCRIPT] Found {} subtitle files for language: {}",
                        subtitle_files.len(),
                        lang
                    );
                    add_log_internal(
                        "info",
                        &format!("Found subtitles for language: {}", lang),
                        None,
                        Some(&url),
                    )
                    .ok();
                    break;
                }
            }
            Ok(Err(e)) => {
                #[cfg(debug_assertions)]
                println!("[TRANSCRIPT] Subtitle fetch failed for {}: {}", lang, e);
                let _ = e; // Suppress unused variable warning in release build
            }
            Err(_) => {
                #[cfg(debug_assertions)]
                println!("[TRANSCRIPT] Subtitle fetch timed out for {}", lang);
            }
        }

        // Small delay between language attempts to be nice to YouTube
        if idx < lang_list.len() - 1 {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    #[cfg(debug_assertions)]
    println!(
        "[TRANSCRIPT] Total subtitle files found: {}",
        subtitle_files.len()
    );

    // Sort files: prefer English and shorter names (manual subs)
    subtitle_files.sort_by(|a, b| {
        let a_name = a.file_name().unwrap_or_default().to_string_lossy();
        let b_name = b.file_name().unwrap_or_default().to_string_lossy();

        let a_is_en = a_name.contains(".en.") || a_name.contains(".en-");
        let b_is_en = b_name.contains(".en.") || b_name.contains(".en-");

        if a_is_en && !b_is_en {
            return std::cmp::Ordering::Less;
        }
        if !a_is_en && b_is_en {
            return std::cmp::Ordering::Greater;
        }

        a_name.len().cmp(&b_name.len())
    });

    // Try to parse each subtitle file
    for path in &subtitle_files {
        if let Ok(content) = std::fs::read_to_string(path) {
            let transcript = parse_subtitle_file(&content);
            if !transcript.trim().is_empty() && transcript.split_whitespace().count() > 10 {
                let word_count = transcript.split_whitespace().count();
                #[cfg(debug_assertions)]
                println!(
                    "[TRANSCRIPT] Successfully parsed subtitles ({} words)",
                    word_count
                );

                add_log_internal(
                    "success",
                    &format!("Parsed subtitles ({} words)", word_count),
                    None,
                    Some(&url),
                )
                .ok();

                // Clean up
                std::fs::remove_dir_all(&temp_dir).ok();
                return Ok(transcript);
            }
        }
    }

    // Clean up subtitle files
    std::fs::remove_dir_all(&temp_dir).ok();

    #[cfg(debug_assertions)]
    println!(
        "[TRANSCRIPT] No subtitles found, trying description fallback for URL: {}",
        &url_for_info
    );

    add_log_internal(
        "info",
        "No subtitles available, trying description fallback",
        None,
        Some(&url),
    )
    .ok();

    // Small delay before next request to avoid rate limiting
    tokio::time::sleep(Duration::from_secs(2)).await;

    // No subtitles found - try to get title and description as fallback
    let info_args = vec![
        "--skip-download",
        "--no-playlist", // Important: only get single video, not playlist
        "--ignore-no-formats-error",
        "--print",
        "%(title)s|||%(description)s",
        "--no-warnings",
        "--no-cache-dir",
        "--socket-timeout",
        "30",
        "--",
        &url_for_info,
    ];

    let info_cmd = format!("yt-dlp {}", info_args.join(" "));
    add_log_internal("command", &info_cmd, None, Some(&url)).ok();

    let info_result = timeout(
        Duration::from_secs(45), // Increased from 15
        run_ytdlp_json_with_cookies(
            &app,
            &info_args.iter().map(|s| *s).collect::<Vec<_>>(),
            cookie_mode.as_deref(),
            cookie_browser.as_deref(),
            cookie_browser_profile.as_deref(),
            cookie_file_path.as_deref(),
            cookie_skip_patterns.as_deref(),
            proxy_url.as_deref(),
        ),
    )
    .await;

    match &info_result {
        Ok(Ok(info_str)) => {
            let parts: Vec<&str> = info_str.splitn(2, "|||").collect();
            let title = parts.first().map(|s| s.trim()).unwrap_or("");
            let description = parts.get(1).map(|s| s.trim()).unwrap_or("");

            #[cfg(debug_assertions)]
            println!(
                "[TRANSCRIPT] Got title: '{}', description length: {}",
                title,
                description.len()
            );

            add_log_internal(
                "info",
                &format!(
                    "Got video info - title: '{}', description: {} chars",
                    title,
                    description.len()
                ),
                None,
                Some(&url),
            )
            .ok();

            if !description.is_empty() && description.len() > 50 {
                // Check if description seems to contain actual content (not just promo/links)
                if is_description_content_relevant(title, description) {
                    #[cfg(debug_assertions)]
                    println!("[TRANSCRIPT] Description is relevant, using as fallback");

                    add_log_internal(
                        "success",
                        "Using video description as fallback content",
                        None,
                        Some(&url),
                    )
                    .ok();

                    return Ok(format!(
                        "[Video Description - No subtitles available]\nTitle: {}\n\n{}",
                        title, description
                    ));
                } else {
                    #[cfg(debug_assertions)]
                    println!("[TRANSCRIPT] Description not relevant (promotional content)");

                    add_log_internal(
                        "info",
                        "Description not relevant (promotional content only)",
                        None,
                        Some(&url),
                    )
                    .ok();
                }
            } else {
                add_log_internal(
                    "info",
                    "Description fallback returned too little content",
                    None,
                    Some(&url),
                )
                .ok();
            }
        }
        Ok(Err(e)) => {
            #[cfg(debug_assertions)]
            println!("[TRANSCRIPT] Description fetch failed: {}", e);
            add_log_internal(
                "stderr",
                &format!("Description fetch failed: {}", e),
                None,
                Some(&url),
            )
            .ok();
        }
        Err(_) => {
            #[cfg(debug_assertions)]
            println!("[TRANSCRIPT] Description fetch timed out");
            add_log_internal(
                "stderr",
                "Description fetch timed out (45s)",
                None,
                Some(&url),
            )
            .ok();
        }
    }

    // Fallback #2: metadata extraction from dump-json (useful for Douyin/TikTok when subtitles are unavailable)
    if !rate_limited {
        let metadata_args = vec![
            "--dump-json",
            "--no-download",
            "--no-playlist",
            "--no-warnings",
            "--no-cache-dir",
            "--socket-timeout",
            "30",
            "--",
            &url_for_info,
        ];
        let metadata_result = timeout(
            Duration::from_secs(45),
            run_ytdlp_json_with_cookies(
                &app,
                &metadata_args.iter().copied().collect::<Vec<_>>(),
                cookie_mode.as_deref(),
                cookie_browser.as_deref(),
                cookie_browser_profile.as_deref(),
                cookie_file_path.as_deref(),
                cookie_skip_patterns.as_deref(),
                proxy_url.as_deref(),
            ),
        )
        .await;
        match metadata_result {
            Ok(Ok(json_output)) => {
                if let Ok(info_json) = serde_json::from_str::<serde_json::Value>(&json_output) {
                    if let Some(text) = build_metadata_fallback_from_info_json(&info_json) {
                        add_log_internal(
                            "success",
                            "Using metadata fallback content",
                            None,
                            Some(&url),
                        )
                        .ok();
                        return Ok(text);
                    }
                }
            }
            Ok(Err(e)) => {
                add_log_internal(
                    "stderr",
                    &format!("Metadata fallback failed: {}", e),
                    None,
                    Some(&url),
                )
                .ok();
            }
            Err(_) => {
                add_log_internal(
                    "stderr",
                    "Metadata fallback timed out (45s)",
                    None,
                    Some(&url),
                )
                .ok();
            }
        }
    }

    // Return specific error message if we detected one
    let error_msg = if rate_limited {
        BackendError::from_message(
            "YouTube rate limited. Please wait a few minutes before trying again.",
        )
    } else if let Some(ref err) = specific_error {
        // Use the specific error we detected
        return Err(err.to_wire_string());
    } else {
        BackendError::from_message(
            "No transcript available. This video has no subtitles, auto-generated captions, or meaningful description to summarize."
        )
    };

    add_log_internal("error", error_msg.message(), None, Some(&url)).ok();

    Err(error_msg.to_wire_string())
}

/// Check if video description contains relevant content (lyrics, transcript, etc.)
/// Returns false if it's mostly promotional content, links, or author info
fn is_description_content_relevant(title: &str, description: &str) -> bool {
    let desc_lower = description.to_lowercase();
    let title_lower = title.to_lowercase();

    // Positive indicators - description likely contains actual content
    let content_indicators = [
        "lyrics",
        "lời bài hát",
        "가사",
        "歌詞", // lyrics indicators
        "transcript",
        "subtitles",
        "phụ đề",
        "verse",
        "chorus",
        "bridge",
        "outro",
        "intro", // song structure
        "chapter",
        "timestamp",
        "00:", // timestamps/chapters
    ];

    for indicator in content_indicators {
        if desc_lower.contains(indicator) {
            return true;
        }
    }

    // Check if description is mostly just links and social media
    let link_count = description.matches("http").count() + description.matches("www.").count();
    let line_count = description.lines().count().max(1);
    let link_ratio = link_count as f32 / line_count as f32;

    // If more than 50% of lines are links, it's probably just promo
    if link_ratio > 0.5 {
        return false;
    }

    // Negative indicators - description is mostly promotional
    let promo_indicators = [
        "subscribe",
        "đăng ký",
        "follow me",
        "theo dõi",
        "business inquiries",
        "liên hệ công việc",
        "copyright",
        "bản quyền",
        "patreon",
        "paypal",
        "donate",
        "merch",
        "merchandise",
        "social media",
        "mạng xã hội",
    ];

    let promo_count = promo_indicators
        .iter()
        .filter(|&ind| desc_lower.contains(ind))
        .count();

    // If too many promo indicators and short description, probably not useful
    if promo_count >= 3 && description.len() < 500 {
        return false;
    }

    // Check if description has substantial text content (at least 200 chars of non-link text)
    let text_without_links: String = description
        .lines()
        .filter(|line| !line.contains("http") && !line.contains("www."))
        .collect::<Vec<_>>()
        .join("\n");

    if text_without_links.len() < 200 {
        return false;
    }

    // Check word overlap with title (description should be related to video topic)
    let title_words: Vec<&str> = title_lower
        .split_whitespace()
        .filter(|w| w.len() > 3)
        .collect();

    if !title_words.is_empty() {
        let matching_words = title_words
            .iter()
            .filter(|&w| desc_lower.contains(w))
            .count();

        // At least some title words should appear in description
        if matching_words == 0 && title_words.len() >= 3 {
            return false;
        }
    }

    // Default to true if we have enough text content
    text_without_links.split_whitespace().count() > 50
}

fn build_metadata_fallback_from_info_json(json: &serde_json::Value) -> Option<String> {
    let title = json
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let description = json
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if !title.is_empty()
        && !description.is_empty()
        && description.len() > 50
        && is_description_content_relevant(title, description)
    {
        return Some(format!(
            "[Video Description - No subtitles available]\nTitle: {}\n\n{}",
            title, description
        ));
    }

    let uploader = json
        .get("uploader")
        .and_then(|v| v.as_str())
        .or_else(|| json.get("channel").and_then(|v| v.as_str()))
        .unwrap_or("")
        .trim();
    let upload_date = json
        .get("upload_date")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let duration = json.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let view_count = json.get("view_count").and_then(|v| v.as_u64()).unwrap_or(0);
    let like_count = json.get("like_count").and_then(|v| v.as_u64()).unwrap_or(0);
    let comment_count = json
        .get("comment_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let repost_count = json
        .get("repost_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let webpage_url = json
        .get("webpage_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    let mut lines: Vec<String> = Vec::new();
    if !title.is_empty() {
        lines.push(format!("Title: {}", title));
    }
    if !uploader.is_empty() {
        lines.push(format!("Uploader: {}", uploader));
    }
    if !upload_date.is_empty() {
        lines.push(format!("Upload date: {}", upload_date));
    }
    if duration > 0.0 {
        lines.push(format!("Duration: {:.0}s", duration));
    }
    if view_count > 0 {
        lines.push(format!("Views: {}", view_count));
    }
    if like_count > 0 {
        lines.push(format!("Likes: {}", like_count));
    }
    if comment_count > 0 {
        lines.push(format!("Comments: {}", comment_count));
    }
    if repost_count > 0 {
        lines.push(format!("Shares/Reposts: {}", repost_count));
    }
    if !webpage_url.is_empty() {
        lines.push(format!("Source URL: {}", webpage_url));
    }

    if lines.len() < 2 {
        return None;
    }

    Some(format!(
        "[Video Metadata - No subtitles available]\n{}",
        lines.join("\n")
    ))
}

/// Parse VTT or SRT subtitle file to plain text
fn parse_subtitle_file(content: &str) -> String {
    let mut texts: Vec<String> = Vec::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip empty lines
        if line.is_empty() {
            continue;
        }

        // Skip VTT header
        if line.starts_with("WEBVTT") || line.starts_with("NOTE") {
            continue;
        }

        // Skip timestamp lines (VTT: 00:00:00.000 --> 00:00:00.000, SRT: 00:00:00,000 --> 00:00:00,000)
        if line.contains("-->") {
            continue;
        }

        // Skip numeric cue identifiers (SRT format)
        if line.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        // Skip position/styling lines
        if line.starts_with("align:") || line.starts_with("position:") || line.contains("::") {
            continue;
        }

        // Remove HTML-like tags
        let clean_line = regex::Regex::new(r"<[^>]+>")
            .map(|re| re.replace_all(line, "").to_string())
            .unwrap_or_else(|_| line.to_string());

        let clean_line = clean_line.trim();

        if !clean_line.is_empty() && !texts.last().map(|l| l == clean_line).unwrap_or(false) {
            texts.push(clean_line.to_string());
        }
    }

    texts.join(" ")
}

#[tauri::command]
pub async fn get_video_basic_info(
    app: AppHandle,
    url: String,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<VideoInfoResponse, String> {
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    let mut args = vec![
        "--skip-download".to_string(),
        "--no-warnings".to_string(),
        "--no-simulate".to_string(),
        "--no-playlist".to_string(),
        "--ignore-no-formats-error".to_string(),
        "--socket-timeout".to_string(),
        "15".to_string(),
    ];

    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.push("--print".to_string());
    args.push("%(title)s|||%(thumbnail)s|||%(duration)s".to_string());
    args.push("--".to_string());
    args.push(url.clone());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let command_str = format!("yt-dlp {}", args.join(" "));
    add_log_internal("command", &command_str, None, Some(&url)).ok();

    let output = match timeout(
        Duration::from_secs(45),
        run_ytdlp_with_stderr_and_cookies(
            &app,
            &args_ref,
            cookie_mode.as_deref(),
            cookie_browser.as_deref(),
            cookie_browser_profile.as_deref(),
            cookie_file_path.as_deref(),
            cookie_skip_patterns.as_deref(),
            proxy_url.as_deref(),
        ),
    )
    .await
    {
        Ok(result) => result?,
        Err(_) => {
            let error = BackendError::from_message(
                "Timed out fetching video info. Please try again or check your cookie/proxy settings.",
            );
            add_log_internal("error", error.message(), None, Some(&url)).ok();
            return Err(error.to_wire_string());
        }
    };

    if !output.stderr.trim().is_empty() {
        add_log_internal("stderr", output.stderr.trim(), None, Some(&url)).ok();
    }

    if !output.success {
        let parsed_error = parse_ytdlp_error(&output.stderr).unwrap_or_else(|| {
            let stderr = output.stderr.trim();
            if stderr.is_empty() {
                BackendError::from_message("Failed to fetch video info.")
            } else {
                BackendError::from_message(format!("Failed to fetch video info: {}", stderr))
            }
        });
        add_log_internal("error", parsed_error.message(), None, Some(&url)).ok();
        return Err(parsed_error.to_wire_string());
    }

    let (title, thumbnail, duration) = parse_basic_video_info_output(&output.stdout)
        .map_err(|e| BackendError::from_message(e).to_wire_string())?;

    let info = VideoInfo {
        id: String::new(),
        title,
        thumbnail,
        duration,
        channel: None,
        uploader: None,
        upload_date: None,
        view_count: None,
        description: None,
        is_playlist: false,
        playlist_count: None,
        extractor: None,
        extractor_key: None,
        is_live: None,
        was_live: None,
        live_status: None,
    };

    add_log_internal(
        "info",
        &format!("Fetched basic video info - title: '{}'", info.title),
        None,
        Some(&url),
    )
    .ok();

    Ok(VideoInfoResponse {
        info,
        formats: Vec::new(),
    })
}

#[tauri::command]
pub async fn get_video_info(
    app: AppHandle,
    url: String,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<VideoInfoResponse, String> {
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    let mut args = vec![
        "--dump-json".to_string(),
        "--no-download".to_string(),
        "--no-playlist".to_string(),
        "--ignore-no-formats-error".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "15".to_string(),
    ];

    // Add Deno runtime for YouTube (required for JS extractor)
    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.push("--".to_string());
    args.push(url.clone());

    let mut extra_args = build_site_header_args(&url);
    extra_args.extend(build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    ));
    extra_args.extend(build_proxy_args(proxy_url.as_deref()));

    if let Some(separator_index) = args.iter().position(|arg| arg == "--") {
        args.splice(separator_index..separator_index, extra_args);
    }

    let command_str = format!("yt-dlp {}", args.join(" "));
    add_log_internal("command", &command_str, None, Some(&url)).ok();

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = match timeout(
        Duration::from_secs(45),
        run_ytdlp_with_stderr(&app, &args_ref),
    )
    .await
    {
        Ok(result) => result?,
        Err(_) => {
            let error = BackendError::from_message(
                "Timed out fetching video info. Please try again or check your cookie/proxy settings.",
            );
            add_log_internal("error", error.message(), None, Some(&url)).ok();
            return Err(error.to_wire_string());
        }
    };

    if !output.stderr.trim().is_empty() {
        add_log_internal("stderr", output.stderr.trim(), None, Some(&url)).ok();
    }

    if !output.success {
        let parsed_error = parse_ytdlp_error(&output.stderr).unwrap_or_else(|| {
            let stderr = output.stderr.trim();
            if stderr.is_empty() {
                BackendError::from_message("Failed to fetch video info.")
            } else {
                BackendError::from_message(format!("Failed to fetch video info: {}", stderr))
            }
        });
        add_log_internal("error", parsed_error.message(), None, Some(&url)).ok();
        return Err(parsed_error.to_wire_string());
    }

    let json_output = output.stdout;
    let json: serde_json::Value = serde_json::from_str(&json_output).map_err(|e| {
        let message = format!("Failed to parse video info JSON: {}", e);
        add_log_internal("error", &message, None, Some(&url)).ok();
        BackendError::from_message(message).to_wire_string()
    })?;

    let is_playlist = json.get("_type").and_then(|v| v.as_str()) == Some("playlist");
    let playlist_count = if is_playlist {
        json.get("playlist_count")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
    } else {
        None
    };

    let info = VideoInfo {
        id: json
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        title: json
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string(),
        thumbnail: json
            .get("thumbnail")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        duration: json.get("duration").and_then(|v| v.as_f64()),
        channel: json
            .get("channel")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        uploader: json
            .get("uploader")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        upload_date: json
            .get("upload_date")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        view_count: json.get("view_count").and_then(|v| v.as_u64()),
        description: json.get("description").and_then(|v| v.as_str()).map(|s| {
            if s.len() > 200 {
                format!("{}...", &s[..200])
            } else {
                s.to_string()
            }
        }),
        is_playlist,
        playlist_count,
        extractor: json
            .get("extractor")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        extractor_key: json
            .get("extractor_key")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        // Live stream fields
        is_live: json.get("is_live").and_then(|v| v.as_bool()),
        was_live: json.get("was_live").and_then(|v| v.as_bool()),
        live_status: json
            .get("live_status")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    };

    let formats = if let Some(formats_arr) = json.get("formats").and_then(|v| v.as_array()) {
        formats_arr
            .iter()
            .filter_map(|f| {
                let format_id = f.get("format_id").and_then(|v| v.as_str())?;
                let ext = f.get("ext").and_then(|v| v.as_str()).unwrap_or("unknown");

                Some(FormatOption {
                    format_id: format_id.to_string(),
                    ext: ext.to_string(),
                    resolution: f
                        .get("resolution")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    width: f.get("width").and_then(|v| v.as_u64()).map(|v| v as u32),
                    height: f.get("height").and_then(|v| v.as_u64()).map(|v| v as u32),
                    vcodec: f
                        .get("vcodec")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    acodec: f
                        .get("acodec")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    filesize: f.get("filesize").and_then(|v| v.as_u64()),
                    filesize_approx: f.get("filesize_approx").and_then(|v| v.as_u64()),
                    tbr: f.get("tbr").and_then(|v| v.as_f64()),
                    format_note: f
                        .get("format_note")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    fps: f.get("fps").and_then(|v| v.as_f64()),
                    quality: f.get("quality").and_then(|v| v.as_f64()),
                })
            })
            .collect()
    } else {
        Vec::new()
    };

    add_log_internal(
        "info",
        &format!("Fetched video info - title: '{}'", info.title),
        None,
        Some(&url),
    )
    .ok();

    Ok(VideoInfoResponse { info, formats })
}

#[tauri::command]
pub async fn get_playlist_entries(
    app: AppHandle,
    url: String,
    limit: Option<u32>,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    let mut args = vec![
        "--flat-playlist".to_string(),
        "--dump-single-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(),
        "30".to_string(),
    ];

    if let Some(l) = limit {
        if l > 0 {
            args.push("--playlist-end".to_string());
            args.push(l.to_string());
        }
    }

    // Add Deno runtime for YouTube (required for JS extractor)
    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.extend(build_site_header_args(&url));

    // Add cookie args
    let cookie_args = build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    );
    args.extend(cookie_args);

    // Add proxy args
    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    args.push("--".to_string());
    args.push(url.clone());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output_result = run_ytdlp_with_stderr(&app, &args_ref).await?;
    if !output_result.success && output_result.stdout.trim().is_empty() {
        return Err(BackendError::from_message("Failed to fetch playlist info").to_wire_string());
    }
    let output = output_result.stdout;

    let entries = parse_playlist_entries_output(&output, None);

    if entries.is_empty() {
        return Err(BackendError::from_message("No videos found in playlist").to_wire_string());
    }

    Ok(entries)
}

#[tauri::command]
pub async fn get_available_subtitles(
    app: AppHandle,
    url: String,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<Vec<SubtitleInfo>, String> {
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    let mut args = vec![
        "--list-subs".to_string(),
        "--skip-download".to_string(),
        "--no-warnings".to_string(),
    ];

    // Add Deno runtime for YouTube (required for JS extractor)
    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }

    args.push("--".to_string());
    args.push(url.clone());

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let output = run_ytdlp_json_with_cookies(
        &app,
        &args_ref,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
        proxy_url.as_deref(),
    )
    .await;

    let mut subtitles: Vec<SubtitleInfo> = Vec::new();

    let lang_names: std::collections::HashMap<&str, &str> = [
        ("en", "English"),
        ("vi", "Vietnamese"),
        ("ja", "Japanese"),
        ("ko", "Korean"),
        ("zh", "Chinese"),
        ("zh-Hans", "Chinese (Simplified)"),
        ("zh-Hant", "Chinese (Traditional)"),
        ("th", "Thai"),
        ("id", "Indonesian"),
        ("ms", "Malay"),
        ("fr", "French"),
        ("de", "German"),
        ("es", "Spanish"),
        ("pt", "Portuguese"),
        ("ru", "Russian"),
        ("ar", "Arabic"),
        ("hi", "Hindi"),
        ("it", "Italian"),
        ("nl", "Dutch"),
        ("pl", "Polish"),
        ("tr", "Turkish"),
        ("uk", "Ukrainian"),
    ]
    .iter()
    .cloned()
    .collect();

    if let Ok(text) = output {
        let mut is_auto_section = false;

        for line in text.lines() {
            let line = line.trim();

            if line.contains("automatic captions") || line.contains("auto-generated") {
                is_auto_section = true;
                continue;
            }

            if line.contains("subtitles") && !line.contains("auto") {
                is_auto_section = false;
                continue;
            }

            if line.is_empty()
                || line.starts_with("Language")
                || line.starts_with("[")
                || line.contains("Available")
            {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(lang_code) = parts.first() {
                let lang = lang_code.to_string();
                if subtitles
                    .iter()
                    .any(|s| s.lang == lang && s.is_auto == is_auto_section)
                {
                    continue;
                }

                let name = lang_names
                    .get(lang.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| lang.clone());

                subtitles.push(SubtitleInfo {
                    lang,
                    name,
                    is_auto: is_auto_section,
                });
            }
        }
    }

    if subtitles.is_empty() {
        subtitles = vec![
            SubtitleInfo {
                lang: "en".to_string(),
                name: "English".to_string(),
                is_auto: false,
            },
            SubtitleInfo {
                lang: "vi".to_string(),
                name: "Vietnamese".to_string(),
                is_auto: false,
            },
            SubtitleInfo {
                lang: "ja".to_string(),
                name: "Japanese".to_string(),
                is_auto: false,
            },
            SubtitleInfo {
                lang: "ko".to_string(),
                name: "Korean".to_string(),
                is_auto: false,
            },
            SubtitleInfo {
                lang: "zh".to_string(),
                name: "Chinese".to_string(),
                is_auto: false,
            },
        ];
    }

    Ok(subtitles)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic_video_info_output_reads_printed_fields() {
        let output = concat!(
            "Кто попадет в команду ChatGPT: учёный или программист? (Ответ тебя удивит)",
            "|||https://i.ytimg.com/vi/ePPilLkDn0s/maxresdefault.jpg|||3623\n"
        );

        let (title, thumbnail, duration) = parse_basic_video_info_output(output).unwrap();

        assert_eq!(
            title,
            "Кто попадет в команду ChatGPT: учёный или программист? (Ответ тебя удивит)"
        );
        assert_eq!(
            thumbnail.as_deref(),
            Some("https://i.ytimg.com/vi/ePPilLkDn0s/maxresdefault.jpg")
        );
        assert_eq!(duration, Some(3623.0));
    }

    #[test]
    fn parse_basic_video_info_output_ignores_missing_optional_fields() {
        let (title, thumbnail, duration) =
            parse_basic_video_info_output("Video title|||NA|||NA").unwrap();

        assert_eq!(title, "Video title");
        assert_eq!(thumbnail, None);
        assert_eq!(duration, None);
    }

    #[test]
    fn parse_playlist_entries_output_applies_parent_playlist_title() {
        let output = r#"{
            "_type": "playlist",
            "id": "PL123",
            "title": "My Playlist",
            "entries": [
                {
                    "id": "abc123",
                    "title": "First video",
                    "url": "https://www.youtube.com/watch?v=abc123",
                    "duration": 120
                },
                {
                    "id": "def456",
                    "title": "Second video",
                    "url": "https://www.youtube.com/watch?v=def456"
                }
            ]
        }"#;

        let entries = parse_playlist_entries_output(output, None);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].title, "First video");
        assert_eq!(entries[0].playlist_title.as_deref(), Some("My Playlist"));
        assert_eq!(entries[1].playlist_title.as_deref(), Some("My Playlist"));
    }

    #[test]
    fn parse_playlist_entries_output_keeps_line_json_entry_playlist_title() {
        let output = concat!(
            r#"{"id":"abc123","title":"First video","url":"https://youtu.be/abc123","playlist_title":"Line Playlist"}"#,
            "\n",
            r#"{"id":"def456","title":"Second video","url":"https://youtu.be/def456"}"#,
            "\n"
        );

        let entries = parse_playlist_entries_output(output, Some("Fallback Playlist"));

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].playlist_title.as_deref(), Some("Line Playlist"));
        assert_eq!(
            entries[1].playlist_title.as_deref(),
            Some("Fallback Playlist")
        );
    }
}
