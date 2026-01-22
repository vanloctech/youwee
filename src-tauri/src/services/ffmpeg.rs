use std::process::Stdio;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use crate::types::FfmpegStatus;

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
        let output = Command::new("which")
            .arg("ffmpeg")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Some(PathBuf::from(path_str));
            }
        }
    }
    
    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg("ffmpeg")
            .output()
            .await
            .ok()?;
        
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
            let output = Command::new(&ffmpeg_path)
                .args(["-version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await;
            
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
    let output = Command::new("ffmpeg")
        .args(["-version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let version = parse_ffmpeg_version(&stdout);
            
            #[cfg(unix)]
            let path = Command::new("which")
                .arg("ffmpeg")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
            
            #[cfg(windows)]
            let path = Command::new("where")
                .arg("ffmpeg")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string());
            
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
