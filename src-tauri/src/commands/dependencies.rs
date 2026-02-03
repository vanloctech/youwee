use std::process::Stdio;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;
use tokio::io::AsyncWriteExt;
use futures_util::StreamExt;
use crate::types::{YtdlpVersionInfo, FfmpegStatus, DenoStatus, YtdlpChannel, YtdlpAllVersions, YtdlpChannelUpdateInfo};
use crate::services::{
    get_ytdlp_version_internal, get_ytdlp_download_info, verify_sha256,
    check_ffmpeg_internal, get_ffmpeg_download_info, parse_ffmpeg_version,
    get_ffmpeg_path, check_ffmpeg_update_internal, FfmpegUpdateInfo,
    check_deno_internal, get_deno_download_url, check_deno_update_internal, DenoUpdateInfo,
    get_ytdlp_channel, set_ytdlp_channel, get_all_ytdlp_versions,
    get_ytdlp_channel_download_url, get_channel_api_url,
};
use crate::utils::{extract_tar_gz, extract_tar_xz, extract_zip, extract_deno_zip, CommandExt};

/// Download progress event payload
#[derive(Clone, Serialize)]
struct DownloadProgress {
    stage: String,
    percent: u8,
    downloaded: u64,
    total: u64,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
}

#[derive(Serialize)]
pub struct DetectedBrowser {
    pub name: String,
    pub browser_type: String,
}

#[derive(Serialize)]
pub struct BrowserProfile {
    pub folder_name: String,   // Used for yt-dlp: "Profile 1"
    pub display_name: String,  // Shown to user: "Loc Nguyen" or fallback to folder_name
}

#[tauri::command]
pub async fn get_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String> {
    get_ytdlp_version_internal(&app).await
}

#[tauri::command]
pub async fn check_ytdlp_update() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.4.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Request timed out. Please try again later.".to_string()
            } else if e.is_connect() {
                "Unable to connect. Please check your internet connection.".to_string()
            } else {
                format!("Failed to check for updates: {}", e)
            }
        })?;
    
    let status = response.status();
    
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("GitHub API rate limit exceeded. Please try again later.".to_string());
    }
    
    if !status.is_success() {
        return Err(format!("GitHub API error: {}", status));
    }
    
    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;
    
    Ok(release.tag_name)
}

