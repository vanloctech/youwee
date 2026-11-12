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
        return "gallery-dl not found. Install it from Settings → Dependencies (or the Gallery page), then retry.".to_string();
    }
    #[cfg(target_os = "linux")]
    {
        return "gallery-dl not found. Install it from Settings → Dependencies (or with your package manager / pip on non-x86_64 systems), then retry.".to_string();
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
    app_gallerydl_install_path(app).filter(|path| path.exists())
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
            can_install: gallerydl_release_asset_name().is_some(),
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
        can_install: gallerydl_release_asset_name().is_some(),
    })
}

/// Codeberg API for gallery-dl's latest official release. The project moved from GitHub to
/// Codeberg; GitHub releases after 1.31 no longer carry the standalone binaries.
const GALLERYDL_LATEST_RELEASE_API: &str =
    "https://codeberg.org/api/v1/repos/mikf/gallery-dl/releases/latest";

/// Name of the official standalone gallery-dl binary for this platform, if one exists.
/// Upstream only publishes standalone builds for Windows and x86_64 Linux; macOS users
/// install it with Homebrew instead.
pub fn gallerydl_release_asset_name() -> Option<&'static str> {
    gallerydl_release_asset_name_for(std::env::consts::OS, std::env::consts::ARCH)
}

pub(crate) fn gallerydl_release_asset_name_for(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        // The x64 build also runs on Windows on ARM through emulation.
        ("windows", "x86_64") | ("windows", "aarch64") => Some("gallery-dl.exe"),
        ("windows", "x86") => Some("gallery-dl_x86.exe"),
        ("linux", "x86_64") => Some("gallery-dl.bin"),
        _ => None,
    }
}

/// Where Youwee stores its own gallery-dl binary.
pub fn app_gallerydl_install_path(app: &AppHandle) -> Option<PathBuf> {
    let app_data_dir = app.path().app_data_dir().ok()?;
    #[cfg(windows)]
    let binary_name = "gallery-dl.exe";
    #[cfg(not(windows))]
    let binary_name = "gallery-dl";
    Some(app_data_dir.join("bin").join(binary_name))
}

pub fn gallerydl_install_unsupported_message() -> String {
    if cfg!(target_os = "macos") {
        "gallery-dl has no official standalone build for macOS. Install it with Homebrew (`brew install gallery-dl`), then refresh.".to_string()
    } else {
        "gallery-dl has no official standalone build for this platform. Install it with your package manager or pip (`pip install gallery-dl`), then refresh.".to_string()
    }
}

/// Find the SHA-256 for `filename` in a `SHA256SUMS` file (`<hash>  <name>` per line).
pub(crate) fn find_sha256_for(sums: &str, filename: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        (name == filename && hash.len() == 64).then(|| hash.to_ascii_lowercase())
    })
}

/// `gallery-dl --version` prints e.g. `1.32.19`; release tags look like `v1.32.19`.
pub(crate) fn normalize_gallerydl_version(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

pub struct GalleryDlRelease {
    pub version: String,
    pub html_url: Option<String>,
    pub asset_url: Option<String>,
    pub sums_url: Option<String>,
}

pub fn gallerydl_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Youwee")
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

pub async fn fetch_latest_gallerydl_release(
    client: &reqwest::Client,
) -> Result<GalleryDlRelease, String> {
    let response = client
        .get(GALLERYDL_LATEST_RELEASE_API)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch gallery-dl release info: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch gallery-dl release info: HTTP {}",
            response.status()
        ));
    }
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse gallery-dl release info: {}", e))?;

    let tag = json["tag_name"]
        .as_str()
        .ok_or("No tag_name in gallery-dl release")?;
    let asset_url = |name: &str| {
        json["assets"].as_array().and_then(|assets| {
            assets.iter().find_map(|asset| {
                (asset["name"].as_str() == Some(name))
                    .then(|| asset["browser_download_url"].as_str().map(str::to_string))
                    .flatten()
            })
        })
    };

    Ok(GalleryDlRelease {
        version: normalize_gallerydl_version(tag),
        html_url: json["html_url"].as_str().map(str::to_string),
        asset_url: gallerydl_release_asset_name().and_then(asset_url),
        sums_url: asset_url("SHA256SUMS"),
    })
}

/// gallery-dl update info (only meaningful for the app-managed binary)
#[derive(Debug, Clone, serde::Serialize)]
pub struct GalleryDlUpdateInfo {
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub release_url: Option<String>,
}

pub async fn check_gallerydl_update_internal(
    app: &AppHandle,
) -> Result<GalleryDlUpdateInfo, String> {
    let status = check_gallerydl_internal(app).await?;
    let current_version = status.version.clone();
    if !status.installed || status.is_system {
        return Ok(GalleryDlUpdateInfo {
            has_update: false,
            current_version,
            latest_version: None,
            release_url: None,
        });
    }

    let release = fetch_latest_gallerydl_release(&gallerydl_http_client(30)?).await?;
    let has_update = current_version
        .as_deref()
        .map(|current| normalize_gallerydl_version(current) != release.version)
        .unwrap_or(false);

    Ok(GalleryDlUpdateInfo {
        has_update,
        current_version,
        latest_version: Some(release.version),
        release_url: release.html_url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_asset_matches_upstream_standalone_builds() {
        assert_eq!(
            gallerydl_release_asset_name_for("windows", "x86_64"),
            Some("gallery-dl.exe")
        );
        assert_eq!(
            gallerydl_release_asset_name_for("windows", "x86"),
            Some("gallery-dl_x86.exe")
        );
        assert_eq!(
            gallerydl_release_asset_name_for("linux", "x86_64"),
            Some("gallery-dl.bin")
        );
        assert_eq!(gallerydl_release_asset_name_for("linux", "aarch64"), None);
        assert_eq!(gallerydl_release_asset_name_for("macos", "aarch64"), None);
        assert_eq!(gallerydl_release_asset_name_for("macos", "x86_64"), None);
    }

    #[test]
    fn finds_checksum_for_exact_file_name() {
        let sums = "\
f6b1eb5e9a7409a988b754335d99dbb1873e130d133ed5d164d32e5e645d1c50  gallery_dl-1.32.19-py3-none-any.whl
9662483cafa72f51ce4b2153aebd620256a9ab536218674b8794f7b3ece11c29  gallery-dl.bin
4dda3f14efbc8a8e616af1fc7e1e88d795995326b47692453e620117254dec18  gallery-dl.exe
f05e96e1783f15f8574fcf14d788142f69766ff65873c5443529d1063907c51b  gallery-dl_x86.exe
";
        assert_eq!(
            find_sha256_for(sums, "gallery-dl.exe").as_deref(),
            Some("4dda3f14efbc8a8e616af1fc7e1e88d795995326b47692453e620117254dec18")
        );
        assert_eq!(
            find_sha256_for(sums, "gallery-dl_x86.exe").as_deref(),
            Some("f05e96e1783f15f8574fcf14d788142f69766ff65873c5443529d1063907c51b")
        );
        assert_eq!(find_sha256_for(sums, "gallery-dl"), None);
    }

    #[test]
    fn normalizes_versions_for_comparison() {
        assert_eq!(normalize_gallerydl_version("v1.32.19"), "1.32.19");
        assert_eq!(normalize_gallerydl_version("1.32.19\n"), "1.32.19");
    }
}
