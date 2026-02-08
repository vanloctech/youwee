use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::process::Command;
use crate::types::{YtdlpVersionInfo, YtdlpChannel, YtdlpChannelInfo, YtdlpAllVersions};
use crate::utils::CommandExt;

const CHANNEL_CONFIG_FILE: &str = "ytdlp-channel.txt";

/// Get the config file path for storing channel selection
fn get_channel_config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join("bin").join(CHANNEL_CONFIG_FILE))
}

/// Read the current yt-dlp channel from config file
pub async fn get_ytdlp_channel(app: &AppHandle) -> YtdlpChannel {
    if let Some(config_path) = get_channel_config_path(app) {
        if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
            return YtdlpChannel::from_str(content.trim());
        }
    }
    YtdlpChannel::Bundled
}

/// Save the yt-dlp channel to config file
pub async fn set_ytdlp_channel(app: &AppHandle, channel: &YtdlpChannel) -> Result<(), String> {
    let config_path = get_channel_config_path(app)
        .ok_or("Failed to get config path")?;
    
    // Ensure bin directory exists
    if let Some(parent) = config_path.parent() {
        tokio::fs::create_dir_all(parent).await
            .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    }
    
    tokio::fs::write(&config_path, channel.as_str()).await
        .map_err(|e| format!("Failed to save channel config: {}", e))?;
    
    Ok(())
}

/// Get the binary name for a specific channel
fn get_channel_binary_name(channel: &YtdlpChannel) -> &'static str {
    #[cfg(windows)]
    match channel {
        YtdlpChannel::Bundled => "yt-dlp.exe",
        YtdlpChannel::Stable => "yt-dlp-stable.exe",
        YtdlpChannel::Nightly => "yt-dlp-nightly.exe",
    }
    #[cfg(not(windows))]
    match channel {
        YtdlpChannel::Bundled => "yt-dlp",
        YtdlpChannel::Stable => "yt-dlp-stable",
        YtdlpChannel::Nightly => "yt-dlp-nightly",
    }
}

/// Get the path to a specific channel's binary in app_data_dir
fn get_channel_binary_path(app: &AppHandle, channel: &YtdlpChannel) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join("bin").join(get_channel_binary_name(channel)))
}

/// Get the bundled yt-dlp path
fn get_bundled_ytdlp_path() -> Option<PathBuf> {
    #[cfg(windows)]
    let binary_name = "yt-dlp.exe";
    #[cfg(not(windows))]
    let binary_name = "yt-dlp";
    
    // Check next to executable first
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let bundled = exe_dir.join(binary_name);
            if bundled.exists() {
                return Some(bundled);
            }
        }
    }
    None
}

/// Get info for all yt-dlp channels (lightweight - no binary execution)
pub async fn get_all_ytdlp_versions(app: &AppHandle) -> YtdlpAllVersions {
    let current_channel = get_ytdlp_channel(app).await;
    
    // Just check file existence - no --version calls needed
    let bundled_path = get_bundled_ytdlp_path();
    let stable_path = get_channel_binary_path(app, &YtdlpChannel::Stable);
    let nightly_path = get_channel_binary_path(app, &YtdlpChannel::Nightly);
    
    let bundled_exists = bundled_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let stable_exists = stable_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    let nightly_exists = nightly_path.as_ref().map(|p| p.exists()).unwrap_or(false);
    
    let bundled = YtdlpChannelInfo {
        channel: "bundled".to_string(),
        version: None,
        installed: bundled_exists,
        binary_path: bundled_path.map(|p| p.to_string_lossy().to_string()),
    };
    
    let stable = YtdlpChannelInfo {
        channel: "stable".to_string(),
        version: None,
        installed: stable_exists,
        binary_path: stable_path.map(|p| p.to_string_lossy().to_string()),
    };
    
    let nightly = YtdlpChannelInfo {
        channel: "nightly".to_string(),
        version: None,
        installed: nightly_exists,
        binary_path: nightly_path.map(|p| p.to_string_lossy().to_string()),
    };
    
    // Check if using fallback (channel is stable/nightly but binary not installed)
    let using_fallback = match current_channel {
        YtdlpChannel::Bundled => false,
        YtdlpChannel::Stable => !stable_exists,
        YtdlpChannel::Nightly => !nightly_exists,
    };
    
    YtdlpAllVersions {
        current_channel: current_channel.as_str().to_string(),
        using_fallback,
        bundled,
        stable,
        nightly,
    }
}

