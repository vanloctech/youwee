use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
struct DownloadProgress {
    id: String,
    percent: f64,
    speed: String,
    eta: String,
    status: String,
    title: Option<String>,
    playlist_index: Option<u32>,
    playlist_count: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[allow(dead_code)]
struct PlaylistEntry {
    id: String,
    title: String,
    url: String,
}

#[derive(Clone, Serialize)]
#[allow(dead_code)]
struct PlaylistInfo {
    entries: Vec<PlaylistEntry>,
    title: String,
}

/// Video information returned from yt-dlp
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub channel: Option<String>,
    pub uploader: Option<String>,
    pub upload_date: Option<String>,
    pub view_count: Option<u64>,
    pub description: Option<String>,
    pub is_playlist: bool,
    pub playlist_count: Option<u32>,
}

/// Format option from yt-dlp
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FormatOption {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
    pub tbr: Option<f64>,
    pub format_note: Option<String>,
    pub fps: Option<f64>,
    pub quality: Option<f64>,
}

/// Response containing video info and available formats
#[derive(Clone, Serialize, Debug)]
pub struct VideoInfoResponse {
    pub info: VideoInfo,
    pub formats: Vec<FormatOption>,
}

/// Helper to run yt-dlp command and get JSON output
async fn run_ytdlp_json(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(args)
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
                        if status.code != Some(0) {
                            return Err("yt-dlp command failed".to_string());
                        }
                    }
                    _ => {}
                }
            }
            
            Ok(output)
        }
        Err(_) => {
            // Fallback to system yt-dlp
            let output = Command::new("yt-dlp")
                .args(args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
            
            if !output.status.success() {
                return Err("yt-dlp command failed".to_string());
            }
            
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        }
    }
}

#[tauri::command]
async fn get_video_info(app: AppHandle, url: String) -> Result<VideoInfoResponse, String> {
    // Optimized args for faster fetch:
    // - Skip download
    // - Skip playlist expansion  
    // - Use socket timeout
    // - Skip slow extractors
    let args = [
        "--dump-json",
        "--no-download",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout", "10",
        "--extractor-args", "youtube:skip=dash,hls",
        &url,
    ];
    
    let json_output = run_ytdlp_json(&app, &args).await?;
    
    // Parse the JSON output
    let json: serde_json::Value = serde_json::from_str(&json_output)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    // Check if it's a playlist
    let is_playlist = json.get("_type").and_then(|v| v.as_str()) == Some("playlist");
    let playlist_count = if is_playlist {
        json.get("playlist_count").and_then(|v| v.as_u64()).map(|v| v as u32)
    } else {
        None
    };
    
    // Extract video info
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
            // Truncate description to first 200 chars
            if s.len() > 200 {
                format!("{}...", &s[..200])
            } else {
                s.to_string()
            }
        }),
        is_playlist,
        playlist_count,
    };
    
    // Extract formats
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

fn build_format_string(quality: &str, format: &str, video_codec: &str) -> String {
    // Audio-only formats
    if quality == "audio" || format == "mp3" || format == "m4a" || format == "opus" {
        return match format {
            "mp3" => "bestaudio/best".to_string(),
            "m4a" => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
            "opus" => "bestaudio[ext=webm]/bestaudio/best".to_string(),
            _ => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
        };
    }
    
    let height = match quality {
        "4k" => Some("2160"),
        "2k" => Some("1440"),
        "1080" => Some("1080"),
        "720" => Some("720"),
        "480" => Some("480"),
        "360" => Some("360"),
        _ => None,
    };
    
    // Build codec filter
    let _codec_filter = if video_codec == "h264" {
        "[vcodec^=avc]"
    } else {
        "" // auto - no codec filter, let yt-dlp choose best
    };
    
    if format == "mp4" {
        if let Some(h) = height {
            // With H264: prefer avc codec, fallback to any codec
            if video_codec == "h264" {
                format!(
                    "bestvideo[height<={}][vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={}][vcodec^=avc]+bestaudio/bestvideo[height<={}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, h, h, h, h
                )
            } else {
                format!(
                    "bestvideo[height<={}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, h, h
                )
            }
        } else {
            // Best quality
            if video_codec == "h264" {
                "bestvideo[vcodec^=avc][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]+bestaudio/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best".to_string()
            } else {
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best".to_string()
            }
        }
    } else if let Some(h) = height {
        // Non-MP4 formats (MKV, WebM)
        if video_codec == "h264" {
            format!(
                "bestvideo[height<={}][vcodec^=avc]+bestaudio/bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                h, h, h
            )
        } else {
            format!("bestvideo[height<={}]+bestaudio/best[height<={}]/best", h, h)
        }
    } else {
        if video_codec == "h264" {
            "bestvideo[vcodec^=avc]+bestaudio/bestvideo+bestaudio/best".to_string()
        } else {
            "bestvideo+bestaudio/best".to_string()
        }
    }
}

