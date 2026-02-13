use std::process::Stdio;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::process::Command;
use tokio::time::timeout;
use uuid::Uuid;
use crate::types::{VideoInfo, FormatOption, VideoInfoResponse, PlaylistVideoEntry, SubtitleInfo};
use crate::services::{parse_ytdlp_error, run_ytdlp_json_with_cookies, run_ytdlp_with_stderr_and_cookies, build_cookie_args, get_deno_path};
use crate::utils::validate_url;
use crate::utils::CommandExt;
use crate::database::add_log_internal;

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
    proxy_url: Option<String>,
) -> Result<String, String> {
    // Log the URL being processed
    #[cfg(debug_assertions)]
    println!("[TRANSCRIPT] Fetching transcript for URL: {}", &url);
    
    validate_url(&url)?;
    
    add_log_internal("info", &format!("Fetching transcript for AI summary"), None, Some(&url)).ok();
    
    // Create unique temp directory for this request (using UUID to prevent any contamination)
    let request_id = Uuid::new_v4();
    let temp_dir = std::env::temp_dir().join(format!("youwee_subs_{}", request_id));
    
    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        let error_msg = format!("Failed to create temp directory: {}", e);
        add_log_internal("error", &error_msg, None, Some(&url)).ok();
        return Err(error_msg);
    }
    
    let temp_path = temp_dir.join("transcript");
    let temp_path_str = temp_path.to_string_lossy().to_string();
    
    // Clone URL for use in args (ensure we're using the correct URL)
    let url_for_subs = url.clone();
    let url_for_info = url.clone();
    
    // Use provided languages or default
    let lang_list: Vec<String> = languages.unwrap_or_else(|| {
        vec!["en".to_string()]
    });
    
    #[cfg(debug_assertions)]
    println!("[TRANSCRIPT] Languages to try: {:?}", lang_list);
    
    add_log_internal("info", &format!("Trying languages: {}", lang_list.join(", ")), None, Some(&url)).ok();
    
    // Get Deno runtime args for YouTube
    let deno_args: Vec<String> = if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            vec!["--js-runtimes".to_string(), format!("deno:{}", deno_path.to_string_lossy())]
        } else {
            vec![]
        }
    } else {
        vec![]
    };
    
    // Track if we hit a rate limit error
    let mut rate_limited = false;
    let mut specific_error: Option<String> = None;
    let mut subtitle_files: Vec<std::path::PathBuf> = Vec::new();
    
    for (idx, lang) in lang_list.iter().enumerate() {
        #[cfg(debug_assertions)]
        println!("[TRANSCRIPT] Trying language: {} ({}/{})", lang, idx + 1, lang_list.len());
        
        let mut subtitle_args: Vec<String> = vec![
            "--skip-download".to_string(),
            "--no-playlist".to_string(),
            "--write-auto-subs".to_string(),
            "--write-subs".to_string(),
            "--sub-langs".to_string(), lang.clone(),
            "--convert-subs".to_string(), "vtt".to_string(),
            "-o".to_string(), temp_path_str.clone(),
            "--no-warnings".to_string(),
            "--no-check-certificates".to_string(),
            "--no-cache-dir".to_string(),
            "--socket-timeout".to_string(), "30".to_string(),
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
                proxy_url.as_deref(),
            )
        ).await;
        
        match &subtitle_result {
            Ok(Ok(output)) => {
                // Check stderr for errors
                if !output.stderr.is_empty() {
                    #[cfg(debug_assertions)]
                    println!("[TRANSCRIPT] yt-dlp stderr for {}: {}", lang, output.stderr.trim());
                    
                    if output.stderr.to_lowercase().contains("429") {
                        rate_limited = true;
                        add_log_internal("stderr", &format!("Rate limited on language: {}", lang), None, Some(&url)).ok();
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
                    println!("[TRANSCRIPT] Found {} subtitle files for language: {}", subtitle_files.len(), lang);
                    add_log_internal("info", &format!("Found subtitles for language: {}", lang), None, Some(&url)).ok();
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
    println!("[TRANSCRIPT] Total subtitle files found: {}", subtitle_files.len());
    
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
                println!("[TRANSCRIPT] Successfully parsed subtitles ({} words)", word_count);
                
                add_log_internal("success", &format!("Parsed subtitles ({} words)", word_count), None, Some(&url)).ok();
                
                // Clean up
                std::fs::remove_dir_all(&temp_dir).ok();
                return Ok(transcript);
            }
        }
    }
    
    // Clean up subtitle files
    std::fs::remove_dir_all(&temp_dir).ok();
    
    #[cfg(debug_assertions)]
    println!("[TRANSCRIPT] No subtitles found, trying description fallback for URL: {}", &url_for_info);
    
    add_log_internal("info", "No subtitles available, trying description fallback", None, Some(&url)).ok();
    
    // Small delay before next request to avoid rate limiting
    tokio::time::sleep(Duration::from_secs(2)).await;
    
    // No subtitles found - try to get title and description as fallback
    let info_args = vec![
        "--skip-download",
        "--no-playlist",  // Important: only get single video, not playlist
        "--print", "%(title)s|||%(description)s",
        "--no-warnings",
        "--no-cache-dir",
        "--socket-timeout", "30",
        "--",
        &url_for_info,
    ];
    
    let info_cmd = format!("yt-dlp {}", info_args.join(" "));
    add_log_internal("command", &info_cmd, None, Some(&url)).ok();
    
    let info_result = timeout(
        Duration::from_secs(45),  // Increased from 15
        run_ytdlp_json_with_cookies(
            &app,
            &info_args.iter().map(|s| *s).collect::<Vec<_>>(),
            cookie_mode.as_deref(),
            cookie_browser.as_deref(),
            cookie_browser_profile.as_deref(),
            cookie_file_path.as_deref(),
            proxy_url.as_deref(),
        )
    ).await;
    
    match &info_result {
        Ok(Ok(info_str)) => {
            let parts: Vec<&str> = info_str.splitn(2, "|||").collect();
            let title = parts.first().map(|s| s.trim()).unwrap_or("");
            let description = parts.get(1).map(|s| s.trim()).unwrap_or("");
            
            #[cfg(debug_assertions)]
            println!("[TRANSCRIPT] Got title: '{}', description length: {}", title, description.len());
            
            add_log_internal("info", &format!("Got video info - title: '{}', description: {} chars", title, description.len()), None, Some(&url)).ok();
            
            if !description.is_empty() && description.len() > 50 {
                // Check if description seems to contain actual content (not just promo/links)
                if is_description_content_relevant(title, description) {
                    #[cfg(debug_assertions)]
                    println!("[TRANSCRIPT] Description is relevant, using as fallback");
                    
                    add_log_internal("success", "Using video description as fallback content", None, Some(&url)).ok();
                    
                    return Ok(format!("[Video Description - No subtitles available]\nTitle: {}\n\n{}", title, description));
                } else {
                    #[cfg(debug_assertions)]
                    println!("[TRANSCRIPT] Description not relevant (promotional content)");
                    
                    add_log_internal("info", "Description not relevant (promotional content only)", None, Some(&url)).ok();
                }
            }
        }
        Ok(Err(e)) => {
            #[cfg(debug_assertions)]
            println!("[TRANSCRIPT] Description fetch failed: {}", e);
            add_log_internal("stderr", &format!("Description fetch failed: {}", e), None, Some(&url)).ok();
        }
        Err(_) => {
            #[cfg(debug_assertions)]
            println!("[TRANSCRIPT] Description fetch timed out");
            add_log_internal("stderr", "Description fetch timed out (45s)", None, Some(&url)).ok();
        }
    }
    
    // Return specific error message if we detected one
    let error_msg = if rate_limited {
        "YouTube rate limited. Please wait a few minutes before trying again."
    } else if let Some(ref err) = specific_error {
        // Use the specific error we detected
        return Err(err.clone());
    } else {
        "No transcript available. This video has no subtitles, auto-generated captions, or meaningful description to summarize."
    };
    
    add_log_internal("error", error_msg, None, Some(&url)).ok();
    
    Err(error_msg.to_string())
}

