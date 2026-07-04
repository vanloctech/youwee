use std::path::Path;

#[tauri::command]
pub fn is_flatpak_environment() -> bool {
    cfg!(target_os = "linux")
        && (std::env::var_os("FLATPAK_ID").is_some() || Path::new("/.flatpak-info").exists())
}
