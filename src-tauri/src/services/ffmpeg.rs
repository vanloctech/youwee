use std::process::Stdio;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use crate::types::FfmpegStatus;
use crate::utils::CommandExt;

/// Get the FFmpeg binary path (app data or system)
pub async fn get_ffmpeg_path(app: &AppHandle) -> Option<PathBuf> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let ffmpeg_path = bin_dir.join("ffmpeg.exe");
        #[cfg(not(windows))]
        let ffmpeg_path = bin_dir.join("ffmpeg");
        
        if ffmpeg_path.exists() {
            return Some(ffmpeg_path);
        }
    }
    
    // Fallback: check if system ffmpeg is available
    #[cfg(unix)]
    {
        let mut cmd = Command::new("which");
        cmd.arg("ffmpeg");
        cmd.hide_window();
        let output = cmd.output().await.ok()?;
        
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Some(PathBuf::from(path_str));
            }
        }
    }
    
    #[cfg(windows)]
    {
        let mut cmd = Command::new("where");
        cmd.arg("ffmpeg");
        cmd.hide_window();
        let output = cmd.output().await.ok()?;
        
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).lines().next()?.to_string();
            if !path_str.is_empty() {
                return Some(PathBuf::from(path_str));
            }
        }
    }
    
    None
}

/// Check FFmpeg status
pub async fn check_ffmpeg_internal(app: &AppHandle) -> Result<FfmpegStatus, String> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let ffmpeg_path = bin_dir.join("ffmpeg.exe");
        #[cfg(not(windows))]
        let ffmpeg_path = bin_dir.join("ffmpeg");
        
        if ffmpeg_path.exists() {
            let mut cmd = Command::new(&ffmpeg_path);
            cmd.args(["-version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();
            let output = cmd.output().await;
            
            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let version = parse_ffmpeg_version(&stdout);
                return Ok(FfmpegStatus {
                    installed: true,
                    version: Some(version),
                    binary_path: Some(ffmpeg_path.to_string_lossy().to_string()),
                    is_system: false,
                });
            }
        }
    }
    
    // Check system FFmpeg
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();
    let output = cmd.output().await;
    
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let version = parse_ffmpeg_version(&stdout);
            
            #[cfg(unix)]
            let path = {
                let mut cmd = Command::new("which");
                cmd.arg("ffmpeg");
                cmd.hide_window();
                cmd.output().await.ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            };
            
            #[cfg(windows)]
            let path = {
                let mut cmd = Command::new("where");
                cmd.arg("ffmpeg");
                cmd.hide_window();
                cmd.output().await.ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string())
            };
            
            #[cfg(not(any(unix, windows)))]
            let path: Option<String> = None;
            
            Ok(FfmpegStatus {
                installed: true,
                version: Some(version),
                binary_path: path,
                is_system: true,
            })
        }
        _ => Ok(FfmpegStatus {
            installed: false,
            version: None,
            binary_path: None,
            is_system: false,
        }),
    }
}

/// Parse FFmpeg version from output
pub fn parse_ffmpeg_version(output: &str) -> String {
    if let Some(line) = output.lines().next() {
        if let Some(version_part) = line.strip_prefix("ffmpeg version ") {
            return version_part.split_whitespace().next().unwrap_or("unknown").to_string();
        }
    }
    "unknown".to_string()
}

/// Extract date string (YYYY-MM-DD) from version string
/// Examples:
/// - "git-2026-01-25-1e1dde8" -> "2026-01-25"
/// - "2026-01-25" -> "2026-01-25"
fn extract_date_from_version(version: &str) -> Option<String> {
    // Look for YYYY-MM-DD pattern
    let re = regex::Regex::new(r"(\d{4})-(\d{2})-(\d{2})").ok()?;
    if let Some(caps) = re.captures(version) {
        Some(format!("{}-{}-{}", &caps[1], &caps[2], &caps[3]))
    } else {
        None
    }
}

/// FFmpeg download info with checksum support
pub struct FfmpegDownloadInfo {
    pub url: &'static str,
    pub archive_type: &'static str,
    pub checksum_url: &'static str,
    pub checksum_filename: &'static str,
}