#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    let (download_url, filename, checksum_filename) = get_ytdlp_download_info();
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let binary_path = bin_dir.join(filename);
    
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.4.0")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Download checksums (using stable releases for reliability)
    let checksums_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
    let checksums_response = client.get(checksums_url).send().await
        .map_err(|e| format!("Failed to download checksums: {}", e))?;
    
    if !checksums_response.status().is_success() {
        return Err(format!("Failed to download checksums: HTTP {}", checksums_response.status()));
    }
    
    let checksums_text = checksums_response.text().await
        .map_err(|e| format!("Failed to read checksums: {}", e))?;
    
    let expected_hash = checksums_text
        .lines()
        .find_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == checksum_filename {
                Some(parts[0].to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| format!("Checksum not found for {}", checksum_filename))?;
    
    // Download binary
    let response = client.get(download_url).send().await
        .map_err(|e| format!("Failed to download yt-dlp: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Verify checksum
    if !verify_sha256(&bytes, &expected_hash) {
        return Err("Security error: SHA256 checksum verification failed.".to_string());
    }
    
    // Write binary
    let temp_path = binary_path.with_extension("tmp");
    tokio::fs::write(&temp_path, &bytes).await
        .map_err(|e| format!("Failed to write binary: {}", e))?;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&temp_path).await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&temp_path, perms).await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    tokio::fs::rename(&temp_path, &binary_path).await
        .map_err(|e| format!("Failed to rename binary: {}", e))?;
    
    // Get version
    let mut cmd = Command::new(&binary_path);
    cmd.args(["--version"]);
    cmd.hide_window();
    let output = cmd.output().await
        .map_err(|e| format!("Failed to verify update: {}", e))?;
    
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ============ yt-dlp Channel Commands ============

#[tauri::command]
pub async fn get_ytdlp_channel_cmd(app: AppHandle) -> Result<String, String> {
    let channel = get_ytdlp_channel(&app).await;
    Ok(channel.as_str().to_string())
}

#[tauri::command]
pub async fn set_ytdlp_channel_cmd(app: AppHandle, channel: String) -> Result<(), String> {
    let channel_enum = YtdlpChannel::from_str(&channel);
    set_ytdlp_channel(&app, &channel_enum).await
}

#[tauri::command]
pub async fn get_all_ytdlp_versions_cmd(app: AppHandle) -> Result<YtdlpAllVersions, String> {
    Ok(get_all_ytdlp_versions(&app).await)
}

#[tauri::command]
pub async fn check_ytdlp_channel_update(app: AppHandle, channel: String) -> Result<YtdlpChannelUpdateInfo, String> {
    let channel_enum = YtdlpChannel::from_str(&channel);
    
    // Get API URL for the channel
    let api_url = get_channel_api_url(&channel_enum)
        .ok_or("Cannot check updates for bundled channel")?;
    
    // Get current installed version
    let all_versions = get_all_ytdlp_versions(&app).await;
    let current_version = match channel_enum {
        YtdlpChannel::Bundled => all_versions.bundled.version,
        YtdlpChannel::Stable => all_versions.stable.version,
        YtdlpChannel::Nightly => all_versions.nightly.version,
    };
    
    // Fetch latest version from GitHub
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.6.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get(api_url)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Request timed out. Please try again later.".to_string()
            } else if e.is_connect() {
                "Unable to connect. Please check your internet connection.".to_string()
            } else {
                format!("Failed to check for updates: {}", e)
            }
        })?;
    
    let status = response.status();
    
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("GitHub API rate limit exceeded. Please try again later.".to_string());
    }
    
    if !status.is_success() {
        return Err(format!("GitHub API error: {}", status));
    }
    
    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;
    
    let latest_version = release.tag_name;
    let update_available = current_version.as_ref()
        .map(|cv| cv != &latest_version)
        .unwrap_or(true); // If not installed, update is available
    
    Ok(YtdlpChannelUpdateInfo {
        channel: channel_enum.as_str().to_string(),
        current_version,
        latest_version,
        update_available,
    })
}

