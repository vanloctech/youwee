use std::process::Stdio;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use crate::types::BunStatus;

/// Get the Bun binary path (app data or system)
pub async fn get_bun_path(app: &AppHandle) -> Option<PathBuf> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let bun_path = bin_dir.join("bun.exe");
        #[cfg(not(windows))]
        let bun_path = bin_dir.join("bun");
        
        if bun_path.exists() {
            return Some(bun_path);
        }
    }
    
    // Fallback: check if system bun is available
    #[cfg(unix)]
    {
        let output = Command::new("which")
            .arg("bun")
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
            .arg("bun")
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

/// Check Bun runtime status
pub async fn check_bun_internal(app: &AppHandle) -> Result<BunStatus, String> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let bun_path = bin_dir.join("bun.exe");
        #[cfg(not(windows))]
        let bun_path = bin_dir.join("bun");
        
        if bun_path.exists() {
            let output = Command::new(&bun_path)
                .args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await;
            
            if let Ok(output) = output {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let version = stdout.trim().to_string();
                    return Ok(BunStatus {
                        installed: true,
                        version: Some(version),
                        binary_path: Some(bun_path.to_string_lossy().to_string()),
                        is_system: false,
                    });
                }
            }
        }
    }
    
    // Check system Bun
    let output = Command::new("bun")
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let version = stdout.trim().to_string();
            
            #[cfg(unix)]
            let path = Command::new("which")
                .arg("bun")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
            
            #[cfg(windows)]
            let path = Command::new("where")
                .arg("bun")
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string());
            
            #[cfg(not(any(unix, windows)))]
            let path: Option<String> = None;
            
            Ok(BunStatus {
                installed: true,
                version: Some(version),
                binary_path: path,
                is_system: true,
            })
        }
        _ => Ok(BunStatus {
            installed: false,
            version: None,
            binary_path: None,
            is_system: false,
        }),
    }
}

/// Get Bun download URL for current platform
pub fn get_bun_download_url() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-aarch64.zip" }
        #[cfg(target_arch = "x86_64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-x64.zip" }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-darwin-aarch64.zip" }
    }
    #[cfg(target_os = "windows")]
    { "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip" }
    #[cfg(target_os = "linux")]
    {
        #[cfg(target_arch = "aarch64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-linux-aarch64.zip" }
        #[cfg(target_arch = "x86_64")]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip" }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { "https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip" }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    { "" }
}

/// Bun update info
#[derive(Debug, Clone, serde::Serialize)]
pub struct BunUpdateInfo {
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub release_url: Option<String>,
}

/// Check if Bun update is available
pub async fn check_bun_update_internal(app: &AppHandle) -> Result<BunUpdateInfo, String> {
    // Get current installed version
    let current_status = check_bun_internal(app).await?;
    
    if !current_status.installed {
        return Ok(BunUpdateInfo {
            has_update: false,
            current_version: None,
            latest_version: None,
            release_url: None,
        });
    }
    
    let current_version = current_status.version.clone();
    
    // Only check updates for bundled Bun (not system)
    if current_status.is_system {
        return Ok(BunUpdateInfo {
            has_update: false,
            current_version,
            latest_version: None,
            release_url: Some("System Bun - update via package manager".to_string()),
        });
    }
    
    // Fetch latest release from GitHub API
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.4.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get("https://api.github.com/repos/oven-sh/bun/releases/latest")
        .send()
        .await
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
    
    // Extract version from tag (remove 'bun-v' or 'v' prefix if present)
    let latest_version = tag_name
        .trim_start_matches("bun-v")
        .trim_start_matches('v')
        .to_string();
    
    // Compare versions
    let has_update = if let Some(ref current) = current_version {
        // Bun version is like "1.0.0" - direct comparison
        latest_version != *current && !current.contains(&latest_version)
    } else {
        false
    };
    
    Ok(BunUpdateInfo {
        has_update,
        current_version,
        latest_version: Some(latest_version),
        release_url: html_url,
    })
}
