use super::*;

fn needs_preview_transcode(codec: &str, container_format: &str) -> bool {
    let codec_lower = codec.to_lowercase();
    let format_lower = container_format.to_lowercase();

    let has_supported_container = format_lower.contains("mp4")
        || format_lower.contains("mov")
        || format_lower.contains("m4v")
        || format_lower.contains("m4a")
        || format_lower.contains("3gp");

    if !has_supported_container {
        log::info!(
            "[PREVIEW] Container '{}' not natively supported by WebKit — preview needed",
            container_format
        );
        return true;
    }

    #[cfg(target_os = "macos")]
    let problematic_codecs = ["vp9", "vp8", "av1", "theora"];
    #[cfg(not(target_os = "macos"))]
    let problematic_codecs = ["vp9", "vp8", "av1", "hevc", "h265", "theora"];

    let has_problematic_codec = problematic_codecs.iter().any(|c| codec_lower.contains(c));
    if has_problematic_codec {
        log::info!(
            "[PREVIEW] Codec '{}' not natively supported — preview needed",
            codec
        );
    }
    has_problematic_codec
}

#[tauri::command]
pub async fn generate_video_preview(
    app: AppHandle,
    input_path: String,
    video_codec: String,
    container_format: String,
) -> Result<String, String> {
    if !needs_preview_transcode(&video_codec, &container_format) {
        return Err("Preview not needed for this codec/container".to_string());
    }

    let ffmpeg_path = get_ffmpeg_path(&app).await.ok_or_else(|| {
        log::error!(
            "[PREVIEW] FFmpeg not found — cannot generate preview for codec '{}' in '{}'",
            video_codec,
            container_format
        );
        "FFmpeg not found. Please install FFmpeg from the Dependencies tab in Settings.".to_string()
    })?;

    let app_data_dir = crate::utils::app_data_dir(&app)?;
    let preview_dir = app_data_dir.join("previews");
    std::fs::create_dir_all(&preview_dir).ok();

    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        hasher.finish()
    };
    let preview_path = preview_dir.join(format!("preview_{}.mp4", hash));

    if preview_path.exists() {
        log::info!("[PREVIEW] Cache hit: {}", preview_path.display());
        return Ok(preview_path.to_string_lossy().to_string());
    }

    log::info!(
        "[PREVIEW] Generating preview for '{}' (codec={}, container={})",
        input_path,
        video_codec,
        container_format
    );

    let _ = app.emit(
        "preview-progress",
        serde_json::json!({
            "status": "starting",
            "percent": 0
        }),
    );

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-i",
        &input_path,
        "-vf",
        "scale=-2:720",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-r",
        "30",
        "-an",
        "-movflags",
        "+faststart",
        preview_path.to_str().unwrap(),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    cmd.hide_window();
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        std::fs::remove_file(&preview_path).ok();
        log::error!("[PREVIEW] FFmpeg failed for '{}': {}", input_path, stderr);
        return Err(format!("FFmpeg failed: {}", stderr));
    }

    log::info!("[PREVIEW] Preview generated: {}", preview_path.display());

    let _ = app.emit(
        "preview-progress",
        serde_json::json!({
            "status": "complete",
            "percent": 100
        }),
    );

    Ok(preview_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn check_preview_exists(
    app: AppHandle,
    input_path: String,
) -> Result<Option<String>, String> {
    let app_data_dir = crate::utils::app_data_dir(&app)?;
    let preview_dir = app_data_dir.join("previews");

    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        hasher.finish()
    };
    let preview_path = preview_dir.join(format!("preview_{}.mp4", hash));

    if preview_path.exists() {
        Ok(Some(preview_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn cleanup_previews(app: AppHandle) -> Result<u32, String> {
    let app_data_dir = crate::utils::app_data_dir(&app)?;
    let preview_dir = app_data_dir.join("previews");

    if !preview_dir.exists() {
        return Ok(0);
    }

    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(&preview_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(elapsed) = modified.elapsed() {
                        if elapsed.as_secs() > 7 * 24 * 60 * 60 {
                            if std::fs::remove_file(entry.path()).is_ok() {
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(count)
}

#[tauri::command]
pub async fn generate_video_thumbnail(
    app: AppHandle,
    input_path: String,
) -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path(&app).await.ok_or_else(|| {
        log::error!("FFmpeg not found — cannot generate thumbnail");
        "FFmpeg not found. Please install FFmpeg from the Dependencies tab in Settings.".to_string()
    })?;

    let app_data_dir = crate::utils::app_data_dir(&app)?;
    let preview_dir = app_data_dir.join("previews");
    std::fs::create_dir_all(&preview_dir).ok();

    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        hasher.finish()
    };
    let thumb_path = preview_dir.join(format!("thumb_{}.jpg", hash));

    if thumb_path.exists() {
        log::info!("[THUMBNAIL] Cache hit: {}", thumb_path.display());
        return Ok(thumb_path.to_string_lossy().to_string());
    }

    log::info!("[THUMBNAIL] Generating thumbnail for '{}'", input_path);

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-ss",
        "1",
        "-i",
        &input_path,
        "-frames:v",
        "1",
        "-vf",
        "scale=-2:720",
        "-q:v",
        "2",
        thumb_path.to_str().unwrap(),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    cmd.hide_window();
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        std::fs::remove_file(&thumb_path).ok();
        log::error!("[THUMBNAIL] FFmpeg failed for '{}': {}", input_path, stderr);
        return Err(format!("FFmpeg thumbnail failed: {}", stderr));
    }

    log::info!("[THUMBNAIL] Generated: {}", thumb_path.display());
    Ok(thumb_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn generate_audio_preview(app: AppHandle, input_path: String) -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path(&app).await.ok_or_else(|| {
        log::error!("FFmpeg not found — cannot generate audio preview");
        "FFmpeg not found. Please install FFmpeg from the Dependencies tab in Settings.".to_string()
    })?;

    let app_data_dir = crate::utils::app_data_dir(&app)?;
    let preview_dir = app_data_dir.join("previews");
    std::fs::create_dir_all(&preview_dir).ok();

    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        hasher.finish()
    };
    let audio_path = preview_dir.join(format!("audio_{}.wav", hash));

    if audio_path.exists() {
        log::info!("[AUDIO_PREVIEW] Cache hit: {}", audio_path.display());
        return Ok(audio_path.to_string_lossy().to_string());
    }

    log::info!(
        "[AUDIO_PREVIEW] Generating audio preview for '{}'",
        input_path
    );

    let mut cmd = Command::new(&ffmpeg_path);
    cmd.args([
        "-y",
        "-i",
        &input_path,
        "-vn",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "1",
        audio_path.to_str().unwrap(),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    cmd.hide_window();
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        std::fs::remove_file(&audio_path).ok();
        log::error!(
            "[AUDIO_PREVIEW] FFmpeg failed for '{}': {}",
            input_path,
            stderr
        );
        return Err(format!("FFmpeg audio preview failed: {}", stderr));
    }

    log::info!("[AUDIO_PREVIEW] Generated: {}", audio_path.display());
    Ok(audio_path.to_string_lossy().to_string())
}