fn parse_progress(line: &str) -> Option<(f64, String, String, Option<u32>, Option<u32>)> {
    let mut playlist_index: Option<u32> = None;
    let mut playlist_count: Option<u32> = None;
    
    // Check for playlist progress
    if line.contains("Downloading item") {
        let re = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok()?;
        if let Some(caps) = re.captures(line) {
            playlist_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
            playlist_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
        }
    }
    
    if line.contains("[download]") && line.contains("%") {
        let re = regex::Regex::new(r"(\d+\.?\d*)%.*?(?:at\s+(\S+))?.*?(?:ETA\s+(\S+))?").ok()?;
        if let Some(caps) = re.captures(line) {
            let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
            let speed = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            let eta = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
            return Some((percent, speed, eta, playlist_index, playlist_count));
        }
    }
    
    None
}

/// Kill all yt-dlp and ffmpeg processes
fn kill_all_download_processes() {
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        // Kill all yt-dlp processes
        StdCommand::new("pkill")
            .args(["-9", "-f", "yt-dlp"])
            .spawn()
            .ok();
        // Kill all ffmpeg processes (yt-dlp spawns these)
        StdCommand::new("pkill")
            .args(["-9", "-f", "ffmpeg"])
            .spawn()
            .ok();
    }
    #[cfg(windows)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("taskkill")
            .args(["/F", "/IM", "yt-dlp.exe"])
            .spawn()
            .ok();
        StdCommand::new("taskkill")
            .args(["/F", "/IM", "ffmpeg.exe"])
            .spawn()
            .ok();
    }
}

