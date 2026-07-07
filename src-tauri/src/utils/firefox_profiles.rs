use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FirefoxProfile {
    pub folder_name: String,
    pub display_name: String,
}

#[derive(Default)]
struct FirefoxProfileEntry {
    name: Option<String>,
    path: Option<String>,
    is_relative: Option<bool>,
    is_default: bool,
    index: usize,
}

fn firefox_profile_folder_name(path: &str) -> Option<String> {
    path.replace('\\', "/")
        .rsplit('/')
        .find(|segment| !segment.is_empty())
        .map(str::to_string)
}

fn firefox_profile_cookie_value(path: &str, is_relative: Option<bool>) -> Option<String> {
    let path = path.trim();
    if path.is_empty() {
        return None;
    }

    if is_relative == Some(false) {
        return Some(path.to_string());
    }

    firefox_profile_folder_name(path)
}

pub fn firefox_profiles_from_ini(content: &str) -> Vec<FirefoxProfile> {
    let mut entries = Vec::new();
    let mut install_default_paths = Vec::new();
    let mut current_profile: Option<FirefoxProfileEntry> = None;
    let mut in_install_section = false;
    let mut next_index = 0;

    for raw_line in content.lines() {
        let line = raw_line.trim();

        if line.starts_with('[') && line.ends_with(']') {
            if let Some(entry) = current_profile.take() {
                if entry.name.as_deref().is_some_and(|name| !name.is_empty()) {
                    entries.push(entry);
                }
            }

            in_install_section = line.starts_with("[Install");
            current_profile = if line.starts_with("[Profile") {
                let entry = FirefoxProfileEntry {
                    index: next_index,
                    ..Default::default()
                };
                next_index += 1;
                Some(entry)
            } else {
                None
            };
            continue;
        }

        if let Some(entry) = current_profile.as_mut() {
            if let Some(name) = line.strip_prefix("Name=") {
                entry.name = Some(name.to_string());
            } else if let Some(path) = line.strip_prefix("Path=") {
                entry.path = Some(path.to_string());
            } else if let Some(is_relative) = line.strip_prefix("IsRelative=") {
                entry.is_relative = match is_relative {
                    "0" => Some(false),
                    "1" => Some(true),
                    _ => None,
                };
            } else if line == "Default=1" {
                entry.is_default = true;
            }
        } else if in_install_section {
            if let Some(path) = line.strip_prefix("Default=") {
                if !path.is_empty() {
                    install_default_paths.push(path.to_string());
                }
            }
        }
    }

    if let Some(entry) = current_profile {
        if entry.name.as_deref().is_some_and(|name| !name.is_empty()) {
            entries.push(entry);
        }
    }

    entries.sort_by_key(|entry| {
        let is_install_default = entry.path.as_ref().is_some_and(|path| {
            install_default_paths
                .iter()
                .any(|default_path| default_path == path)
        });

        (!is_install_default, !entry.is_default, entry.index)
    });

    entries
        .into_iter()
        .filter_map(|entry| {
            let display_name = entry.name?;
            let folder_name = entry
                .path
                .as_deref()
                .and_then(|path| firefox_profile_cookie_value(path, entry.is_relative))?;
            Some(FirefoxProfile {
                folder_name,
                display_name,
            })
        })
        .collect()
}

pub fn resolve_firefox_profile_from_ini(content: &str, selected_profile: &str) -> Option<String> {
    let selected_profile = selected_profile.trim();
    if selected_profile.is_empty() {
        return None;
    }

    firefox_profiles_from_ini(content)
        .into_iter()
        .find(|profile| {
            profile.folder_name == selected_profile || profile.display_name == selected_profile
        })
        .map(|profile| profile.folder_name)
}

pub fn firefox_profiles_ini_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").ok()?;
        return Some(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Firefox")
                .join("profiles.ini"),
        );
    }

    #[cfg(target_os = "windows")]
    {
        let app_data = std::env::var("APPDATA").ok()?;
        return Some(
            PathBuf::from(app_data)
                .join("Mozilla")
                .join("Firefox")
                .join("profiles.ini"),
        );
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").ok()?;
        return Some(
            PathBuf::from(home)
                .join(".mozilla")
                .join("firefox")
                .join("profiles.ini"),
        );
    }

    #[allow(unreachable_code)]
    None
}

pub fn resolve_firefox_profile_for_cookies(selected_profile: &str) -> String {
    let Some(profiles_ini) = firefox_profiles_ini_path() else {
        return selected_profile.to_string();
    };

    std::fs::read_to_string(profiles_ini)
        .ok()
        .and_then(|content| resolve_firefox_profile_from_ini(&content, selected_profile))
        .unwrap_or_else(|| selected_profile.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        firefox_profile_cookie_value, firefox_profile_folder_name, firefox_profiles_from_ini,
        resolve_firefox_profile_from_ini,
    };

    #[test]
    fn firefox_relative_profile_uses_the_real_directory_name() {
        assert_eq!(
            firefox_profile_folder_name("Profiles/i879pxds.default-release"),
            Some("i879pxds.default-release".to_string())
        );
        assert_eq!(
            firefox_profile_folder_name(r"Profiles\i879pxds.default-release"),
            Some("i879pxds.default-release".to_string())
        );
    }

    #[test]
    fn firefox_absolute_profile_path_is_preserved_for_ytdlp() {
        assert_eq!(
            firefox_profile_cookie_value(
                r"C:\Users\Me\AppData\Roaming\Mozilla\Firefox\Profiles\external.default",
                Some(false),
            ),
            Some(
                r"C:\Users\Me\AppData\Roaming\Mozilla\Firefox\Profiles\external.default"
                    .to_string()
            )
        );
    }

    #[test]
    fn firefox_profiles_ini_separates_display_name_from_cookie_value() {
        let profiles = firefox_profiles_from_ini(
            r#"
[Profile0]
Name=default-release
IsRelative=1
Path=Profiles/i879pxds.default-release
Default=1
"#,
        );

        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].display_name, "default-release");
        assert_eq!(profiles[0].folder_name, "i879pxds.default-release");
    }

    #[test]
    fn firefox_profiles_ini_preserves_absolute_paths() {
        let profiles = firefox_profiles_from_ini(
            r#"
[Profile0]
Name=external
IsRelative=0
Path=C:\Firefox\Profiles\external.default
"#,
        );

        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].display_name, "external");
        assert_eq!(
            profiles[0].folder_name,
            r"C:\Firefox\Profiles\external.default"
        );
    }

    #[test]
    fn firefox_profile_resolution_migrates_legacy_display_names() {
        let content = r#"
[Profile0]
Name=default-release
IsRelative=1
Path=Profiles/i879pxds.default-release
"#;

        assert_eq!(
            resolve_firefox_profile_from_ini(content, "default-release"),
            Some("i879pxds.default-release".to_string())
        );
        assert_eq!(
            resolve_firefox_profile_from_ini(content, "i879pxds.default-release"),
            Some("i879pxds.default-release".to_string())
        );
    }
}
