fn main() {
    // In debug builds, create a minimal yt-dlp sidecar placeholder so
    // tauri_build::build() passes externalBin path validation without
    // requiring the real per-platform binary that CI downloads for
    // release builds. The placeholder is never executed at runtime;
    // services/ytdlp.rs rejects files under 1024 bytes and falls
    // through to app_data_dir/bin or system PATH.
    //
    // Release builds skip this so a missing sidecar binary causes a
    // build failure, forcing CI to provide the real binary.
    let profile = std::env::var("PROFILE").unwrap_or_default();
    if profile != "release" {
        let target = std::env::var("TARGET").unwrap_or_default();
        let ext = if target.contains("windows") { ".exe" } else { "" };
        let sidecar_path = std::path::PathBuf::from(format!("bin/yt-dlp-{}{}", target, ext));
        if !sidecar_path.exists() {
            if let Some(parent) = sidecar_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&sidecar_path, b"#!/bin/sh\nexit 1\n");
        }
    }

    tauri_build::build()
}
