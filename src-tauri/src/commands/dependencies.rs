use std::process::Stdio;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use crate::types::{YtdlpVersionInfo, FfmpegStatus, DenoStatus};
use crate::services::{
    get_ytdlp_version_internal, get_ytdlp_download_info, verify_sha256,
    check_ffmpeg_internal, get_ffmpeg_download_info, parse_ffmpeg_version,
    get_ffmpeg_path, check_ffmpeg_update_internal, FfmpegUpdateInfo,
    check_deno_internal, get_deno_download_url, check_deno_update_internal, DenoUpdateInfo,
};
use crate::utils::{extract_tar_gz, extract_tar_xz, extract_zip};

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
pub async fn check_ffmpeg_update(app: AppHandle) -> Result<FfmpegUpdateInfo, String> {
    check_ffmpeg_update_internal(&app).await
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
        .user_agent("Youwee/0.4.0")
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
    
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let bin_dir = app_data_dir.join("bin");
    
    tokio::fs::create_dir_all(&bin_dir).await
        .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    
    let client = reqwest::Client::builder()
        .user_agent("Youwee/0.6.0")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client.get(download_url).send().await
        .map_err(|e| format!("Failed to download Deno: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    #[cfg(windows)]
    let deno_binary = "deno.exe";
    #[cfg(not(windows))]
    let deno_binary = "deno";
    
    let deno_path = bin_dir.join(deno_binary);
    
    // Extract deno from zip (deno zip contains just the binary directly)
    extract_zip(&bytes, &bin_dir, deno_binary).await?;
    
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
    
    let output = Command::new(&deno_path)
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
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
            for cmd in commands {
                let result = Command::new("which")
                    .arg(cmd)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .await;
                
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