/// Check if video description contains relevant content (lyrics, transcript, etc.)
/// Returns false if it's mostly promotional content, links, or author info
fn is_description_content_relevant(title: &str, description: &str) -> bool {
    let desc_lower = description.to_lowercase();
    let title_lower = title.to_lowercase();
    
    // Positive indicators - description likely contains actual content
    let content_indicators = [
        "lyrics", "lời bài hát", "가사", "歌詞", // lyrics indicators
        "transcript", "subtitles", "phụ đề",
        "verse", "chorus", "bridge", "outro", "intro", // song structure
        "chapter", "timestamp", "00:", // timestamps/chapters
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
        "subscribe", "đăng ký", "follow me", "theo dõi",
        "business inquiries", "liên hệ công việc",
        "copyright", "bản quyền",
        "patreon", "paypal", "donate",
        "merch", "merchandise",
        "social media", "mạng xã hội",
    ];
    
    let promo_count = promo_indicators.iter()
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
        let matching_words = title_words.iter()
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
pub async fn get_video_info(
    app: AppHandle,
    url: String,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    proxy_url: Option<String>,
) -> Result<VideoInfoResponse, String> {
    validate_url(&url)?;
    
    let mut args = vec![
        "--dump-json".to_string(),
        "--no-download".to_string(),
        "--no-playlist".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(), "15".to_string(),
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
    
    let json_output = run_ytdlp_json_with_cookies(
        &app,
        &args_ref,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        proxy_url.as_deref(),
    ).await?;
    
    let json: serde_json::Value = serde_json::from_str(&json_output)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    let is_playlist = json.get("_type").and_then(|v| v.as_str()) == Some("playlist");
    let playlist_count = if is_playlist {
        json.get("playlist_count").and_then(|v| v.as_u64()).map(|v| v as u32)
    } else {
        None
    };
    
    let info = VideoInfo {
        id: json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
        thumbnail: json.get("thumbnail").and_then(|v| v.as_str()).map(|s| s.to_string()),
        duration: json.get("duration").and_then(|v| v.as_f64()),
        channel: json.get("channel").and_then(|v| v.as_str()).map(|s| s.to_string()),
        uploader: json.get("uploader").and_then(|v| v.as_str()).map(|s| s.to_string()),
        upload_date: json.get("upload_date").and_then(|v| v.as_str()).map(|s| s.to_string()),
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
        extractor: json.get("extractor").and_then(|v| v.as_str()).map(|s| s.to_string()),
        extractor_key: json.get("extractor_key").and_then(|v| v.as_str()).map(|s| s.to_string()),
        // Live stream fields
        is_live: json.get("is_live").and_then(|v| v.as_bool()),
        was_live: json.get("was_live").and_then(|v| v.as_bool()),
        live_status: json.get("live_status").and_then(|v| v.as_str()).map(|s| s.to_string()),
    };
    
    let formats = if let Some(formats_arr) = json.get("formats").and_then(|v| v.as_array()) {
        formats_arr.iter().filter_map(|f| {
            let format_id = f.get("format_id").and_then(|v| v.as_str())?;
            let ext = f.get("ext").and_then(|v| v.as_str()).unwrap_or("unknown");
            
            Some(FormatOption {
                format_id: format_id.to_string(),
                ext: ext.to_string(),
                resolution: f.get("resolution").and_then(|v| v.as_str()).map(|s| s.to_string()),
                width: f.get("width").and_then(|v| v.as_u64()).map(|v| v as u32),
                height: f.get("height").and_then(|v| v.as_u64()).map(|v| v as u32),
                vcodec: f.get("vcodec").and_then(|v| v.as_str()).map(|s| s.to_string()),
                acodec: f.get("acodec").and_then(|v| v.as_str()).map(|s| s.to_string()),
                filesize: f.get("filesize").and_then(|v| v.as_u64()),
                filesize_approx: f.get("filesize_approx").and_then(|v| v.as_u64()),
                tbr: f.get("tbr").and_then(|v| v.as_f64()),
                format_note: f.get("format_note").and_then(|v| v.as_str()).map(|s| s.to_string()),
                fps: f.get("fps").and_then(|v| v.as_f64()),
                quality: f.get("quality").and_then(|v| v.as_f64()),
            })
        }).collect()
    } else {
        Vec::new()
    };
    
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
    proxy_url: Option<String>,
) -> Result<Vec<PlaylistVideoEntry>, String> {
    validate_url(&url)?;
    
    let mut args = vec![
        "--flat-playlist".to_string(),
        "--dump-json".to_string(),
        "--no-warnings".to_string(),
        "--socket-timeout".to_string(), "30".to_string(),
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
    
    // Add cookie args
    let cookie_args = build_cookie_args(
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
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
    
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    let output = match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(&args_ref)
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
            
            let mut output = String::new();
            
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Stderr(_) => {}
                    CommandEvent::Error(err) => {
                        return Err(format!("Process error: {}", err));
                    }
                    CommandEvent::Terminated(status) => {
                        if status.code != Some(0) && output.is_empty() {
                            return Err("Failed to fetch playlist info".to_string());
                        }
                    }
                    _ => {}
                }
            }
            
            output
        }
        Err(_) => {
            let mut cmd = Command::new("yt-dlp");
            cmd.args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();
            let result = cmd.output().await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
            
            String::from_utf8_lossy(&result.stdout).to_string()
        }
    };
    
    let mut entries: Vec<PlaylistVideoEntry> = Vec::new();
    
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            
            if id.is_empty() {
                continue;
            }
            
            let title = json.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
            let video_url = json.get("url")
                .or_else(|| json.get("webpage_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", id));
            
            let thumbnail = json.get("thumbnail")
                .or_else(|| json.get("thumbnails").and_then(|t| t.as_array()).and_then(|arr| arr.first()))
                .and_then(|v| {
                    if v.is_string() {
                        v.as_str().map(|s| s.to_string())
                    } else {
                        v.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
                    }
                });
            
            let duration = json.get("duration").and_then(|v| v.as_f64());
            let channel = json.get("channel")
                .or_else(|| json.get("uploader"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            
            let upload_date = json.get("upload_date")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            
            entries.push(PlaylistVideoEntry {
                id,
                title,
                url: video_url,
                thumbnail,
                duration,
                channel,
                upload_date,
            });
        }
    }
    
    if entries.is_empty() {
        return Err("No videos found in playlist".to_string());
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
    proxy_url: Option<String>,
) -> Result<Vec<SubtitleInfo>, String> {
    validate_url(&url)?;
    
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
        proxy_url.as_deref(),
    ).await;
    
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
    ].iter().cloned().collect();
    
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
            
            if line.is_empty() || line.starts_with("Language") || line.starts_with("[") || line.contains("Available") {
                continue;
            }
            
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(lang_code) = parts.first() {
                let lang = lang_code.to_string();
                if subtitles.iter().any(|s| s.lang == lang && s.is_auto == is_auto_section) {
                    continue;
                }
                
                let name = lang_names.get(lang.as_str())
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
            SubtitleInfo { lang: "en".to_string(), name: "English".to_string(), is_auto: false },
            SubtitleInfo { lang: "vi".to_string(), name: "Vietnamese".to_string(), is_auto: false },
            SubtitleInfo { lang: "ja".to_string(), name: "Japanese".to_string(), is_auto: false },
            SubtitleInfo { lang: "ko".to_string(), name: "Korean".to_string(), is_auto: false },
            SubtitleInfo { lang: "zh".to_string(), name: "Chinese".to_string(), is_auto: false },
        ];
    }
    
    Ok(subtitles)
}
