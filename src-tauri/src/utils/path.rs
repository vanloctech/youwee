use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use super::command::CommandExt;

/// Sanitize and validate output path to prevent path traversal attacks
pub fn sanitize_output_path(path: &str) -> Result<String, String> {
    // Check for empty path
    if path.is_empty() {
        return Err(
            "Invalid output path: path cannot be empty. Please select an output folder."
                .to_string(),
        );
    }

    // Check for obvious path traversal attempts
    if path.contains("..") {
        return Err("Invalid output path: path traversal detected".to_string());
    }

    let path = Path::new(path);

    // Ensure the path is absolute
    if !path.is_absolute() {
        return Err("Invalid output path: must be an absolute path".to_string());
    }

    // Create directory if it doesn't exist (for ChromeOS/Linux where Downloads may not exist)
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| {
            format!(
                "Failed to create output directory: {}. Please select a different folder.",
                e
            )
        })?;
    }

    // Canonicalize to resolve any symlinks and normalize the path
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Invalid output path: {}", e))?;

    // Verify it's a directory
    if !canonical.is_dir() {
        return Err("Invalid output path: not a directory".to_string());
    }

    canonical
        .to_str()
        .ok_or_else(|| "Invalid output path: contains invalid UTF-8".to_string())
        .map(|s| s.to_string())
}

/// Build candidate executable paths from the current process PATH plus platform fallbacks.
///
/// On Windows, GUI apps can inherit a stale or reduced PATH from Explorer. To better match
/// what users see in a fresh Command Prompt, this also reads User/Machine PATH from registry.
pub fn system_binary_candidates(binary_name: &str, fallback_dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut path_vars = Vec::new();

    if let Some(path_var) = std::env::var_os("PATH") {
        path_vars.push(path_var);
    }

    let mut candidates = binary_candidates_from_path_vars(binary_name, path_vars, &[]);

    #[cfg(windows)]
    {
        for path_var in windows_registry_path_values() {
            push_path_string_candidates(&mut candidates, &path_var, binary_name);
        }

        for dir in windows_common_binary_dirs() {
            candidates.push(dir.join(binary_name));
        }
    }

    for dir in fallback_dirs {
        candidates.push(dir.join(binary_name));
    }

    unique_paths(candidates)
}

pub fn find_system_binary(binary_name: &str, fallback_dirs: &[PathBuf]) -> Option<PathBuf> {
    system_binary_candidates(binary_name, fallback_dirs)
        .into_iter()
        .find(|path| path.exists())
}

pub fn unix_system_binary_dirs() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        Vec::new()
    }
    #[cfg(not(windows))]
    {
        vec![
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
        ]
    }
}

fn push_path_var_candidates(
    candidates: &mut Vec<PathBuf>,
    path_var: std::ffi::OsString,
    binary_name: &str,
) {
    for dir in std::env::split_paths(&path_var) {
        candidates.push(dir.join(binary_name));
    }
}

fn binary_candidates_from_path_vars(
    binary_name: &str,
    path_vars: Vec<std::ffi::OsString>,
    fallback_dirs: &[PathBuf],
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for path_var in path_vars {
        push_path_var_candidates(&mut candidates, path_var, binary_name);
    }

    for dir in fallback_dirs {
        candidates.push(dir.join(binary_name));
    }

    unique_paths(candidates)
}

#[cfg(windows)]
fn push_path_string_candidates(candidates: &mut Vec<PathBuf>, path_var: &str, binary_name: &str) {
    for dir in std::env::split_paths(path_var) {
        candidates.push(dir.join(binary_name));
    }
}

fn unique_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut unique = Vec::new();
    let mut seen = HashSet::new();

    for path in paths {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            unique.push(path);
        }
    }

    unique
}

#[cfg(windows)]
fn windows_registry_path_values() -> Vec<String> {
    [
        ("HKCU\\Environment", "Path"),
        (
            "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
            "Path",
        ),
    ]
    .into_iter()
    .filter_map(|(key, value)| query_windows_registry_value(key, value))
    .map(|path| expand_windows_env_vars(&path))
    .collect()
}

#[cfg(windows)]
fn query_windows_registry_value(key: &str, value: &str) -> Option<String> {
    let mut command = std::process::Command::new("reg.exe");
    command.args(["query", key, "/v", value]);
    command.hide_window();

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_windows_reg_query_value(&stdout, value)
}

#[cfg(windows)]
fn windows_common_binary_dirs() -> Vec<PathBuf> {
    windows_common_binary_dirs_from_env(|name| std::env::var_os(name))
}

#[cfg(windows)]
fn windows_common_binary_dirs_from_env<F>(lookup: F) -> Vec<PathBuf>
where
    F: Fn(&str) -> Option<std::ffi::OsString>,
{
    let mut dirs = Vec::new();

    if let Some(user_profile) = lookup("USERPROFILE") {
        let user_profile = PathBuf::from(user_profile);
        dirs.push(user_profile.join("scoop").join("shims"));
        dirs.push(user_profile.join(".local").join("bin"));
    }

    if let Some(local_app_data) = lookup("LOCALAPPDATA") {
        let local_app_data = PathBuf::from(local_app_data);
        dirs.push(
            local_app_data
                .join("Microsoft")
                .join("WinGet")
                .join("Links"),
        );
        dirs.extend(windows_python_script_dirs(
            &local_app_data.join("Programs").join("Python"),
        ));
    }

    if let Some(program_data) = lookup("ProgramData") {
        dirs.push(PathBuf::from(program_data).join("chocolatey").join("bin"));
    }

    if let Some(app_data) = lookup("APPDATA") {
        dirs.extend(windows_python_script_dirs(
            &PathBuf::from(app_data).join("Python"),
        ));
    }

    dirs
}

