//! Download command - handles video downloading with yt-dlp
//! 
//! This module contains the core download functionality including:
//! - Video/audio download with quality/format options
//! - Playlist support
//! - Progress tracking
//! - Subtitle handling

use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::types::DownloadProgress;
use crate::database::add_log_internal;
use crate::database::add_history_internal;
use crate::database::update_history_download;
use crate::utils::{build_format_string, parse_progress, format_size, sanitize_output_path};
use crate::services::{get_ffmpeg_path, get_deno_path, get_ytdlp_path};

pub static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

/// Kill all yt-dlp and ffmpeg processes
fn kill_all_download_processes() {
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("pkill").args(["-9", "-f", "yt-dlp"]).spawn().ok();
        StdCommand::new("pkill").args(["-9", "-f", "ffmpeg"]).spawn().ok();
    }
    #[cfg(windows)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("taskkill").args(["/F", "/IM", "yt-dlp.exe"]).spawn().ok();
        StdCommand::new("taskkill").args(["/F", "/IM", "ffmpeg.exe"]).spawn().ok();
    }
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    id: String,
    url: String,
    output_path: String,
    quality: String,
    format: String,
    download_playlist: bool,
    video_codec: String,
    audio_bitrate: String,
    playlist_limit: Option<u32>,
    subtitle_mode: String,
    subtitle_langs: String,
    subtitle_embed: bool,
    subtitle_format: String,
    log_stderr: Option<bool>,
    _use_bun_runtime: Option<bool>, // Deprecated - now auto uses deno
    use_actual_player_js: Option<bool>,
    history_id: Option<String>,
    // Cookie settings
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    // Embed settings
    embed_metadata: Option<bool>,
    embed_thumbnail: Option<bool>,
    // Proxy settings
    proxy_url: Option<String>,
) -> Result<(), String> {
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    
    let should_log_stderr = log_stderr.unwrap_or(true);
    let sanitized_path = sanitize_output_path(&output_path)?;
    let format_string = build_format_string(&quality, &format, &video_codec);
    let output_template = format!("{}/%(title)s.%(ext)s", sanitized_path);
    
    let mut args = vec![
        "--newline".to_string(),
        "--progress".to_string(),
        "--no-warnings".to_string(),
        "-f".to_string(),
        format_string,
        "-o".to_string(),
        output_template,
        "--print".to_string(),
        "after_move:filepath".to_string(),
        "--no-keep-video".to_string(),
        "--no-keep-fragments".to_string(),
    ];
    
    // Auto use Deno runtime for YouTube (required for JS extractor)
    // Use --js-runtimes instead of --extractor-args (handles spaces in path correctly)
    if url.contains("youtube.com") || url.contains("youtu.be") {
        if let Some(deno_path) = get_deno_path(&app).await {
            args.push("--js-runtimes".to_string());
            args.push(format!("deno:{}", deno_path.to_string_lossy()));
        }
    }
    
    // Add actual player.js version if enabled (fixes some YouTube download issues)
    // See: https://github.com/yt-dlp/yt-dlp/issues/14680
    if use_actual_player_js.unwrap_or(false) && (url.contains("youtube.com") || url.contains("youtu.be")) {
        args.push("--extractor-args".to_string());
        args.push("youtube:player_js_version=actual".to_string());
    }
    
    // Add FFmpeg location if available
    if let Some(ffmpeg_path) = get_ffmpeg_path(&app).await {
        if let Some(parent) = ffmpeg_path.parent() {
            args.push("--ffmpeg-location".to_string());
            args.push(parent.to_string_lossy().to_string());
        }
    }
    
    // Subtitle settings
    if subtitle_mode != "off" {
        args.push("--write-subs".to_string());
        if subtitle_mode == "auto" {
            args.push("--write-auto-subs".to_string());
            args.push("--sub-langs".to_string());
            args.push("all".to_string());
        } else {
            args.push("--sub-langs".to_string());
            args.push(subtitle_langs.clone());
        }
        args.push("--sub-format".to_string());
        args.push(subtitle_format.clone());
        if subtitle_embed {
            args.push("--embed-subs".to_string());
        }
    }
    
    // Cookie/Authentication settings
    let mode = cookie_mode.as_deref().unwrap_or("off");
    match mode {
        "browser" => {
            if let Some(browser) = cookie_browser.as_ref() {
                let mut cookie_arg = browser.clone();
                // Add profile if specified
                if let Some(profile) = cookie_browser_profile.as_ref() {
                    if !profile.is_empty() {
                        cookie_arg = format!("{}:{}", browser, profile);
                    }
                }
                args.push("--cookies-from-browser".to_string());
                args.push(cookie_arg);
            }
        }
        "file" => {
            if let Some(file_path) = cookie_file_path.as_ref() {
                if !file_path.is_empty() {
                    args.push("--cookies".to_string());
                    args.push(file_path.clone());
                }
            }
        }
        _ => {}
    }
    
    // Proxy settings
    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }
    
    // Playlist handling
    if !download_playlist {
        args.push("--no-playlist".to_string());
    } else if let Some(limit) = playlist_limit {
        if limit > 0 {
            args.push("--playlist-end".to_string());
            args.push(limit.to_string());
        }
    }
    
    // Audio formats
    let is_audio_format = format == "mp3" || format == "m4a" || format == "opus" || quality == "audio";
    
    if is_audio_format {
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        match format.as_str() {
            "mp3" => args.push("mp3".to_string()),
            "m4a" => args.push("m4a".to_string()),
            "opus" => args.push("opus".to_string()),
            _ => args.push("mp3".to_string()),
        }
        args.push("--audio-quality".to_string());
        match audio_bitrate.as_str() {
            "128" => args.push("128K".to_string()),
            _ => args.push("0".to_string()),
        }
    } else {
        args.push("--merge-output-format".to_string());
        args.push(format.clone());
    }
    
    // Embed metadata and thumbnail
    if embed_metadata.unwrap_or(false) {
        args.push("--embed-metadata".to_string());
    }
    if embed_thumbnail.unwrap_or(false) {
        args.push("--embed-thumbnail".to_string());
        // Convert thumbnail to jpg for better compatibility with MP4 container
        args.push("--convert-thumbnails".to_string());
        args.push("jpg".to_string());
    }
    
    args.push(url.clone());
    
    // Get binary info for logging
    let binary_info = get_ytdlp_path(&app).await;
    let binary_path_str = binary_info.as_ref()
        .map(|(p, is_bundled)| format!("{} (bundled: {})", p.display(), is_bundled))
        .unwrap_or_else(|| "sidecar".to_string());
    
    // Log command with binary path
    let command_str = format!("[{}] yt-dlp {}", binary_path_str, args.join(" "));
    add_log_internal("command", &command_str, None, Some(&url)).ok();
    
    // Try to get yt-dlp path (prioritizes bundled version for stability)
    if let Some((binary_path, _)) = get_ytdlp_path(&app).await {
        // Build extended PATH with deno/bun locations for JavaScript runtime support
        let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/Users".to_string());
        let current_path = std::env::var("PATH").unwrap_or_default();
        let extended_path = format!(
            "{}/.deno/bin:{}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:{}",
            home_dir, home_dir, current_path
        );
        
        let process = Command::new(&binary_path)
            .args(&args)
            .env("HOME", &home_dir)
            .env("PATH", &extended_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
        
        return handle_tokio_download(app, id, process, quality, format, url, should_log_stderr).await;
    }
    
    // Fallback to sidecar
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, child) = sidecar
                .args(&args)
                .spawn()
                .map_err(|e| format!("Failed to start bundled yt-dlp: {}", e))?;
            
            let mut current_title: Option<String> = None;
            let mut current_index: Option<u32> = None;
            let mut total_count: Option<u32> = None;
            let mut total_filesize: u64 = 0;
            let mut current_stream_size: Option<u64> = None;
            let mut final_filepath: Option<String> = None;
            
            let quality_display = match quality.as_str() {
                "8k" => Some("8K".to_string()),
                "4k" => Some("4K".to_string()),
                "2k" => Some("2K".to_string()),
                "1080" => Some("1080p".to_string()),
                "720" => Some("720p".to_string()),
                "480" => Some("480p".to_string()),
                "360" => Some("360p".to_string()),
                "audio" => Some("Audio".to_string()),
                "best" => Some("Best".to_string()),
                _ => None,
            };
            
            while let Some(event) = rx.recv().await {
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    child.kill().ok();
                    kill_all_download_processes();
                    return Err("Download cancelled".to_string());
                }
                
                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        
                        // Parse playlist item info
                        if line.contains("Downloading item") {
                            if let Some(re) = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok() {
                                if let Some(caps) = re.captures(&line) {
                                    current_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
                                    total_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
                                }
                            }
                        }
                        
                        // Extract title
                        if line.contains("[download] Destination:") || line.contains("[ExtractAudio]") {
                            if let Some(start) = line.rfind('/') {
                                let filename = &line[start + 1..];
                                if let Some(end) = filename.rfind('.') {
                                    current_title = Some(filename[..end].to_string());
                                }
                            }
                        }
                        
                        // Capture final filepath
                        let trimmed = line.trim();
                        if !trimmed.is_empty() 
                            && !trimmed.starts_with('[') 
                            && !trimmed.starts_with("Deleting")
                            && !trimmed.starts_with("WARNING")
                            && !trimmed.starts_with("ERROR")
                            && (trimmed.ends_with(".mp3") 
                                || trimmed.ends_with(".m4a") 
                                || trimmed.ends_with(".opus")
                                || trimmed.ends_with(".mp4")
                                || trimmed.ends_with(".mkv")
                                || trimmed.ends_with(".webm"))
                        {
                            final_filepath = Some(trimmed.to_string());
                        }
                        
                        // Parse filesize
                        if line.contains(" of ") && (line.contains("MiB") || line.contains("GiB") || line.contains("KiB")) {
                            if let Some(re) = regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok() {
                                if let Some(caps) = re.captures(&line) {
                                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                                        if let Ok(size) = num.as_str().parse::<f64>() {
                                            let size_bytes = match unit.as_str() {
                                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                                "KiB" => (size * 1024.0) as u64,
                                                _ => size as u64,
                                            };
                                            if current_stream_size != Some(size_bytes) {
                                                if let Some(prev_size) = current_stream_size {
                                                    total_filesize += prev_size;
                                                }
                                                current_stream_size = Some(size_bytes);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Parse progress
                        if let Some((percent, speed, eta, pi, pc)) = parse_progress(&line) {
                            if pi.is_some() { current_index = pi; }
                            if pc.is_some() { total_count = pc; }
                            
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                            };
                            app.emit("download-progress", progress).ok();
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let stderr_line = String::from_utf8_lossy(&bytes).trim().to_string();
                        
                        if let Some((percent, speed, eta, pi, pc)) = parse_progress(&stderr_line) {
                            if pi.is_some() { current_index = pi; }
                            if pc.is_some() { total_count = pc; }
                            
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent,
                                speed,
                                eta,
                                status: "downloading".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: None,
                                resolution: None,
                                format_ext: None,
                            };
                            app.emit("download-progress", progress).ok();
                        }
                        
                        if should_log_stderr && !stderr_line.is_empty() {
                            add_log_internal("stderr", &stderr_line, None, Some(&url)).ok();
                        }
                    }
                    CommandEvent::Error(err) => {
                        let error_msg = format!("Process error: {}", err);
                        add_log_internal("error", &error_msg, None, Some(&url)).ok();
                        return Err(error_msg);
                    }
                    CommandEvent::Terminated(status) => {
                        if CANCEL_FLAG.load(Ordering::SeqCst) {
                            add_log_internal("info", "Download cancelled by user", None, Some(&url)).ok();
                            return Err("Download cancelled".to_string());
                        }
                        
                        if status.code == Some(0) {
                            let actual_filesize = final_filepath.as_ref()
                                .and_then(|fp| std::fs::metadata(fp).ok())
                                .map(|m| m.len());
                            
                            let reported_filesize = actual_filesize.or_else(|| {
                                if let Some(last_size) = current_stream_size {
                                    Some(total_filesize + last_size)
                                } else if total_filesize > 0 {
                                    Some(total_filesize)
                                } else {
                                    None
                                }
                            });
                            
                            let display_title = current_title.clone().or_else(|| {
                                final_filepath.as_ref().and_then(|path| {
                                    std::path::Path::new(path)
                                        .file_stem()
                                        .and_then(|s| s.to_str())
                                        .map(|s| s.to_string())
                                })
                            });
                            
                            // Log success
                            let success_msg = format!("Downloaded: {}", display_title.clone().unwrap_or_else(|| "Unknown".to_string()));
                            let details = format!(
                                "Size: {} · Quality: {} · Format: {}",
                                reported_filesize.map(format_size).unwrap_or_else(|| "Unknown".to_string()),
                                quality_display.clone().unwrap_or_else(|| quality.clone()),
                                format.clone()
                            );
                            add_log_internal("success", &success_msg, Some(&details), Some(&url)).ok();
                            
                            // Save to history (update existing or create new)
                            if let Some(ref filepath) = final_filepath {
                                if let Some(ref hist_id) = history_id {
                                    // Update existing history entry (re-download)
                                    update_history_download(
                                        hist_id.clone(),
                                        filepath.clone(),
                                        reported_filesize,
                                        quality_display.clone(),
                                        Some(format.clone()),
                                    ).ok();
                                } else {
                                    // Create new history entry
                                    let source = detect_source(&url);
                                    let thumbnail = generate_thumbnail_url(&url);
                                    
                                    add_history_internal(
                                        url.clone(),
                                        display_title.clone().unwrap_or_else(|| "Unknown".to_string()),
                                        thumbnail,
                                        filepath.clone(),
                                        reported_filesize,
                                        None,
                                        quality_display.clone(),
                                        Some(format.clone()),
                                        source,
                                    ).ok();
                                }
                            }
                            
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent: 100.0,
                                speed: String::new(),
                                eta: String::new(),
                                status: "finished".to_string(),
                                title: display_title,
                                playlist_index: current_index,
                                playlist_count: total_count,
                                filesize: reported_filesize,
                                resolution: quality_display.clone(),
                                format_ext: Some(format.clone()),
                            };
                            app.emit("download-progress", progress).ok();
                            return Ok(());
                        } else {
                            add_log_internal("error", "Download failed", None, Some(&url)).ok();
                            return Err("Download failed".to_string());
                        }
                    }
                    _ => {}
                }
            }
            Ok(())
        }
        Err(_) => {
            // Fallback to system yt-dlp
            let process = Command::new("yt-dlp")
                .args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
            
            handle_tokio_download(app, id, process, quality, format, url, should_log_stderr).await
        }
    }
}

