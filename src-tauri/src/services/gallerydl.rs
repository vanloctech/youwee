use std::path::PathBuf;
use std::process::Stdio;

use tauri::{AppHandle, Manager};
use tokio::process::Command;

use crate::types::{BackendError, GalleryDlStatus};
use crate::utils::{find_system_binary, unix_system_binary_dirs, CommandExt};

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

pub fn get_system_gallerydl_path() -> Option<PathBuf> {
    #[cfg(windows)]
    let binary_name = "gallery-dl.exe";
    #[cfg(not(windows))]
    let binary_name = "gallery-dl";

    find_system_binary(binary_name, &unix_system_binary_dirs())
}

fn get_app_gallerydl_path(app: &AppHandle) -> Option<PathBuf> {
    let app_data_dir = app.path().app_data_dir().ok()?;
    #[cfg(windows)]
    let binary_name = "gallery-dl.exe";
    #[cfg(not(windows))]
    let binary_name = "gallery-dl";

    let binary_path = app_data_dir.join("bin").join(binary_name);
    if binary_path.exists() {
        Some(binary_path)
    } else {
        None
    }
}

pub fn get_gallerydl_path(app: &AppHandle) -> Option<PathBuf> {
    get_system_gallerydl_path().or_else(|| get_app_gallerydl_path(app))
}

pub async fn check_gallerydl_internal(app: &AppHandle) -> Result<GalleryDlStatus, String> {
    let Some(binary_path) = get_gallerydl_path(app) else {
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
        is_system: get_app_gallerydl_path(app)
            .as_ref()
            .map(|app_path| app_path != &binary_path)
            .unwrap_or(true),
    })
}