#[tauri::command]
async fn download_video(
    app: AppHandle,
    id: String,
    url: String,
    output_path: String,
    quality: String,
    format: String,
    download_playlist: bool,
    video_codec: String,
    audio_bitrate: String,
) -> Result<(), String> {
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    
    let format_string = build_format_string(&quality, &format, &video_codec);
    let output_template = format!("{}/%(title)s.%(ext)s", output_path);
    
    let mut args = vec![
        "--newline".to_string(),
        "-f".to_string(),
        format_string,
        "-o".to_string(),
        output_template,
    ];
    
    // Handle playlist option
    if !download_playlist {
        args.push("--no-playlist".to_string());
    }
    
    // Audio formats - extract audio and convert
    let is_audio_format = format == "mp3" || format == "m4a" || format == "opus" || quality == "audio";
    
    if is_audio_format {
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        match format.as_str() {
            "mp3" => args.push("mp3".to_string()),
            "m4a" => args.push("m4a".to_string()),
            "opus" => args.push("opus".to_string()),
            _ => args.push("mp3".to_string()), // Default to mp3 for audio
        }
        args.push("--audio-quality".to_string());
        // Set audio bitrate
        match audio_bitrate.as_str() {
            "320" => args.push("320K".to_string()),
            "256" => args.push("256K".to_string()),
            "192" => args.push("192K".to_string()),
            "128" => args.push("128K".to_string()),
            _ => args.push("0".to_string()), // "auto" = best quality
        }
    } else {
        // Video formats - set merge output format
        args.push("--merge-output-format".to_string());
        args.push(format.clone());
        
        // For video, we can also set audio quality for the audio track
        if audio_bitrate != "auto" {
            args.push("--postprocessor-args".to_string());
            args.push(format!("ffmpeg:-b:a {}k", audio_bitrate));
        }
    }
    
    args.push(url);
    
    // Try to use bundled sidecar first, fallback to system yt-dlp
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
            
            while let Some(event) = rx.recv().await {
                // Check cancel flag first
                if CANCEL_FLAG.load(Ordering::SeqCst) {
                    child.kill().ok();
                    kill_all_download_processes();
                    return Err("Download cancelled".to_string());
                }
                
                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        
                        // Check for playlist item info
                        if line.contains("Downloading item") {
                            let re = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok();
                            if let Some(re) = re {
                                if let Some(caps) = re.captures(&line) {
                                    current_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
                                    total_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
                                }
                            }
                        }
                        
                        // Extract video title from output
                        if line.contains("[download] Destination:") || line.contains("[ExtractAudio]") {
                            if let Some(start) = line.rfind('/') {
                                let filename = &line[start + 1..];
                                if let Some(end) = filename.rfind('.') {
                                    current_title = Some(filename[..end].to_string());
                                }
                            }
                        }
                        
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
                            };
                            app.emit("download-progress", progress).ok();
                        }
                    }
                    CommandEvent::Stderr(_) => {}
                    CommandEvent::Error(err) => {
                        return Err(format!("Process error: {}", err));
                    }
                    CommandEvent::Terminated(status) => {
                        if CANCEL_FLAG.load(Ordering::SeqCst) {
                            return Err("Download cancelled".to_string());
                        }
                        
                        if status.code == Some(0) {
                            let progress = DownloadProgress {
                                id: id.clone(),
                                percent: 100.0,
                                speed: String::new(),
                                eta: String::new(),
                                status: "finished".to_string(),
                                title: current_title.clone(),
                                playlist_index: current_index,
                                playlist_count: total_count,
                            };
                            app.emit("download-progress", progress).ok();
                            return Ok(());
                        } else {
                            return Err("Download failed".to_string());
                        }
                    }
                    _ => {}
                }
            }
            Ok(())
        }
        Err(_) => {
            // Fallback to system yt-dlp using tokio
            let process = Command::new("yt-dlp")
                .args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}. Please install yt-dlp: brew install yt-dlp", e))?;
            
            handle_tokio_download(app, id, process).await
        }
    }
}

async fn handle_tokio_download(
    app: AppHandle,
    id: String,
    mut process: tokio::process::Child,
) -> Result<(), String> {
    let stdout = process.stdout.take().ok_or("Failed to get stdout")?;
    let mut reader = BufReader::new(stdout).lines();
    
    let mut current_title: Option<String> = None;
    let mut current_index: Option<u32> = None;
    let mut total_count: Option<u32> = None;
    
    while let Ok(Some(line)) = reader.next_line().await {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            process.kill().await.ok();
            kill_all_download_processes();
            return Err("Download cancelled".to_string());
        }
        
        // Check for playlist item info
        if line.contains("Downloading item") {
            let re = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok();
            if let Some(re) = re {
                if let Some(caps) = re.captures(&line) {
                    current_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
                    total_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
                }
            }
        }
        
        // Extract video title from output
        if line.contains("[download] Destination:") {
            if let Some(start) = line.rfind('/') {
                let filename = &line[start + 1..];
                if let Some(end) = filename.rfind('.') {
                    current_title = Some(filename[..end].to_string());
                }
            }
        }
        
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
            };
            app.emit("download-progress", progress).ok();
        }
    }
    
    let status = process.wait().await.map_err(|e| format!("Process error: {}", e))?;
    
    if CANCEL_FLAG.load(Ordering::SeqCst) {
        return Err("Download cancelled".to_string());
    }
    
    if status.success() {
        let progress = DownloadProgress {
            id: id.clone(),
            percent: 100.0,
            speed: String::new(),
            eta: String::new(),
            status: "finished".to_string(),
            title: current_title,
            playlist_index: current_index,
            playlist_count: total_count,
        };
        app.emit("download-progress", progress).ok();
        Ok(())
    } else {
        Err("Download failed".to_string())
    }
}