/// Get download URL for a specific channel
pub fn get_ytdlp_channel_download_url(channel: &YtdlpChannel) -> Option<(&'static str, &'static str)> {
    match channel {
        YtdlpChannel::Bundled => None, // Bundled doesn't need download
        YtdlpChannel::Stable => {
            #[cfg(target_os = "macos")]
            { Some(("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos", "yt-dlp_macos")) }
            #[cfg(target_os = "linux")]
            { Some(("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux", "yt-dlp_linux")) }
            #[cfg(target_os = "windows")]
            { Some(("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", "yt-dlp.exe")) }
            #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
            { None }
        }
        YtdlpChannel::Nightly => {
            #[cfg(target_os = "macos")]
            { Some(("https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_macos", "yt-dlp_macos")) }
            #[cfg(target_os = "linux")]
            { Some(("https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp_linux", "yt-dlp_linux")) }
            #[cfg(target_os = "windows")]
            { Some(("https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe", "yt-dlp.exe")) }
            #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
            { None }
        }
    }
}

/// Get GitHub API URL for checking latest version of a channel
pub fn get_channel_api_url(channel: &YtdlpChannel) -> Option<&'static str> {
    match channel {
        YtdlpChannel::Bundled => None,
        YtdlpChannel::Stable => Some("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"),
        YtdlpChannel::Nightly => Some("https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest"),
    }
}

/// Get the path to yt-dlp binary based on current channel setting
/// Returns: (path, is_bundled)
pub async fn get_ytdlp_path(app: &AppHandle) -> Option<(PathBuf, bool)> {
    let channel = get_ytdlp_channel(app).await;
    
    match channel {
        YtdlpChannel::Bundled => {
            // Use bundled version
            if let Some(bundled) = get_bundled_ytdlp_path() {
                return Some((bundled, true));
            }
        }
        YtdlpChannel::Stable | YtdlpChannel::Nightly => {
            // Check channel-specific binary first
            if let Some(channel_path) = get_channel_binary_path(app, &channel) {
                if channel_path.exists() {
                    return Some((channel_path, false));
                }
            }
            // Fallback to bundled if channel binary not found
            if let Some(bundled) = get_bundled_ytdlp_path() {
                return Some((bundled, true));
            }
        }
    }
    
    // Final fallback: check app_data_dir/bin/yt-dlp (legacy location)
    #[cfg(windows)]
    let binary_name = "yt-dlp.exe";
    #[cfg(not(windows))]
    let binary_name = "yt-dlp";
    
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let legacy_binary = app_data_dir.join("bin").join(binary_name);
        if legacy_binary.exists() {
            return Some((legacy_binary, false));
        }
    }
    
    None
}

/// Result of yt-dlp command with both stdout and stderr
pub struct YtdlpOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// Helper to run yt-dlp command and get output with stderr
pub async fn run_ytdlp_with_stderr(app: &AppHandle, args: &[&str]) -> Result<YtdlpOutput, String> {
    // Try to get yt-dlp path (prioritizes user-updated version)
    if let Some((binary_path, _)) = get_ytdlp_path(app).await {
        let mut cmd = Command::new(&binary_path);
        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();
        
        let output = cmd.output().await
            .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
        
        return Ok(YtdlpOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            success: output.status.success(),
        });
    }
    
    // Fallback to sidecar
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(args)
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
            
            let mut stdout = String::new();
            let mut stderr = String::new();
            let mut success = true;
            
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        stdout.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Stderr(bytes) => {
                        stderr.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Error(err) => {
                        return Err(format!("Process error: {}", err));
                    }
                    CommandEvent::Terminated(status) => {
                        success = status.code == Some(0);
                    }
                    _ => {}
                }
            }
            
            Ok(YtdlpOutput { stdout, stderr, success })
        }
        Err(_) => {
            // Fallback to system yt-dlp
            let mut cmd = Command::new("yt-dlp");
            cmd.args(args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();
            
            let output = cmd.output().await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
            
            Ok(YtdlpOutput {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                success: output.status.success(),
            })
        }
    }
}

