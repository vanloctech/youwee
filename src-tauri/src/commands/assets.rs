use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use tauri::{scope::Scopes, AppHandle, Manager};

fn normalize_asset_path(path: &str) -> Option<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }

    #[cfg(windows)]
    let trimmed = trimmed.strip_prefix(r"\\?\").unwrap_or(trimmed);

    Some(PathBuf::from(trimmed))
}

fn candidate_scope_directory(path: &Path) -> Option<PathBuf> {
    if path.as_os_str().is_empty() {
        return None;
    }

    if path.is_dir() {
        return Some(path.to_path_buf());
    }

    if path.is_file() {
        return path
            .parent()
            .map(Path::to_path_buf)
            .or_else(|| Some(path.to_path_buf()));
    }

    if path.extension().is_some() {
        return path
            .parent()
            .map(Path::to_path_buf)
            .or_else(|| Some(path.to_path_buf()));
    }

    Some(path.to_path_buf())
}

fn collect_scope_directories(paths: &[String]) -> Vec<PathBuf> {
    let mut unique = BTreeSet::new();

    for raw_path in paths {
        let Some(normalized) = normalize_asset_path(raw_path) else {
            continue;
        };

        if let Some(directory) = candidate_scope_directory(&normalized) {
            unique.insert(directory);
        }
    }

    unique.into_iter().collect()
}

#[tauri::command]
pub fn allow_asset_file(app: AppHandle, path: String) -> Result<(), String> {
    let normalized = normalize_asset_path(&path).ok_or_else(|| "Missing asset path".to_string())?;
    let scopes = app.state::<Scopes>();

    if normalized.is_dir() {
        scopes.allow_directory(&normalized, true).map_err(|e| {
            format!(
                "Failed to allow asset directory {}: {}",
                normalized.display(),
                e
            )
        })?;
    } else {
        scopes
            .allow_file(&normalized)
            .map_err(|e| format!("Failed to allow asset file {}: {}", normalized.display(), e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn sync_asset_scope_paths(app: AppHandle, paths: Vec<String>) -> Result<usize, String> {
    let scopes = app.state::<Scopes>();
    let directories = collect_scope_directories(&paths);

    for directory in &directories {
        scopes.allow_directory(directory, true).map_err(|e| {
            format!(
                "Failed to allow asset directory {}: {}",
                directory.display(),
                e
            )
        })?;
    }

    Ok(directories.len())
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::{collect_scope_directories, normalize_asset_path};
    use std::path::PathBuf;

    #[test]
    fn normalize_asset_path_strips_windows_extended_prefix() {
        let path = normalize_asset_path(r"  \\?\D:\Music\track.mp3  ").unwrap();
        assert_eq!(path, PathBuf::from(r"D:\Music\track.mp3"));
    }

    #[test]
    fn collect_scope_directories_dedupes_parent_directories() {
        let directories = collect_scope_directories(&[
            String::from(r"\\?\D:\Music\track.mp3"),
            String::from(r"D:\Music\track.mp3"),
            String::from(r"D:\Music"),
            String::from(r"C:\Users\86153\Downloads\song.mp3"),
        ]);

        assert_eq!(
            directories,
            vec![
                PathBuf::from(r"C:\Users\86153\Downloads"),
                PathBuf::from(r"D:\Music"),
            ]
        );
    }
}