#[tauri::command]
async fn stop_download() -> Result<(), String> {
    // Set cancel flag
    CANCEL_FLAG.store(true, Ordering::SeqCst);
    
    // Kill all yt-dlp and ffmpeg processes immediately
    kill_all_download_processes();
    
    // Wait a bit and kill again to make sure
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    kill_all_download_processes();
    
    Ok(())
}

/// yt-dlp version information
#[derive(Clone, Serialize)]
pub struct YtdlpVersionInfo {
    pub version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub is_bundled: bool,
    pub binary_path: String,
}

/// Get yt-dlp version by running --version command
#[tauri::command]
async fn get_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String> {
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    let (version, is_bundled, binary_path) = match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(["--version"])
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
            
            let mut output = String::new();
            while let Some(event) = rx.recv().await {
                if let CommandEvent::Stdout(bytes) = event {
                    output.push_str(&String::from_utf8_lossy(&bytes));
                }
            }
            
            let version = output.trim().to_string();
            // Get bundled binary path
            let resource_dir = app.path().resource_dir().ok();
            let bin_path = resource_dir
                .map(|p| p.join("bin").join("yt-dlp").to_string_lossy().to_string())
                .unwrap_or_else(|| "bundled".to_string());
            
            (version, true, bin_path)
        }
        Err(_) => {
            // Fallback to system yt-dlp
            let output = Command::new("yt-dlp")
                .args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("yt-dlp not found: {}", e))?;
            
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            
            // Try to find system binary path
            let which_output = Command::new("which")
                .arg("yt-dlp")
                .output()
                .await
                .ok();
            
            let bin_path = which_output
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_else(|| "system".to_string());
            
            (version, false, bin_path)
        }
    };
    
    Ok(YtdlpVersionInfo {
        version,
        latest_version: None,
        update_available: false,
        is_bundled,
        binary_path,
    })
}

/// GitHub release info structure
#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
}

/// Check for yt-dlp updates from GitHub
#[tauri::command]
async fn check_ytdlp_update() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;
    
    if !response.status().is_success() {
        return Err("Failed to fetch release info".to_string());
    }
    
    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;
    
    Ok(release.tag_name)
}

/// Get the appropriate download URL for current platform
fn get_ytdlp_download_url() -> (&'static str, &'static str) {
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos", "yt-dlp") }
        #[cfg(target_arch = "x86_64")]
        { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos_legacy", "yt-dlp") }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos", "yt-dlp") }
    }
    #[cfg(target_os = "linux")]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux", "yt-dlp") }
    #[cfg(target_os = "windows")]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", "yt-dlp.exe") }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp", "yt-dlp") }
}

/// Update yt-dlp by downloading latest binary from GitHub
#[tauri::command]
async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    let (download_url, filename) = get_ytdlp_download_url();
    
    // Get app data directory for storing updated binary
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    // Create bin directory if it doesn't exist
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let binary_path = bin_dir.join(filename);
    
    // Download the binary
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download yt-dlp: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Write to temporary file first, then rename
    let temp_path = binary_path.with_extension("tmp");
    tokio::fs::write(&temp_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write binary: {}", e))?;
    
    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&temp_path)
            .await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&temp_path, perms)
            .await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    // Rename temp file to final path
    tokio::fs::rename(&temp_path, &binary_path)
        .await
        .map_err(|e| format!("Failed to rename binary: {}", e))?;
    
    // Get the new version
    let output = Command::new(&binary_path)
        .args(["--version"])
        .output()
        .await
        .map_err(|e| format!("Failed to verify update: {}", e))?;
    
    let new_version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    
    Ok(new_version)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            download_video, 
            stop_download, 
            get_video_info,
            get_ytdlp_version,
            check_ytdlp_update,
            update_ytdlp
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