/// Parse yt-dlp stderr for common errors and return user-friendly message
pub fn parse_ytdlp_error(stderr: &str) -> Option<String> {
    let stderr_lower = stderr.to_lowercase();
    
    // Rate limiting
    if stderr_lower.contains("429") || stderr_lower.contains("too many requests") {
        return Some("YouTube rate limited. Please wait a few minutes before trying again.".to_string());
    }
    
    // Video unavailable
    if stderr_lower.contains("video unavailable") {
        return Some("This video is unavailable.".to_string());
    }
    
    // Private video - needs authentication
    if stderr_lower.contains("private video") {
        return Some("This video is private. Please enable authentication in Settings → Video Authentication to access it.".to_string());
    }
    
    // Age restricted
    if stderr_lower.contains("age-restricted") || stderr_lower.contains("sign in to confirm your age") {
        return Some("This video is age-restricted. Please enable authentication in Settings → Video Authentication to access it.".to_string());
    }
    
    // Members-only / subscription required
    if stderr_lower.contains("members-only") || stderr_lower.contains("member-only") || stderr_lower.contains("join this channel") {
        return Some("This video is for channel members only. Please enable authentication in Settings → Video Authentication with a subscribed account.".to_string());
    }
    
    // Login required (generic)
    if stderr_lower.contains("sign in") || stderr_lower.contains("login required") || stderr_lower.contains("cookies") && stderr_lower.contains("required") {
        return Some("This video requires sign-in. Please enable authentication in Settings → Video Authentication to access it.".to_string());
    }
    
    // Geographic restriction
    if stderr_lower.contains("not available in your country") || stderr_lower.contains("geo") {
        return Some("This video is not available in your region.".to_string());
    }
    
    // No subtitles
    if stderr_lower.contains("no subtitles") || stderr_lower.contains("subtitles are disabled") {
        return Some("This video has no subtitles available.".to_string());
    }
    
    // Network errors
    if stderr_lower.contains("unable to download") || stderr_lower.contains("connection") {
        if let Some(line) = stderr.lines().find(|l| l.to_lowercase().contains("error")) {
            return Some(format!("Download error: {}", line.trim()));
        }
    }
    
    None
}

