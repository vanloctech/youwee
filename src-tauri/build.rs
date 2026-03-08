fn main() {
    // Ensure the yt-dlp sidecar placeholder exists so tauri_build::build()
    // passes its resource path validation during local dev builds.
    //
    // Production builds: CI downloads the real per-platform yt-dlp binary
    // into src-tauri/bin/ before compilation (see .github/workflows/build.yml).
    //
    // Dev builds: the placeholder is never executed at runtime. The fallback
    // chain in services/ytdlp.rs resolves yt-dlp from app_data_dir/bin/ or
    // system PATH when the bundled sidecar is absent or not a real binary.
    let target = std::env::var("TARGET").unwrap_or_default();
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let sidecar_path = std::path::PathBuf::from(format!("bin/yt-dlp-{}{}", target, ext));
    if !sidecar_path.exists() {
        if let Some(parent) = sidecar_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&sidecar_path, b"#!/bin/sh\nexit 1\n");
    }

    tauri_build::build()
}