#[tauri::command]
pub async fn download_ytdlp_channel(app: AppHandle, channel: String) -> Result<String, String> {
    let channel_enum = YtdlpChannel::from_str(&channel);
    
    // Get download URL for the channel
    let (download_url, checksum_filename) = get_ytdlp_channel_download_url(&channel_enum)
        .ok_or("Cannot download bundled channel")?;
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    // Determine binary name based on channel
    #[cfg(windows)]
    let binary_name = match channel_enum {
        YtdlpChannel::Bundled => "yt-dlp.exe",
        YtdlpChannel::Stable => "yt-dlp-stable.exe",
        YtdlpChannel::Nightly => "yt-dlp-nightly.exe",
    };
    #[cfg(not(windows))]
    let binary_name = match channel_enum {
        YtdlpChannel::Bundled => "yt-dlp",
        YtdlpChannel::Stable => "yt-dlp-stable",
        YtdlpChannel::Nightly => "yt-dlp-nightly",
    };
    
    let binary_path = bin_dir.join(binary_name);
    
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.6.0")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Get checksums URL based on channel
    let checksums_url = match channel_enum {
        YtdlpChannel::Bundled => return Err("Cannot download bundled channel".to_string()),
        YtdlpChannel::Stable => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS",
        YtdlpChannel::Nightly => "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/SHA2-256SUMS",
    };
    
    // Download checksums
    let checksums_response = client.get(checksums_url).send().await
        .map_err(|e| format!("Failed to download checksums: {}", e))?;
    
    if !checksums_response.status().is_success() {
        return Err(format!("Failed to download checksums: HTTP {}", checksums_response.status()));
    }
    
    let checksums_text = checksums_response.text().await
        .map_err(|e| format!("Failed to read checksums: {}", e))?;
    
    let expected_hash = checksums_text
        .lines()
        .find_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == checksum_filename {
                Some(parts[0].to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| format!("Checksum not found for {}", checksum_filename))?;
    
    // Download binary
    let response = client.get(download_url).send().await
        .map_err(|e| format!("Failed to download yt-dlp: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Verify checksum
    if !verify_sha256(&bytes, &expected_hash) {
        return Err("Security error: SHA256 checksum verification failed.".to_string());
    }
    
    // Write binary
    let temp_path = binary_path.with_extension("tmp");
    tokio::fs::write(&temp_path, &bytes).await
        .map_err(|e| format!("Failed to write binary: {}", e))?;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&temp_path).await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&temp_path, perms).await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    tokio::fs::rename(&temp_path, &binary_path).await
        .map_err(|e| format!("Failed to rename binary: {}", e))?;
    
    // Get version
    let mut cmd = Command::new(&binary_path);
    cmd.args(["--version"]);
    cmd.hide_window();
    let output = cmd.output().await
        .map_err(|e| format!("Failed to verify installation: {}", e))?;
    
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn check_ffmpeg(app: AppHandle) -> Result<FfmpegStatus, String> {
    check_ffmpeg_internal(&app).await
}

#[tauri::command]
pub async fn check_ffmpeg_update(app: AppHandle) -> Result<FfmpegUpdateInfo, String> {
    check_ffmpeg_update_internal(&app).await
}

#[tauri::command]
pub async fn download_ffmpeg(app: AppHandle) -> Result<String, String> {
    let info = get_ffmpeg_download_info();
    
    if info.url.is_empty() {
        return Err("Unsupported platform".to_string());
    }
    
    // Emit: Starting
    let _ = app.emit("ffmpeg-download-progress", DownloadProgress {
        stage: "checksum".to_string(),
        percent: 0,
        downloaded: 0,
        total: 0,
    });
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    tokio::fs::create_dir_all(&bin_dir).await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.6.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Download checksum file
    let checksum_response = client.get(info.checksum_url).send().await
        .map_err(|e| format!("Failed to download checksum: {}", e))?;
    
    if !checksum_response.status().is_success() {
        return Err(format!("Failed to download checksum: HTTP {}", checksum_response.status()));
    }
    
    let checksum_text = checksum_response.text().await
        .map_err(|e| format!("Failed to read checksum: {}", e))?;
    
    // Parse checksum - format: "<hash>  <filename>" or just "<hash>"
    let expected_hash = checksum_text
        .lines()
        .find_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && parts[1] == info.checksum_filename {
                Some(parts[0].to_string())
            } else if parts.len() == 1 {
                // Single hash format (macOS individual .sha256 files)
                Some(parts[0].to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| format!("Checksum not found for {}", info.checksum_filename))?;
    
    // Emit: Downloading FFmpeg
    let _ = app.emit("ffmpeg-download-progress", DownloadProgress {
        stage: "downloading".to_string(),
        percent: 0,
        downloaded: 0,
        total: 0,
    });
    
    // Download FFmpeg archive with progress
    let response = client.get(info.url).send().await
        .map_err(|e| format!("Failed to download FFmpeg: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;
    
    // Stream download to temp file
    let temp_path = bin_dir.join("ffmpeg_download.tmp");
    let mut file = tokio::fs::File::create(&temp_path).await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    
    let mut stream = response.bytes_stream();
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk).await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u8
        } else {
            0
        };
        
        // Only emit every 5% to avoid spamming
        if percent >= last_percent + 5 || percent == 100 {
            last_percent = percent;
            let _ = app.emit("ffmpeg-download-progress", DownloadProgress {
                stage: "downloading".to_string(),
                percent,
                downloaded,
                total: total_size,
            });
        }
    }
    
    file.flush().await.map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);
    
    // Read file for checksum verification
    let bytes = tokio::fs::read(&temp_path).await
        .map_err(|e| format!("Failed to read downloaded file: {}", e))?;
    
    // Emit: Verifying checksum
    let _ = app.emit("ffmpeg-download-progress", DownloadProgress {
        stage: "verifying".to_string(),
        percent: 100,
        downloaded,
        total: total_size,
    });
    
    // Verify checksum
    if !verify_sha256(&bytes, &expected_hash) {
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err("Security error: SHA256 checksum verification failed.".to_string());
    }
    
    // Emit: Extracting
    let _ = app.emit("ffmpeg-download-progress", DownloadProgress {
        stage: "extracting".to_string(),
        percent: 100,
        downloaded,
        total: total_size,
    });
    
    #[cfg(windows)]
    let ffmpeg_binary = "ffmpeg.exe";
    #[cfg(not(windows))]
    let ffmpeg_binary = "ffmpeg";
    
    let ffmpeg_path = bin_dir.join(ffmpeg_binary);
    
    match info.archive_type {
        "tar.gz" => extract_tar_gz(&bytes, &bin_dir, ffmpeg_binary).await?,
        "tar.xz" => extract_tar_xz(&bytes, &bin_dir, ffmpeg_binary).await?,
        "zip" => extract_zip(&bytes, &bin_dir, ffmpeg_binary).await?,
        _ => return Err("Unsupported archive type".to_string()),
    }
    
    // Clean up temp file
    let _ = tokio::fs::remove_file(&temp_path).await;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&ffmpeg_path).await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&ffmpeg_path, perms).await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    // Emit: Complete
    let _ = app.emit("ffmpeg-download-progress", DownloadProgress {
        stage: "complete".to_string(),
        percent: 100,
        downloaded,
        total: total_size,
    });
    
    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args(["-version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();
    let output = cmd.output().await
        .map_err(|e| format!("Failed to verify FFmpeg installation: {}", e))?;
    
    Ok(parse_ffmpeg_version(&String::from_utf8_lossy(&output.stdout)))
}

#[tauri::command]
pub async fn get_ffmpeg_path_for_ytdlp(app: AppHandle) -> Result<Option<String>, String> {
    Ok(get_ffmpeg_path(&app).await.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn check_deno(app: AppHandle) -> Result<DenoStatus, String> {
    check_deno_internal(&app).await
}

#[tauri::command]
pub async fn check_deno_update(app: AppHandle) -> Result<DenoUpdateInfo, String> {
    check_deno_update_internal(&app).await
}

#[tauri::command]
pub async fn download_deno(app: AppHandle) -> Result<String, String> {
    let download_url = get_deno_download_url();
    
    if download_url.is_empty() {
        return Err("Unsupported platform".to_string());
    }
    
    // Emit: Starting
    let _ = app.emit("deno-download-progress", DownloadProgress {
        stage: "downloading".to_string(),
        percent: 0,
        downloaded: 0,
        total: 0,
    });
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    tokio::fs::create_dir_all(&bin_dir).await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.6.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client.get(download_url).send().await
        .map_err(|e| format!("Failed to download Deno: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;
    
    // Stream download to temp file
    let temp_path = bin_dir.join("deno_download.tmp");
    let mut file = tokio::fs::File::create(&temp_path).await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    
    let mut stream = response.bytes_stream();
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk).await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u8
        } else {
            0
        };
        
        // Only emit every 5% to avoid spamming
        if percent >= last_percent + 5 || percent == 100 {
            last_percent = percent;
            let _ = app.emit("deno-download-progress", DownloadProgress {
                stage: "downloading".to_string(),
                percent,
                downloaded,
                total: total_size,
            });
        }
    }
    
    file.flush().await.map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);
    
    // Read file for extraction
    let bytes = tokio::fs::read(&temp_path).await
        .map_err(|e| format!("Failed to read downloaded file: {}", e))?;
    
    // Emit: Extracting
    let _ = app.emit("deno-download-progress", DownloadProgress {
        stage: "extracting".to_string(),
        percent: 100,
        downloaded,
        total: total_size,
    });
    
    #[cfg(windows)]
    let deno_binary = "deno.exe";
    #[cfg(not(windows))]
    let deno_binary = "deno";
    
    let deno_path = bin_dir.join(deno_binary);
    
    // Extract deno from zip (deno zip contains just the binary directly)
    extract_deno_zip(&bytes, &bin_dir, deno_binary).await?;
    
    // Clean up temp file
    let _ = tokio::fs::remove_file(&temp_path).await;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&deno_path).await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&deno_path, perms).await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    // Emit: Complete
    let _ = app.emit("deno-download-progress", DownloadProgress {
        stage: "complete".to_string(),
        percent: 100,
        downloaded,
        total: total_size,
    });
    
    let mut cmd = Command::new(&deno_path);
    cmd.args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();
    let output = cmd.output().await
        .map_err(|e| format!("Failed to verify Deno installation: {}", e))?;
    
    // Parse version from "deno 2.1.2 (...)" format
    let version_output = String::from_utf8_lossy(&output.stdout);
    let version = version_output.lines().next()
        .map(|l| l.trim_start_matches("deno ").split_whitespace().next().unwrap_or("").to_string())
        .unwrap_or_default();
    
    Ok(version)
}

