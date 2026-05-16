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
        "System gallery-dl not found. Install it and ensure `gallery-dl` is available in PATH.".to_string()
    }
}

/// Resolve system binary candidates in correct precedence order:
/// 1. PATH entries (honors the user's environment: Nix, Homebrew, pipx, distro, etc.)
/// 2. Well-known fallback paths (for GUI apps that may not inherit shell PATH)
fn get_system_binary_candidates(binary_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    let mut push_unique = |path: PathBuf| {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            candidates.push(path);
        }
    };

    // PATH first — this is the OS-level contract for binary resolution.
    // Nix, Homebrew, pipx, distro packages, and user installs all express
    // their binaries through PATH.
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            push_unique(dir.join(binary_name));
        }
    }

    // Well-known fallback locations for environments where PATH may not
    // include these (e.g., macOS GUI apps launched from Finder/Dock or
    // Linux desktop files that don't inherit the user's shell PATH).
    if let Ok(home) = std::env::var("HOME") {
        // ~/.local/bin — standard XDG location for pipx, pip --user, etc.
        push_unique(PathBuf::from(&home).join(".local/bin").join(binary_name));
    }
    push_unique(PathBuf::from("/opt/homebrew/bin").join(binary_name));
    push_unique(PathBuf::from("/usr/local/bin").join(binary_name));
    push_unique(PathBuf::from("/usr/bin").join(binary_name));

    candidates
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
        return Err(
            BackendError::from_message(format!("gallery-dl command failed: {}", stderr.trim()))
                .to_wire_string(),
        );
    }

    Ok(GalleryDlStatus {
        installed: true,
        version: Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
        binary_path: Some(binary_path.to_string_lossy().to_string()),
        is_system: true,
    })
}
