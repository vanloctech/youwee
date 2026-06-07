//! Install a global `youwee` CLI shortcut so users can invoke the app from a
//! terminal anywhere.
//!
//! Behavior per platform:
//! - **macOS**: create a symlink at `/usr/local/bin/youwee` (falls back to
//!   `~/.local/bin/youwee` when `/usr/local/bin` is not writable) pointing at
//!   the binary inside the `.app` bundle.
//! - **Windows**: create a `youwee.cmd` shim in the current user's WindowsApps
//!   command directory when available.
//! - **Linux**: the `.deb` package already installs `/usr/bin/youwee`, so this
//!   reports the existing status; for AppImage it creates a
//!   `~/.local/bin/youwee` symlink.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct CliShortcutStatus {
    /// "macos" | "windows" | "linux" | "unknown"
    pub platform: String,
    /// Whether `youwee` is already reachable as a global command.
    pub installed: bool,
    /// Path where the shortcut is (or would be) installed.
    pub target_path: Option<String>,
    /// Path of the current executable.
    pub exe_path: Option<String>,
    /// Whether the current platform supports automatic install via this command.
    pub can_auto_install: bool,
    /// Legacy/debug fallback note. Prefer note_key + note_path for localized UI.
    pub note: Option<String>,
    /// Machine-readable note for frontend localization.
    pub note_key: Option<String>,
    /// Path used by the localized note, when applicable.
    pub note_path: Option<String>,
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn current_exe() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("Failed to resolve current executable: {}", e))
}

#[cfg(target_os = "linux")]
fn linux_cli_source_exe() -> Result<PathBuf, String> {
    if let Some(appimage) = std::env::var_os("APPIMAGE").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(appimage));
    }
    current_exe()
}

#[cfg(unix)]
fn user_local_bin() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local").join("bin"))
}

fn command_parent_is_in_path(command_path: &Path) -> bool {
    let Some(parent) = command_path.parent() else {
        return false;
    };
    let parent_display = parent.display().to_string();
    let parent_compare = if cfg!(windows) {
        parent_display.to_lowercase()
    } else {
        parent_display
    };
    let separator = if cfg!(windows) { ';' } else { ':' };

    std::env::var("PATH")
        .map(|path| {
            path.split(separator).any(|entry| {
                let trimmed = entry.trim();
                if trimmed.is_empty() {
                    return false;
                }
                if cfg!(windows) {
                    trimmed.to_lowercase() == parent_compare
                } else {
                    trimmed == parent_compare
                }
            })
        })
        .unwrap_or(false)
}

fn command_parent_path(command_path: &Path) -> String {
    command_path
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| command_path.display().to_string())
}

fn path_not_in_path_note(command_path: &Path) -> String {
    let parent = command_path
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| command_path.display().to_string());
    format!(
        "{} exists, but {} is not in PATH.",
        command_path.display(),
        parent
    )
}

#[cfg(target_os = "windows")]
fn ensure_command_parent_is_in_path(command_path: &Path) -> Result<(), String> {
    if command_parent_is_in_path(command_path) {
        return Ok(());
    }
    let parent = command_path
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| command_path.display().to_string());
    Err(format!(
        "Shortcut was created at {}, but {} is not in PATH. Add that folder to PATH to use the command from any directory.",
        command_path.display(),
        parent
    ))
}

#[cfg(target_os = "windows")]
fn windows_apps_shim_path() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|dir| dir.join("Microsoft").join("WindowsApps").join("youwee.cmd"))
}

