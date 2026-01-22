use std::process::Stdio;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::process::Command;
use crate::types::YtdlpVersionInfo;

/// Result of yt-dlp command with both stdout and stderr
pub struct YtdlpOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// Helper to run yt-dlp command and get output with stderr
pub async fn run_ytdlp_with_stderr(app: &AppHandle, args: &[&str]) -> Result<YtdlpOutput, String> {
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
            let output = Command::new("yt-dlp")
                .args(args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
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
    if stderr_lower.contains("video unavailable") || stderr_lower.contains("private video") {
        return Some("This video is unavailable or private.".to_string());
    }
    
    // Age restricted
    if stderr_lower.contains("age-restricted") || stderr_lower.contains("sign in to confirm your age") {
        return Some("This video is age-restricted and requires sign-in.".to_string());
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

/// Get yt-dlp version
pub async fn get_ytdlp_version_internal(app: &AppHandle) -> Result<YtdlpVersionInfo, String> {
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
            let output = Command::new("yt-dlp")
                .args(["--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(|e| format!("yt-dlp not found: {}", e))?;
            
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
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

/// Get the appropriate download URL and binary name for current platform
/// Note: yt-dlp_macos is a Universal Binary that works on both Intel and Apple Silicon
/// The legacy build (yt-dlp_macos_legacy) was discontinued in August 2025
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