#[tauri::command]
pub async fn detect_installed_browsers() -> Result<Vec<DetectedBrowser>, String> {
    let mut browsers = Vec::new();
    
    #[cfg(target_os = "macos")]
    {
        let browser_checks = [
            ("Google Chrome", "chrome", "/Applications/Google Chrome.app"),
            ("Firefox", "firefox", "/Applications/Firefox.app"),
            ("Safari", "safari", "/Applications/Safari.app"),
            ("Microsoft Edge", "edge", "/Applications/Microsoft Edge.app"),
            ("Brave", "brave", "/Applications/Brave Browser.app"),
            ("Opera", "opera", "/Applications/Opera.app"),
            ("Vivaldi", "vivaldi", "/Applications/Vivaldi.app"),
        ];
        
        for (name, browser_type, path) in browser_checks {
            if std::path::Path::new(path).exists() {
                browsers.push(DetectedBrowser {
                    name: name.to_string(),
                    browser_type: browser_type.to_string(),
                });
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("PROGRAMFILES").unwrap_or_default();
        let program_files_x86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_default();
        
        let browser_checks: [(&str, &str, Vec<String>); 6] = [
            ("Google Chrome", "chrome", vec![
                format!("{}\\Google\\Chrome\\Application\\chrome.exe", local_app_data),
                format!("{}\\Google\\Chrome\\Application\\chrome.exe", program_files),
                format!("{}\\Google\\Chrome\\Application\\chrome.exe", program_files_x86),
            ]),
            ("Firefox", "firefox", vec![
                format!("{}\\Mozilla Firefox\\firefox.exe", program_files),
                format!("{}\\Mozilla Firefox\\firefox.exe", program_files_x86),
            ]),
            ("Microsoft Edge", "edge", vec![
                format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", program_files),
                format!("{}\\Microsoft\\Edge\\Application\\msedge.exe", program_files_x86),
            ]),
            ("Brave", "brave", vec![
                format!("{}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe", local_app_data),
                format!("{}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe", program_files),
            ]),
            ("Opera", "opera", vec![
                format!("{}\\Programs\\Opera\\opera.exe", local_app_data),
                format!("{}\\Opera\\opera.exe", program_files),
            ]),
            ("Vivaldi", "vivaldi", vec![
                format!("{}\\Vivaldi\\Application\\vivaldi.exe", local_app_data),
            ]),
        ];
        
        for (name, browser_type, paths) in browser_checks {
            for path in paths {
                if std::path::Path::new(&path).exists() {
                    browsers.push(DetectedBrowser {
                        name: name.to_string(),
                        browser_type: browser_type.to_string(),
                    });
                    break;
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        let browser_checks = [
            ("Google Chrome", "chrome", vec!["google-chrome", "google-chrome-stable"]),
            ("Firefox", "firefox", vec!["firefox"]),
            ("Brave", "brave", vec!["brave-browser", "brave"]),
            ("Opera", "opera", vec!["opera"]),
            ("Vivaldi", "vivaldi", vec!["vivaldi", "vivaldi-stable"]),
        ];
        
        for (name, browser_type, commands) in browser_checks {
            for cmd_name in commands {
                let mut cmd = Command::new("which");
                cmd.arg(cmd_name)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                cmd.hide_window();
                let result = cmd.status().await;
                
                if let Ok(status) = result {
                    if status.success() {
                        browsers.push(DetectedBrowser {
                            name: name.to_string(),
                            browser_type: browser_type.to_string(),
                        });
                        break;
                    }
                }
            }
        }
    }
    
    Ok(browsers)
}

#[tauri::command]
pub async fn get_browser_profiles(browser: String) -> Result<Vec<BrowserProfile>, String> {
    let mut profiles = Vec::new();
    
    // Helper function to read display name from Chrome/Chromium Preferences file
    fn get_chromium_profile_name(prefs_path: &std::path::Path) -> Option<String> {
        if let Ok(content) = std::fs::read_to_string(prefs_path) {
            // Simple JSON parsing for profile.name
            // Looking for: "profile": { ... "name": "Display Name" ... }
            if let Some(profile_start) = content.find("\"profile\"") {
                let profile_section = &content[profile_start..];
                // Find "name": "value" pattern
                if let Some(name_start) = profile_section.find("\"name\"") {
                    let after_name = &profile_section[name_start + 6..]; // skip "name"
                    // Find the colon and then the opening quote
                    if let Some(colon_pos) = after_name.find(':') {
                        let after_colon = &after_name[colon_pos + 1..];
                        // Skip whitespace and find opening quote
                        let trimmed = after_colon.trim_start();
                        if trimmed.starts_with('"') {
                            let value_start = &trimmed[1..]; // skip opening quote
                            if let Some(end_quote) = value_start.find('"') {
                                let name = &value_start[..end_quote];
                                if !name.is_empty() {
                                    return Some(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    }
    
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        
        let profile_dir = match browser.as_str() {
            "chrome" => format!("{}/Library/Application Support/Google/Chrome", home),
            "edge" => format!("{}/Library/Application Support/Microsoft Edge", home),
            "brave" => format!("{}/Library/Application Support/BraveSoftware/Brave-Browser", home),
            "vivaldi" => format!("{}/Library/Application Support/Vivaldi", home),
            "opera" => format!("{}/Library/Application Support/com.operasoftware.Opera", home),
            "firefox" => {
                // Firefox uses profiles.ini - display name is the same as folder name
                let profiles_ini = format!("{}/Library/Application Support/Firefox/profiles.ini", home);
                if let Ok(content) = std::fs::read_to_string(&profiles_ini) {
                    for line in content.lines() {
                        if line.starts_with("Name=") {
                            let name = line.trim_start_matches("Name=");
                            if !name.is_empty() {
                                profiles.push(BrowserProfile {
                                    folder_name: name.to_string(),
                                    display_name: name.to_string(),
                                });
                            }
                        }
                    }
                }
                return Ok(profiles);
            }
            "safari" => return Ok(profiles), // Safari has no profiles
            _ => return Ok(profiles),
        };
        
        // For Chromium-based browsers, scan directory for profile folders
        if let Ok(entries) = std::fs::read_dir(&profile_dir) {
            let exclude_dirs = [
                "Crashpad", "GrShaderCache", "ShaderCache", "BrowserMetrics",
                "Crowd Deny", "FileTypePolicies", "MEIPreload", "SafetyTips",
                "SSLErrorAssistant", "Subresource Filter", "WidevineCdm",
                "extensions", "hyphen-data", "pnacl", "ZxcvbnData",
                "component_crx_cache", "CertificateRevocation", "OriginTrials",
                "System Profile", "Guest Profile",
            ];
            
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    let prefs_path = path.join("Preferences");
                    if prefs_path.exists() && !exclude_dirs.contains(&folder_name.as_str()) {
                        let display_name = get_chromium_profile_name(&prefs_path)
                            .unwrap_or_else(|| folder_name.clone());
                        profiles.push(BrowserProfile {
                            folder_name,
                            display_name,
                        });
                    }
                }
            }
        }
        
        // Sort: "Default" first, then others alphabetically by folder_name
        profiles.sort_by(|a, b| {
            if a.folder_name == "Default" {
                std::cmp::Ordering::Less
            } else if b.folder_name == "Default" {
                std::cmp::Ordering::Greater
            } else {
                a.folder_name.cmp(&b.folder_name)
            }
        });
    }
    
    #[cfg(target_os = "windows")]
    {
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let app_data = std::env::var("APPDATA").unwrap_or_default();
        
        let profile_dir = match browser.as_str() {
            "chrome" => format!("{}\\Google\\Chrome\\User Data", local_app_data),
            "edge" => format!("{}\\Microsoft\\Edge\\User Data", local_app_data),
            "brave" => format!("{}\\BraveSoftware\\Brave-Browser\\User Data", local_app_data),
            "vivaldi" => format!("{}\\Vivaldi\\User Data", local_app_data),
            "opera" => format!("{}\\Opera Software\\Opera Stable", app_data),
            "firefox" => {
                let profiles_ini = format!("{}\\Mozilla\\Firefox\\profiles.ini", app_data);
                if let Ok(content) = std::fs::read_to_string(&profiles_ini) {
                    for line in content.lines() {
                        if line.starts_with("Name=") {
                            let name = line.trim_start_matches("Name=");
                            if !name.is_empty() {
                                profiles.push(BrowserProfile {
                                    folder_name: name.to_string(),
                                    display_name: name.to_string(),
                                });
                            }
                        }
                    }
                }
                return Ok(profiles);
            }
            _ => return Ok(profiles),
        };
        
        if let Ok(entries) = std::fs::read_dir(&profile_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    let prefs_path = path.join("Preferences");
                    if prefs_path.exists() {
                        let display_name = get_chromium_profile_name(&prefs_path)
                            .unwrap_or_else(|| folder_name.clone());
                        profiles.push(BrowserProfile {
                            folder_name,
                            display_name,
                        });
                    }
                }
            }
        }
        
        profiles.sort_by(|a, b| {
            if a.folder_name == "Default" {
                std::cmp::Ordering::Less
            } else if b.folder_name == "Default" {
                std::cmp::Ordering::Greater
            } else {
                a.folder_name.cmp(&b.folder_name)
            }
        });
    }
    
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        
        let profile_dir = match browser.as_str() {
            "chrome" => format!("{}/.config/google-chrome", home),
            "brave" => format!("{}/.config/BraveSoftware/Brave-Browser", home),
            "vivaldi" => format!("{}/.config/vivaldi", home),
            "opera" => format!("{}/.config/opera", home),
            "firefox" => {
                let profiles_ini = format!("{}/.mozilla/firefox/profiles.ini", home);
                if let Ok(content) = std::fs::read_to_string(&profiles_ini) {
                    for line in content.lines() {
                        if line.starts_with("Name=") {
                            let name = line.trim_start_matches("Name=");
                            if !name.is_empty() {
                                profiles.push(BrowserProfile {
                                    folder_name: name.to_string(),
                                    display_name: name.to_string(),
                                });
                            }
                        }
                    }
                }
                return Ok(profiles);
            }
            _ => return Ok(profiles),
        };
        
        if let Ok(entries) = std::fs::read_dir(&profile_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    let prefs_path = path.join("Preferences");
                    if prefs_path.exists() {
                        let display_name = get_chromium_profile_name(&prefs_path)
                            .unwrap_or_else(|| folder_name.clone());
                        profiles.push(BrowserProfile {
                            folder_name,
                            display_name,
                        });
                    }
                }
            }
        }
        
        profiles.sort_by(|a, b| {
            if a.folder_name == "Default" {
                std::cmp::Ordering::Less
            } else if b.folder_name == "Default" {
                std::cmp::Ordering::Greater
            } else {
                a.folder_name.cmp(&b.folder_name)
            }
        });
    }
    
    Ok(profiles)
}