/// Inspect whether the `youwee` command is already available globally.
#[tauri::command]
pub fn get_cli_shortcut_status() -> CliShortcutStatus {
    let platform = current_platform().to_string();
    let exe_path = current_exe().ok();
    let exe_path_str = exe_path.as_ref().map(|p| p.display().to_string());

    #[cfg(target_os = "macos")]
    {
        let primary = PathBuf::from("/usr/local/bin/youwee");
        let fallback = user_local_bin().map(|d| d.join("youwee"));
        let installed = primary.exists() || fallback.as_ref().map(|p| p.exists()).unwrap_or(false);
        let target_path = if primary.exists() {
            Some(primary.display().to_string())
        } else if let Some(fb) = fallback.as_ref().filter(|p| p.exists()) {
            Some(fb.display().to_string())
        } else {
            Some(primary.display().to_string())
        };
        let note = if primary.exists() && !command_parent_is_in_path(&primary) {
            Some((
                path_not_in_path_note(&primary),
                command_parent_path(&primary),
            ))
        } else {
            fallback
                .as_ref()
                .filter(|p| p.exists() && !command_parent_is_in_path(p))
                .map(|p| (path_not_in_path_note(p), command_parent_path(p)))
        };
        return CliShortcutStatus {
            platform,
            installed,
            target_path,
            exe_path: exe_path_str,
            can_auto_install: true,
            note: note.as_ref().map(|(text, _)| text.clone()),
            note_key: note.as_ref().map(|_| "path_not_in_path".to_string()),
            note_path: note.map(|(_, path)| path),
        };
    }

    #[cfg(target_os = "windows")]
    {
        let shim = windows_apps_shim_path();
        let installed = shim
            .as_ref()
            .map(|path| path.exists() && command_parent_is_in_path(path))
            .unwrap_or(false)
            || path_contains_exe_dir(exe_path.as_deref());
        let note = shim
            .as_ref()
            .filter(|path| path.exists() && !command_parent_is_in_path(path))
            .map(|path| (path_not_in_path_note(path), command_parent_path(path)));
        return CliShortcutStatus {
            platform,
            installed,
            target_path: shim
                .or_else(|| {
                    exe_path
                        .as_ref()
                        .and_then(|p| p.parent())
                        .map(Path::to_path_buf)
                })
                .map(|p| p.display().to_string()),
            exe_path: exe_path_str,
            can_auto_install: true,
            note: note.as_ref().map(|(text, _)| text.clone()),
            note_key: note.as_ref().map(|_| "path_not_in_path".to_string()),
            note_path: note.map(|(_, path)| path),
        };
    }

    #[cfg(target_os = "linux")]
    {
        // .deb installs /usr/bin/youwee.
        let system = PathBuf::from("/usr/bin/youwee");
        let local = user_local_bin().map(|d| d.join("youwee"));
        let system_installed = system.exists();
        let installed = system_installed || local.as_ref().map(|p| p.exists()).unwrap_or(false);
        let target_path = if system_installed {
            Some(system.display().to_string())
        } else {
            local.as_ref().map(|p| p.display().to_string())
        };
        return CliShortcutStatus {
            platform,
            installed,
            target_path,
            exe_path: exe_path_str,
            can_auto_install: !system_installed,
            note: if system_installed {
                Some("Installed via system package (/usr/bin/youwee).".to_string())
            } else if let Some(path) = local
                .as_ref()
                .filter(|p| p.exists() && !command_parent_is_in_path(p))
            {
                Some(path_not_in_path_note(path))
            } else {
                None
            },
            note_key: if system_installed {
                Some("linux_system_installed".to_string())
            } else if local
                .as_ref()
                .map(|p| p.exists() && !command_parent_is_in_path(p))
                .unwrap_or(false)
            {
                Some("path_not_in_path".to_string())
            } else {
                None
            },
            note_path: if system_installed {
                Some("/usr/bin/youwee".to_string())
            } else {
                local
                    .as_ref()
                    .filter(|p| p.exists() && !command_parent_is_in_path(p))
                    .map(|p| command_parent_path(p))
            },
        };
    }

    #[allow(unreachable_code)]
    CliShortcutStatus {
        platform,
        installed: false,
        target_path: None,
        exe_path: exe_path_str,
        can_auto_install: false,
        note: Some("Unsupported platform.".to_string()),
        note_key: Some("unsupported".to_string()),
        note_path: None,
    }
}

