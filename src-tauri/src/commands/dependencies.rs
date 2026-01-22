use std::process::Stdio;
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use crate::types::{YtdlpVersionInfo, FfmpegStatus, BunStatus};
use crate::services::{
    get_ytdlp_version_internal, get_ytdlp_download_info, verify_sha256,
    check_ffmpeg_internal, get_ffmpeg_download_info, parse_ffmpeg_version,
    get_ffmpeg_path,
    check_bun_internal, get_bun_download_url,
};
use crate::utils::{extract_tar_gz, extract_tar_xz, extract_zip, extract_bun_from_zip};

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
}

#[tauri::command]
pub async fn get_ytdlp_version(app: AppHandle) -> Result<YtdlpVersionInfo, String> {
    get_ytdlp_version_internal(&app).await
}

#[tauri::command]
pub async fn check_ytdlp_update() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.3.2")
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
        .user_agent("Youwee/0.3.2")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // Download checksums
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
    let output = Command::new(&binary_path)
        .args(["--version"])
        .output()
        .await
        .map_err(|e| format!("Failed to verify update: {}", e))?;
    
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn check_ffmpeg(app: AppHandle) -> Result<FfmpegStatus, String> {
    check_ffmpeg_internal(&app).await
}

#[tauri::command]
pub async fn download_ffmpeg(app: AppHandle) -> Result<String, String> {
    let info = get_ffmpeg_download_info();
    
    if info.url.is_empty() {
        return Err("Unsupported platform".to_string());
    }
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    tokio::fs::create_dir_all(&bin_dir).await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.3.2")
        .timeout(std::time::Duration::from_secs(600))
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
    
    // Download FFmpeg archive
    let response = client.get(info.url).send().await
        .map_err(|e| format!("Failed to download FFmpeg: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    // Verify checksum
    if !verify_sha256(&bytes, &expected_hash) {
        return Err("Security error: SHA256 checksum verification failed.".to_string());
    }
    
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
    
    let output = Command::new(&ffmpeg_path)
        .args(["-version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to verify FFmpeg installation: {}", e))?;
    
    Ok(parse_ffmpeg_version(&String::from_utf8_lossy(&output.stdout)))
}

#[tauri::command]
pub async fn get_ffmpeg_path_for_ytdlp(app: AppHandle) -> Result<Option<String>, String> {
    Ok(get_ffmpeg_path(&app).await.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn check_bun(app: AppHandle) -> Result<BunStatus, String> {
    check_bun_internal(&app).await
}

#[tauri::command]
pub async fn download_bun(app: AppHandle) -> Result<String, String> {
    let download_url = get_bun_download_url();
    
    if download_url.is_empty() {
        return Err("Unsupported platform".to_string());
    }
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    tokio::fs::create_dir_all(&bin_dir).await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.3.2")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client.get(download_url).send().await
        .map_err(|e| format!("Failed to download Bun: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    #[cfg(windows)]
    let bun_binary = "bun.exe";
    #[cfg(not(windows))]
    let bun_binary = "bun";
    
    let bun_path = bin_dir.join(bun_binary);
    
    extract_bun_from_zip(&bytes, &bin_dir, bun_binary).await?;
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&bun_path).await
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&bun_path, perms).await
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }
    
    let output = Command::new(&bun_path)
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to verify Bun installation: {}", e))?;
    
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
