use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Stdio;

use tauri::AppHandle;
use tokio::process::Command;

use crate::types::{BackendError, GalleryDlStatus};
use crate::utils::CommandExt;

pub fn system_gallerydl_not_found_message() -> String {
    #[cfg(target_os = "macos")]
    {
        return "System gallery-dl not found. Install it with Homebrew (`brew install gallery-dl`) and ensure `gallery-dl` is available in PATH.".to_string();
    }
    #[cfg(target_os = "windows")]
    {
        return "System gallery-dl not found. Install it with a package manager (e.g. `choco install gallery-dl` or `scoop install gallery-dl`) and ensure `gallery-dl` is available in PATH.".to_string();
    }
    #[cfg(target_os = "linux")]
    {
        return "System gallery-dl not found. Install it with your distro package manager and ensure `gallery-dl` is available in PATH.".to_string();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "System gallery-dl not found. Install it and ensure `gallery-dl` is available in PATH."
            .to_string()
    }
}

fn get_system_binary_candidates(binary_name: &str) -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin").join(binary_name),
        PathBuf::from("/usr/local/bin").join(binary_name),
        PathBuf::from("/usr/bin").join(binary_name),
    ];

    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            candidates.push(dir.join(binary_name));
        }
    }

    let mut unique = Vec::new();
    let mut seen = HashSet::new();
    for path in candidates {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            unique.push(path);
        }
    }
    unique
}

pub fn get_system_gallerydl_path() -> Option<PathBuf> {
    #[cfg(windows)]
    let binary_name = "gallery-dl.exe";
    #[cfg(not(windows))]
    let binary_name = "gallery-dl";

    get_system_binary_candidates(binary_name)
        .into_iter()
        .find(|p| p.exists())
}

pub async fn check_gallerydl_internal(_app: &AppHandle) -> Result<GalleryDlStatus, String> {
    let Some(binary_path) = get_system_gallerydl_path() else {
        return Ok(GalleryDlStatus {
            installed: false,
            version: None,
            binary_path: None,
            is_system: true,
        });
    };

    let mut cmd = Command::new(&binary_path);
    cmd.arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();

    let output = cmd.output().await.map_err(|e| {
        BackendError::from_message(format!("Failed to run gallery-dl: {}", e)).to_wire_string()
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(BackendError::from_message(format!(
            "gallery-dl command failed: {}",
            stderr.trim()
        ))
        .to_wire_string());
    }

    Ok(GalleryDlStatus {
        installed: true,
        version: Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
        binary_path: Some(binary_path.to_string_lossy().to_string()),
        is_system: true,
    })
}
