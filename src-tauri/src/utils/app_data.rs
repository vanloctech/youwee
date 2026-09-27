use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const DATA_DIR_ENV: &str = "YOUWEE_DATA_DIR";

#[cfg(target_os = "windows")]
const DEFAULT_DATA_ROOT: &str = r"D:\YouweeData";

fn configured_data_root() -> Option<PathBuf> {
    std::env::var_os(DATA_DIR_ENV)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            #[cfg(target_os = "windows")]
            {
                Some(PathBuf::from(DEFAULT_DATA_ROOT))
            }
            #[cfg(not(target_os = "windows"))]
            {
                None
            }
        })
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {error}"))
}

fn copy_file_if_newer(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_file() {
        return Ok(());
    }
    let source_modified = source
        .metadata()
        .and_then(|metadata| metadata.modified())
        .ok();
    let destination_modified = destination
        .metadata()
        .and_then(|metadata| metadata.modified())
        .ok();
    if !destination.exists() || source_modified > destination_modified {
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Cannot create {}: {error}", parent.display()))?;
        }
        std::fs::copy(source, destination).map_err(|error| {
            format!(
                "Cannot migrate {} to {}: {error}",
                source.display(),
                destination.display()
            )
        })?;
    }
    Ok(())
}

fn copy_dir_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(destination)
        .map_err(|error| format!("Cannot create {}: {error}", destination.display()))?;
    for entry in std::fs::read_dir(source)
        .map_err(|error| format!("Cannot read {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let from = entry.path();
        let to = destination.join(entry.file_name());
        if from.is_dir() {
            copy_dir_if_missing(&from, &to)?;
        } else if !to.exists() {
            std::fs::copy(&from, &to).map_err(|error| {
                format!(
                    "Cannot migrate {} to {}: {error}",
                    from.display(),
                    to.display()
                )
            })?;
        }
    }
    Ok(())
}

/// Configure writable runtime locations before Tauri creates WebView2.
///
/// Do not relocate or copy WebView2's profile here. Chromium profiles contain
/// process locks and other machine-local state; synchronously copying that tree
/// during startup can take minutes and a partially copied profile can prevent
/// WebView2 from creating the main window. Tauri's normal per-user WebView2
/// location also preserves the existing localStorage-backed app settings.
pub fn configure_portable_data_environment() -> Result<(), String> {
    let Some(root) = configured_data_root() else {
        return Ok(());
    };
    let temp_data = root.join("Temp");
    std::fs::create_dir_all(&temp_data)
        .map_err(|error| format!("Cannot create {}: {error}", temp_data.display()))?;

    #[cfg(target_os = "windows")]
    {
        if let Some(roaming) = std::env::var_os("APPDATA") {
            let app_data = PathBuf::from(roaming).join("com.vanloctech.youwee");
            let portable_app_data = root.join("AppData");
            copy_dir_if_missing(&portable_app_data, &app_data)?;
            copy_file_if_newer(
                &portable_app_data.join("youwee.db"),
                &app_data.join("youwee.db"),
            )?;
        }
        std::env::set_var("TEMP", &temp_data);
        std::env::set_var("TMP", &temp_data);
    }
    Ok(())
}