/// Get FFmpeg download URL for current platform
/// All platforms now support SHA256 checksum verification
pub fn get_ffmpeg_download_info() -> FfmpegDownloadInfo {
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz",
                archive_type: "tar.gz",
                checksum_url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz.sha256",
                checksum_filename: "ffmpeg-macos-arm64.tar.gz",
            }
        }
        #[cfg(target_arch = "x86_64")]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-x64.tar.gz",
                archive_type: "tar.gz",
                checksum_url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-x64.tar.gz.sha256",
                checksum_filename: "ffmpeg-macos-x64.tar.gz",
            }
        }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz",
                archive_type: "tar.gz",
                checksum_url: "https://github.com/vanloctech/ffmpeg-macos/releases/latest/download/ffmpeg-macos-arm64.tar.gz.sha256",
                checksum_filename: "ffmpeg-macos-arm64.tar.gz",
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        FfmpegDownloadInfo {
            url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip",
            archive_type: "zip",
            checksum_url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256",
            checksum_filename: "ffmpeg-master-latest-win64-gpl.zip",
        }
    }
    #[cfg(target_os = "linux")]
    {
        #[cfg(target_arch = "aarch64")]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
                archive_type: "tar.xz",
                checksum_url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256",
                checksum_filename: "ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
            }
        }
        #[cfg(not(target_arch = "aarch64"))]
        {
            FfmpegDownloadInfo {
                url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz",
                archive_type: "tar.xz",
                checksum_url: "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256",
                checksum_filename: "ffmpeg-master-latest-linux64-gpl.tar.xz",
            }
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        FfmpegDownloadInfo {
            url: "",
            archive_type: "",
            checksum_url: "",
            checksum_filename: "",
        }
    }
}

/// FFmpeg update info
#[derive(Debug, Clone, serde::Serialize)]
pub struct FfmpegUpdateInfo {
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub release_url: Option<String>,
}

/// Get the GitHub API URL for checking latest release
fn get_ffmpeg_release_api_url() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "https://api.github.com/repos/vanloctech/ffmpeg-macos/releases/latest"
    }
    #[cfg(target_os = "windows")]
    {
        "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest"
    }
    #[cfg(target_os = "linux")]
    {
        "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        ""
    }
}

/// Check if FFmpeg update is available
pub async fn check_ffmpeg_update_internal(app: &AppHandle) -> Result<FfmpegUpdateInfo, String> {
    // Get current installed version
    let current_status = check_ffmpeg_internal(app).await?;
    
    if !current_status.installed {
        return Ok(FfmpegUpdateInfo {
            has_update: false,
            current_version: None,
            latest_version: None,
            release_url: None,
        });
    }
    
    let current_version = current_status.version.clone();
    
    // Only check updates for bundled FFmpeg (not system)
    if current_status.is_system {
        return Ok(FfmpegUpdateInfo {
            has_update: false,
            current_version,
            latest_version: None,
            release_url: Some("System FFmpeg - update via package manager".to_string()),
        });
    }
    
    let api_url = get_ffmpeg_release_api_url();
    if api_url.is_empty() {
        return Err("Unsupported platform".to_string());
    }
    
    // Fetch latest release from GitHub API
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.4.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client.get(api_url).send().await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to fetch release info: HTTP {}", response.status()));
    }
    
    let json: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;
    
    let tag_name = json["tag_name"].as_str()
        .ok_or("No tag_name in release")?;
    
    let html_url = json["html_url"].as_str()
        .map(|s| s.to_string());
    
    // Extract version from tag (remove 'v' or 'ffmpeg-' prefix if present)
    let latest_version = tag_name
        .trim_start_matches('v')
        .trim_start_matches("ffmpeg-")
        .to_string();
    
    // Compare versions by extracting date parts
    // Current version format: "git-2026-01-25-1e1dde8" -> extract "2026-01-25"
    // Latest version format: "2026.01.25" or "ffmpeg-2026.01.25" -> extract "2026.01.25"
    let has_update = if let Some(ref current) = current_version {
        // Extract date from current version (format: git-YYYY-MM-DD-hash)
        let current_date = extract_date_from_version(current);
        // Normalize latest version (replace . with -)
        let latest_normalized = latest_version.replace('.', "-");
        let latest_date = extract_date_from_version(&latest_normalized);
        
        // Compare dates - if latest is newer, there's an update
        match (current_date, latest_date) {
            (Some(curr), Some(lat)) => lat > curr,
            _ => false, // Can't compare, assume no update
        }
    } else {
        false
    };
    
    Ok(FfmpegUpdateInfo {
        has_update,
        current_version,
        latest_version: Some(latest_version),
        release_url: html_url,
    })
}