#[cfg(windows)]
fn windows_python_script_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            if path.is_dir() && name.starts_with("Python") {
                dirs.push(path.join("Scripts"));
            }
        }
    }

    dirs
}

#[cfg(windows)]
fn parse_windows_reg_query_value(output: &str, value_name: &str) -> Option<String> {
    for line in output.lines() {
        let trimmed = line.trim_start();
        if !trimmed
            .to_ascii_lowercase()
            .starts_with(&value_name.to_ascii_lowercase())
        {
            continue;
        }

        let mut parts = trimmed.split_whitespace();
        let name = parts.next()?;
        if !name.eq_ignore_ascii_case(value_name) {
            continue;
        }

        let value_type = parts.next()?;
        if value_type != "REG_SZ" && value_type != "REG_EXPAND_SZ" {
            continue;
        }

        let data_start = trimmed.find(value_type)? + value_type.len();
        let data = trimmed[data_start..].trim();
        if !data.is_empty() {
            return Some(data.to_string());
        }
    }

    None
}

#[cfg(windows)]
fn expand_windows_env_vars(value: &str) -> String {
    expand_windows_env_vars_with(value, |name| std::env::var(name).ok())
}

#[cfg(windows)]
fn expand_windows_env_vars_with<F>(value: &str, lookup: F) -> String
where
    F: Fn(&str) -> Option<String>,
{
    let mut output = String::new();
    let mut chars = value.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '%' {
            output.push(ch);
            continue;
        }

        let mut var_name = String::new();
        let mut found_end = false;
        while let Some(next) = chars.next() {
            if next == '%' {
                found_end = true;
                break;
            }
            var_name.push(next);
        }

        if found_end && !var_name.is_empty() {
            if let Some(replacement) = lookup(&var_name) {
                output.push_str(&replacement);
            } else {
                output.push('%');
                output.push_str(&var_name);
                output.push('%');
            }
        } else {
            output.push('%');
            output.push_str(&var_name);
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_paths_preserves_first_occurrence() {
        let paths = unique_paths(vec![
            PathBuf::from("/first/bin/tool"),
            PathBuf::from("/second/bin/tool"),
            PathBuf::from("/first/bin/tool"),
        ]);

        assert_eq!(
            paths,
            vec![
                PathBuf::from("/first/bin/tool"),
                PathBuf::from("/second/bin/tool")
            ]
        );
    }

    #[test]
    fn path_entries_are_prioritized_before_fallback_dirs() {
        let path_var =
            std::env::join_paths([PathBuf::from("/path/bin"), PathBuf::from("/other/bin")])
                .expect("test paths should join");

        let candidates = binary_candidates_from_path_vars(
            "tool",
            vec![path_var],
            &[PathBuf::from("/fallback/bin")],
        );

        assert_eq!(
            candidates,
            vec![
                PathBuf::from("/path/bin/tool"),
                PathBuf::from("/other/bin/tool"),
                PathBuf::from("/fallback/bin/tool"),
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn parses_windows_reg_query_path_value() {
        let output = r#"
HKEY_CURRENT_USER\Environment
    Path    REG_EXPAND_SZ    %USERPROFILE%\scoop\shims;C:\Tools
"#;

        assert_eq!(
            parse_windows_reg_query_value(output, "Path").as_deref(),
            Some(r"%USERPROFILE%\scoop\shims;C:\Tools")
        );
    }

    #[cfg(windows)]
    #[test]
    fn expands_windows_env_vars() {
        let expanded =
            expand_windows_env_vars_with(r"%USERPROFILE%\scoop\shims;%UNKNOWN%\bin", |name| {
                match name {
                    "USERPROFILE" => Some(r"C:\Users\Alice".to_string()),
                    _ => None,
                }
            });

        assert_eq!(expanded, r"C:\Users\Alice\scoop\shims;%UNKNOWN%\bin");
    }

    #[cfg(windows)]
    #[test]
    fn windows_common_dirs_include_package_manager_and_python_paths() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("youwee-path-test-{}", nonce));
        let user_profile = root.join("User");
        let local_app_data = root.join("LocalAppData");
        let app_data = root.join("AppData");
        let program_data = root.join("ProgramData");

        std::fs::create_dir_all(
            local_app_data
                .join("Programs")
                .join("Python")
                .join("Python313")
                .join("Scripts"),
        )
        .expect("local Python Scripts directory should be created");
        std::fs::create_dir_all(app_data.join("Python").join("Python312").join("Scripts"))
            .expect("AppData Python Scripts directory should be created");

        let dirs = windows_common_binary_dirs_from_env(|name| match name {
            "USERPROFILE" => Some(user_profile.clone().into_os_string()),
            "LOCALAPPDATA" => Some(local_app_data.clone().into_os_string()),
            "APPDATA" => Some(app_data.clone().into_os_string()),
            "ProgramData" => Some(program_data.clone().into_os_string()),
            _ => None,
        });

        assert!(dirs.contains(&user_profile.join("scoop").join("shims")));
        assert!(dirs.contains(
            &local_app_data
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
        ));
        assert!(dirs.contains(&program_data.join("chocolatey").join("bin")));
        assert!(dirs.contains(
            &local_app_data
                .join("Programs")
                .join("Python")
                .join("Python313")
                .join("Scripts")
        ));
        assert!(dirs.contains(&app_data.join("Python").join("Python312").join("Scripts")));

        std::fs::remove_dir_all(root).ok();
    }
}