async fn handle_tokio_download(
    app: AppHandle,
    id: String,
    mut process: tokio::process::Child,
    quality: String,
    format: String,
    url: String,
    should_log_stderr: bool,
) -> Result<(), String> {
    let stdout = process.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = process.stderr.take();
    let mut reader = BufReader::new(stdout).lines();
    
    let mut current_title: Option<String> = None;
    let mut current_index: Option<u32> = None;
    let mut total_count: Option<u32> = None;
    let mut total_filesize: u64 = 0;
    let mut current_stream_size: Option<u64> = None;
    let mut final_filepath: Option<String> = None;
    
    let quality_display = match quality.as_str() {
        "8k" => Some("8K".to_string()),
        "4k" => Some("4K".to_string()),
        "2k" => Some("2K".to_string()),
        "1080" => Some("1080p".to_string()),
        "720" => Some("720p".to_string()),
        "480" => Some("480p".to_string()),
        "360" => Some("360p".to_string()),
        "audio" => Some("Audio".to_string()),
        "best" => Some("Best".to_string()),
        _ => None,
    };
    
    while let Ok(Some(line)) = reader.next_line().await {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            process.kill().await.ok();
            kill_all_download_processes();
            return Err("Download cancelled".to_string());
        }
        
        // Parse progress and emit events
        if let Some((percent, speed, eta, pi, pc)) = parse_progress(&line) {
            if pi.is_some() { current_index = pi; }
            if pc.is_some() { total_count = pc; }
            
            let progress = DownloadProgress {
                id: id.clone(),
                percent,
                speed,
                eta,
                status: "downloading".to_string(),
                title: current_title.clone(),
                playlist_index: current_index,
                playlist_count: total_count,
                filesize: None,
                resolution: None,
                format_ext: None,
            };
            app.emit("download-progress", progress).ok();
        }
        
        // Extract title
        if line.contains("[download] Destination:") {
            if let Some(start) = line.rfind('/') {
                let filename = &line[start + 1..];
                if let Some(end) = filename.rfind('.') {
                    current_title = Some(filename[..end].to_string());
                }
            }
        }
        
        // Capture final filepath
        let trimmed = line.trim();
        if !trimmed.is_empty() 
            && !trimmed.starts_with('[') 
            && (trimmed.ends_with(".mp3") || trimmed.ends_with(".m4a") 
                || trimmed.ends_with(".opus") || trimmed.ends_with(".mp4")
                || trimmed.ends_with(".mkv") || trimmed.ends_with(".webm"))
        {
            final_filepath = Some(trimmed.to_string());
        }
        
        // Parse filesize
        if line.contains(" of ") && (line.contains("MiB") || line.contains("GiB")) {
            if let Some(re) = regex::Regex::new(r"of\s+(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB)").ok() {
                if let Some(caps) = re.captures(&line) {
                    if let (Some(num), Some(unit)) = (caps.get(1), caps.get(2)) {
                        if let Ok(size) = num.as_str().parse::<f64>() {
                            let size_bytes = match unit.as_str() {
                                "GiB" => (size * 1024.0 * 1024.0 * 1024.0) as u64,
                                "MiB" => (size * 1024.0 * 1024.0) as u64,
                                "KiB" => (size * 1024.0) as u64,
                                _ => size as u64,
                            };
                            if current_stream_size != Some(size_bytes) {
                                if let Some(prev_size) = current_stream_size {
                                    total_filesize += prev_size;
                                }
                                current_stream_size = Some(size_bytes);
                            }
                        }
                    }
                }
            }
        }
    }
    
    let status = process.wait().await.map_err(|e| format!("Process error: {}", e))?;
    
    // Process stderr
    if should_log_stderr {
        if let Some(stderr_handle) = stderr {
            let mut stderr_reader = BufReader::new(stderr_handle).lines();
            while let Ok(Some(stderr_line)) = stderr_reader.next_line().await {
                if !stderr_line.trim().is_empty() {
                    add_log_internal("stderr", stderr_line.trim(), None, Some(&url)).ok();
                }
            }
        }
    }
    
    if status.success() {
        let actual_filesize = final_filepath.as_ref()
            .and_then(|fp| std::fs::metadata(fp).ok())
            .map(|m| m.len());
        
        let reported_filesize = actual_filesize.or_else(|| {
            if let Some(last_size) = current_stream_size {
                Some(total_filesize + last_size)
            } else if total_filesize > 0 {
                Some(total_filesize)
            } else {
                None
            }
        });
        
        let success_msg = format!("Downloaded: {}", current_title.clone().unwrap_or_else(|| "Unknown".to_string()));
        let details = format!(
            "Size: {} · Quality: {} · Format: {}",
            reported_filesize.map(format_size).unwrap_or_else(|| "Unknown".to_string()),
            quality_display.clone().unwrap_or_else(|| quality.clone()),
            format.clone()
        );
        add_log_internal("success", &success_msg, Some(&details), Some(&url)).ok();
        
        // Save to history
        if let Some(ref filepath) = final_filepath {
            let source = detect_source(&url);
            let thumbnail = generate_thumbnail_url(&url);
            
            add_history_internal(
                url.clone(),
                current_title.clone().unwrap_or_else(|| "Unknown".to_string()),
                thumbnail,
                filepath.clone(),
                reported_filesize,
                None,
                quality_display.clone(),
                Some(format.clone()),
                source,
            ).ok();
        }
        
        let progress = DownloadProgress {
            id: id.clone(),
            percent: 100.0,
            speed: String::new(),
            eta: String::new(),
            status: "finished".to_string(),
            title: current_title,
            playlist_index: current_index,
            playlist_count: total_count,
            filesize: reported_filesize,
            resolution: quality_display,
            format_ext: Some(format),
        };
        app.emit("download-progress", progress).ok();
        Ok(())
    } else {
        add_log_internal("error", "Download failed", None, Some(&url)).ok();
        Err("Download failed".to_string())
    }
}

#[tauri::command]
pub async fn stop_download() -> Result<(), String> {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    kill_all_download_processes();
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    kill_all_download_processes();
    Ok(())
}

fn detect_source(url: &str) -> Option<String> {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        Some("youtube".to_string())
    } else if url.contains("tiktok.com") {
        Some("tiktok".to_string())
    } else if url.contains("facebook.com") || url.contains("fb.watch") {
        Some("facebook".to_string())
    } else if url.contains("instagram.com") {
        Some("instagram".to_string())
    } else if url.contains("twitter.com") || url.contains("x.com") {
        Some("twitter".to_string())
    } else {
        Some("other".to_string())
    }
}

fn generate_thumbnail_url(url: &str) -> Option<String> {
    if url.contains("youtube.com") || url.contains("youtu.be") {
        let video_id = if url.contains("v=") {
            url.split("v=").nth(1).and_then(|s| s.split('&').next())
        } else if url.contains("youtu.be/") {
            url.split("youtu.be/").nth(1).and_then(|s| s.split('?').next())
        } else {
            None
        };
        video_id.map(|id| format!("https://i.ytimg.com/vi/{}/mqdefault.jpg", id))
    } else {
        None
    }
}
