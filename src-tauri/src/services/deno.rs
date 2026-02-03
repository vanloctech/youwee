use std::process::Stdio;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use crate::types::DenoStatus;

/// Get the Deno binary path (app data or system)
pub async fn get_deno_path(app: &AppHandle) -> Option<PathBuf> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let deno_path = bin_dir.join("deno.exe");
        #[cfg(not(windows))]
        let deno_path = bin_dir.join("deno");
        
        if deno_path.exists() {
            return Some(deno_path);
        }
    }
    
    // Fallback: check if system deno is available
    #[cfg(unix)]
    {
        // Check common deno locations
        let home = std::env::var("HOME").unwrap_or_default();
        let deno_home = PathBuf::from(&home).join(".deno/bin/deno");
        if deno_home.exists() {
            return Some(deno_home);
        }
        
        let output = Command::new("which")
            .arg("deno")
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
            .arg("deno")
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

/// Check Deno runtime status
pub async fn check_deno_internal(app: &AppHandle) -> Result<DenoStatus, String> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let deno_path = bin_dir.join("deno.exe");
        #[cfg(not(windows))]
        let deno_path = bin_dir.join("deno");
        
        if deno_path.exists() {
            let output = Command::new(&deno_path)
                .args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await;
            
            if let Ok(output) = output {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    // Deno outputs: "deno 2.1.2 (stable, release, aarch64-apple-darwin)"
                    let version = stdout.lines().next()
                        .map(|l| l.trim_start_matches("deno ").split_whitespace().next().unwrap_or("").to_string())
                        .unwrap_or_default();
                    return Ok(DenoStatus {
                        installed: true,
                        version: Some(version),
                        binary_path: Some(deno_path.to_string_lossy().to_string()),
                        is_system: false,
                    });
                }
            }
        }
    }
    
    // Check system Deno (including ~/.deno/bin/deno)
    let home = std::env::var("HOME").unwrap_or_default();
    let deno_home = PathBuf::from(&home).join(".deno/bin/deno");
    
    let (deno_cmd, is_home_deno) = if deno_home.exists() {
        (deno_home.to_string_lossy().to_string(), true)
    } else {
        ("deno".to_string(), false)
    };
    
    let output = Command::new(&deno_cmd)
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let version = stdout.lines().next()
                .map(|l| l.trim_start_matches("deno ").split_whitespace().next().unwrap_or("").to_string())
                .unwrap_or_default();
            
            let path = if is_home_deno {
                Some(deno_home.to_string_lossy().to_string())
            } else {
                #[cfg(unix)]
                {
                    Command::new("which")
                        .arg("deno")
                        .output()
                        .await
                        .ok()
                        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                }
                #[cfg(windows)]
                {
                    Command::new("where")
                        .arg("deno")
                        .output()
                        .await
                        .ok()
                        .map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").to_string())
                }
                #[cfg(not(any(unix, windows)))]
                { None }
            };
            
            Ok(DenoStatus {
                installed: true,
                version: Some(version),
                binary_path: path,
                is_system: true,
            })
        }
        _ => Ok(DenoStatus {
            installed: false,
            version: None,
            binary_path: None,
            is_system: false,
        }),
    }
}

/// Get Deno download URL for current platform
pub fn get_deno_download_url() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "aarch64")]
        { "https://github.com/denoland/deno/releases/latest/download/deno-aarch64-apple-darwin.zip" }
        #[cfg(target_arch = "x86_64")]
        { "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-apple-darwin.zip" }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { "https://github.com/denoland/deno/releases/latest/download/deno-aarch64-apple-darwin.zip" }
    }
    #[cfg(target_os = "windows")]
    { "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip" }
    #[cfg(target_os = "linux")]
    {
        #[cfg(target_arch = "aarch64")]
        { "https://github.com/denoland/deno/releases/latest/download/deno-aarch64-unknown-linux-gnu.zip" }
        #[cfg(target_arch = "x86_64")]
        { "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip" }
        #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
        { "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip" }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    { "" }
}

/// Deno update info
#[derive(Debug, Clone, serde::Serialize)]
pub struct DenoUpdateInfo {
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub release_url: Option<String>,
}

/// Check if Deno update is available
pub async fn check_deno_update_internal(app: &AppHandle) -> Result<DenoUpdateInfo, String> {
    // Get current installed version
    let current_status = check_deno_internal(app).await?;
    
    if !current_status.installed {
        return Ok(DenoUpdateInfo {
            has_update: false,
            current_version: None,
            latest_version: None,
            release_url: None,
        });
    }
    
    let current_version = current_status.version.clone();
    
    // Only check updates for bundled Deno (not system)
    if current_status.is_system {
        return Ok(DenoUpdateInfo {
            has_update: false,
            current_version,
            latest_version: None,
            release_url: Some("System Deno - update via deno upgrade".to_string()),
        });
    }
    
    // Fetch latest release from GitHub API
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.5.4")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get("https://api.github.com/repos/denoland/deno/releases/latest")
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
    
    // Extract version from tag (remove 'v' prefix if present)
    let latest_version = tag_name
        .trim_start_matches('v')
        .to_string();
    
    // Compare versions
    let has_update = if let Some(ref current) = current_version {
        latest_version != *current && !current.contains(&latest_version)
    } else {
        false
    };
    
    Ok(DenoUpdateInfo {
        has_update,
        current_version,
        latest_version: Some(latest_version),
        release_url: html_url,
    })
}