/// Helper to run yt-dlp command and get JSON output
pub async fn run_ytdlp_json(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    // Try to get yt-dlp path (prioritizes user-updated version)
    if let Some((binary_path, _)) = get_ytdlp_path(app).await {
        let mut cmd = Command::new(&binary_path);
        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();
        
        let output = cmd.output().await
            .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if let Some(parsed_error) = parse_ytdlp_error(&stderr) {
                return Err(parsed_error);
            }
            return Err("yt-dlp command failed".to_string());
        }
        
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    
    // Fallback to sidecar
    let sidecar_result = app.shell().sidecar("yt-dlp");
    
    match sidecar_result {
        Ok(sidecar) => {
            let (mut rx, _child) = sidecar
                .args(args)
                .spawn()
                .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;
            
            let mut output = String::new();
            let mut stderr_output = String::new();
            
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Stderr(bytes) => {
                        stderr_output.push_str(&String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Error(err) => {
                        return Err(format!("Process error: {}", err));
                    }
                    CommandEvent::Terminated(status) => {
                        if status.code != Some(0) {
                            // Parse stderr for user-friendly error
                            if let Some(parsed_error) = parse_ytdlp_error(&stderr_output) {
                                return Err(parsed_error);
                            }
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
            let mut cmd = Command::new("yt-dlp");
            cmd.args(args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();
            
            let output = cmd.output().await
                .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
            
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // Parse stderr for user-friendly error
                if let Some(parsed_error) = parse_ytdlp_error(&stderr) {
                    return Err(parsed_error);
                }
                return Err("yt-dlp command failed".to_string());
            }
            
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        }
    }
}

/// Get yt-dlp version
pub async fn get_ytdlp_version_internal(app: &AppHandle) -> Result<YtdlpVersionInfo, String> {
    // Try to get yt-dlp path (prioritizes user-updated version)
    if let Some((binary_path, is_bundled)) = get_ytdlp_path(app).await {
        let mut cmd = Command::new(&binary_path);
        cmd.args(["--version"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();
        
        let output = cmd.output().await
            .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
        
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let bin_path = binary_path.to_string_lossy().to_string();
        
        return Ok(YtdlpVersionInfo {
            version,
            latest_version: None,
            update_available: false,
            is_bundled,
            binary_path: bin_path,
        });
    }
    
    // Fallback to sidecar
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
            let resource_dir = app.path().resource_dir().ok();
            let bin_path = resource_dir
                .map(|p| p.join("bin").join("yt-dlp").to_string_lossy().to_string())
                .unwrap_or_else(|| "bundled".to_string());
            
            (version, true, bin_path)
        }
        Err(_) => {
            let mut cmd = Command::new("yt-dlp");
            cmd.args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd.hide_window();
            
            let output = cmd.output().await
                .map_err(|e| format!("yt-dlp not found: {}", e))?;
            
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            
            let mut which_cmd = Command::new("which");
            which_cmd.arg("yt-dlp");
            which_cmd.hide_window();
            let which_output = which_cmd.output().await.ok();
            
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

/// Get the appropriate download URL and binary name for current platform
/// Note: yt-dlp_macos is a Universal Binary that works on both Intel and Apple Silicon
/// Using stable releases for reliability
pub fn get_ytdlp_download_info() -> (&'static str, &'static str, &'static str) {
    #[cfg(target_os = "macos")]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos", "yt-dlp", "yt-dlp_macos") }
    #[cfg(target_os = "linux")]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux", "yt-dlp", "yt-dlp_linux") }
    #[cfg(target_os = "windows")]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", "yt-dlp.exe", "yt-dlp.exe") }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp", "yt-dlp", "yt-dlp") }
}

/// Verify SHA256 checksum
pub fn verify_sha256(data: &[u8], expected_hash: &str) -> bool {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    let computed_hash = hex::encode(result);
    computed_hash.eq_ignore_ascii_case(expected_hash)
}

/// Build cookie args for yt-dlp based on cookie settings
pub fn build_cookie_args(
    cookie_mode: Option<&str>,
    cookie_browser: Option<&str>,
    cookie_browser_profile: Option<&str>,
    cookie_file_path: Option<&str>,
) -> Vec<String> {
    let mut args = Vec::new();
    
    let mode = cookie_mode.unwrap_or("off");
    match mode {
        "browser" => {
            if let Some(browser) = cookie_browser {
                let mut cookie_arg = browser.to_string();
                if let Some(profile) = cookie_browser_profile {
                    if !profile.is_empty() {
                        cookie_arg = format!("{}:{}", browser, profile);
                    }
                }
                args.push("--cookies-from-browser".to_string());
                args.push(cookie_arg);
            }
        }
        "file" => {
            if let Some(file_path) = cookie_file_path {
                if !file_path.is_empty() {
                    args.push("--cookies".to_string());
                    args.push(file_path.to_string());
                }
            }
        }
        _ => {}
    }
    
    args
}

/// Build proxy args for yt-dlp based on proxy URL
/// Supports HTTP and SOCKS5 proxies with optional authentication
/// Format: http://host:port, http://user:pass@host:port, socks5://host:port, socks5://user:pass@host:port
pub fn build_proxy_args(proxy_url: Option<&str>) -> Vec<String> {
    let mut args = Vec::new();
    
    if let Some(url) = proxy_url {
        if !url.is_empty() && url != "off" {
            args.push("--proxy".to_string());
            args.push(url.to_string());
        }
    }
    
    args
}

/// Helper to run yt-dlp command with cookie and proxy support and get JSON output
pub async fn run_ytdlp_json_with_cookies(
    app: &AppHandle,
    base_args: &[&str],
    cookie_mode: Option<&str>,
    cookie_browser: Option<&str>,
    cookie_browser_profile: Option<&str>,
    cookie_file_path: Option<&str>,
    proxy_url: Option<&str>,
) -> Result<String, String> {
    // Build full args with cookies and proxy
    let cookie_args = build_cookie_args(cookie_mode, cookie_browser, cookie_browser_profile, cookie_file_path);
    let proxy_args = build_proxy_args(proxy_url);
    let mut args: Vec<String> = base_args.iter().map(|s| s.to_string()).collect();
    args.extend(cookie_args);
    args.extend(proxy_args);
    
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    
    run_ytdlp_json(app, &args_ref).await
}

/// Helper to run yt-dlp command with cookie and proxy support and get output with stderr
pub async fn run_ytdlp_with_stderr_and_cookies(
    app: &AppHandle,
    base_args: &[&str],
    cookie_mode: Option<&str>,
    cookie_browser: Option<&str>,
    cookie_browser_profile: Option<&str>,
    cookie_file_path: Option<&str>,
    proxy_url: Option<&str>,
) -> Result<YtdlpOutput, String> {
    // Build full args with cookies and proxy
    let cookie_args = build_cookie_args(cookie_mode, cookie_browser, cookie_browser_profile, cookie_file_path);
    let proxy_args = build_proxy_args(proxy_url);
    let mut args: Vec<String> = base_args.iter().map(|s| s.to_string()).collect();
    args.extend(cookie_args);
    args.extend(proxy_args);
    
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    
    run_ytdlp_with_stderr(app, &args_ref).await
}