#[cfg(target_os = "windows")]
fn path_contains_exe_dir(exe: Option<&std::path::Path>) -> bool {
    let Some(dir) = exe.and_then(|p| p.parent()) else {
        return false;
    };
    let dir_norm = dir.display().to_string().to_lowercase();
    std::env::var("PATH")
        .map(|path| {
            path.split(';')
                .any(|entry| entry.trim().to_lowercase() == dir_norm)
        })
        .unwrap_or(false)
}

/// Install the global `youwee` shortcut for the current platform.
/// Returns the path of the installed shortcut on success.
#[tauri::command]
pub fn install_cli_shortcut() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let exe = current_exe()?;
        install_macos_symlink(&exe)
    }

    #[cfg(target_os = "windows")]
    {
        let exe = current_exe()?;
        install_windows_path(&exe)
    }

    #[cfg(target_os = "linux")]
    {
        let exe = linux_cli_source_exe()?;
        install_linux_symlink(&exe)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("CLI shortcut install is not supported on this platform.".to_string())
    }
}

#[cfg(unix)]
fn create_symlink(exe: &Path, link: &Path) -> Result<(), String> {
    use std::os::unix::fs::symlink;
    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }

    if let Ok(metadata) = std::fs::symlink_metadata(link) {
        if !metadata.file_type().is_symlink() {
            return Err(format!(
                "{} already exists and is not a Youwee symlink. Remove it manually before reinstalling.",
                link.display()
            ));
        }

        let existing_target = std::fs::read_link(link)
            .map_err(|e| format!("Failed to inspect existing {}: {}", link.display(), e))?;
        if existing_target == exe {
            return Ok(());
        }

        std::fs::remove_file(link).map_err(|e| {
            format!(
                "Failed to replace existing symlink {}: {}",
                link.display(),
                e
            )
        })?;
    }

    symlink(exe, link).map_err(|e| format!("Failed to create symlink {}: {}", link.display(), e))
}

#[cfg(target_os = "macos")]
fn install_macos_symlink(exe: &Path) -> Result<String, String> {
    let primary = PathBuf::from("/usr/local/bin/youwee");
    if create_symlink(exe, &primary).is_ok() {
        return Ok(primary.display().to_string());
    }

    // Fall back to a per-user location that does not require admin rights.
    let fallback = user_local_bin()
        .ok_or_else(|| "Could not resolve HOME directory.".to_string())?
        .join("youwee");
    create_symlink(exe, &fallback)?;
    Ok(fallback.display().to_string())
}

#[cfg(target_os = "linux")]
fn install_linux_symlink(exe: &Path) -> Result<String, String> {
    let system = PathBuf::from("/usr/bin/youwee");
    if system.exists() {
        return Ok("/usr/bin/youwee".to_string());
    }
    let link = user_local_bin()
        .ok_or_else(|| "Could not resolve HOME directory.".to_string())?
        .join("youwee");
    create_symlink(exe, &link)?;
    Ok(link.display().to_string())
}

#[cfg(target_os = "windows")]
fn install_windows_path(exe: &Path) -> Result<String, String> {
    if path_contains_exe_dir(Some(exe)) {
        return exe
            .parent()
            .map(|dir| dir.display().to_string())
            .ok_or_else(|| "Could not resolve install directory.".to_string());
    }

    let shim = windows_apps_shim_path().ok_or_else(|| {
        "Could not resolve the per-user WindowsApps command directory.".to_string()
    })?;
    if let Some(parent) = shim.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }

    let exe_display = exe.display().to_string();
    let escaped_exe = exe_display.replace('%', "%%");
    let content = format!("@echo off\r\n\"{}\" %*\r\n", escaped_exe);
    std::fs::write(&shim, content)
        .map_err(|e| format!("Failed to write {}: {}", shim.display(), e))?;
    ensure_command_parent_is_in_path(&shim)?;

    Ok(shim.display().to_string())
}
