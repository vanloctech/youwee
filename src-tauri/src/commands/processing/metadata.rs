use super::*;

/// Get video metadata using FFprobe
#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<VideoMetadata, String> {
    let ffprobe_path = get_ffprobe_path(&app)
        .await
        .ok_or("FFprobe not found. Please install FFmpeg.")?;

    let mut cmd = Command::new(&ffprobe_path);
    cmd.args([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        &path,
    ]);
    cmd.hide_window();
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err("FFprobe failed to analyze video".to_string());
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    let streams = json
        .get("streams")
        .and_then(|s| s.as_array())
        .ok_or("No streams found")?;
    let format = json.get("format").ok_or("No format info")?;

    let video_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"));

    let audio_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("audio"));

    let filename = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let format_duration = format
        .get("duration")
        .and_then(|d| d.as_str())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    // Some downloads contain an audio track that is much longer than the
    // actual video stream. Using the container duration in that case makes
    // channel splitting seek past the last video frame and produces
    // audio-only parts. Prefer the video stream duration whenever it is
    // available, while retaining the container value for audio-only media.
    let duration = video_stream
        .and_then(|stream| stream.get("duration"))
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(format_duration);

    let (width, height, fps, video_codec) = if let Some(vs) = video_stream {
        let w = vs.get("width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let h = vs.get("height").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let codec = vs
            .get("codec_name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let fps_str = vs
            .get("r_frame_rate")
            .and_then(|v| v.as_str())
            .unwrap_or("0/1");
        let fps_parts: Vec<&str> = fps_str.split('/').collect();
        let fps = if fps_parts.len() == 2 {
            let num = fps_parts[0].parse::<f64>().unwrap_or(0.0);
            let den = fps_parts[1].parse::<f64>().unwrap_or(1.0);
            if den > 0.0 {
                num / den
            } else {
                0.0
            }
        } else {
            fps_str.parse::<f64>().unwrap_or(0.0)
        };

        (w, h, fps, codec)
    } else {
        (0, 0, 0.0, "none".to_string())
    };

    let audio_codec = audio_stream
        .and_then(|a| a.get("codec_name"))
        .and_then(|c| c.as_str())
        .unwrap_or("none")
        .to_string();

    let bitrate = format
        .get("bit_rate")
        .and_then(|b| b.as_str())
        .and_then(|b| b.parse::<i64>().ok())
        .unwrap_or(0)
        / 1000;

    let file_size = format
        .get("size")
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    let format_name = format
        .get("format_name")
        .and_then(|f| f.as_str())
        .unwrap_or("unknown")
        .split(',')
        .next()
        .unwrap_or("unknown")
        .to_string();

    Ok(VideoMetadata {
        path,
        filename,
        duration,
        width,
        height,
        fps,
        video_codec,
        audio_codec,
        bitrate,
        file_size,
        format: format_name,
        has_audio: audio_stream.is_some(),
    })
}

/// Detect shot changes using FFmpeg scene detection filter.
#[tauri::command]
pub async fn detect_shot_changes(
    app: AppHandle,
    path: String,
    threshold: Option<f64>,
    min_interval_ms: Option<i64>,
) -> Result<ShotDetectionResult, String> {
    let input_path = Path::new(&path);
    if !input_path.exists() {
        return Err(format!("Video not found: {}", path));
    }

    let ffmpeg_path = get_ffmpeg_path(&app)
        .await
        .ok_or("FFmpeg not found. Please install FFmpeg from Settings > Dependencies.")?;

    let threshold_value = threshold.unwrap_or(0.35).clamp(0.05, 0.95);
    let min_interval = min_interval_ms.unwrap_or(250).max(0);
    let scene_filter = format!("select=gt(scene\\,{:.3}),showinfo", threshold_value);

    let mut cmd = Command::new(ffmpeg_path);
    cmd.args([
        "-hide_banner",
        "-i",
        &path,
        "-vf",
        &scene_filter,
        "-an",
        "-f",
        "null",
        "-",
    ]);
    cmd.hide_window();

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg shot detection: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg shot detection failed: {}", stderr));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let re = regex::Regex::new(r"pts_time:([0-9]+(?:\.[0-9]+)?)")
        .map_err(|e| format!("Failed to build regex: {}", e))?;

    let mut detected_ms = Vec::new();
    for cap in re.captures_iter(&stderr) {
        let Some(raw) = cap.get(1).map(|m| m.as_str()) else {
            continue;
        };
        let Ok(sec) = raw.parse::<f64>() else {
            continue;
        };
        let ms = (sec * 1000.0).round() as i64;
        detected_ms.push(ms.max(0));
    }

    detected_ms.sort_unstable();
    detected_ms.dedup();

    let mut filtered = Vec::with_capacity(detected_ms.len());
    for value in detected_ms {
        let keep = filtered
            .last()
            .map_or(true, |last| value - *last >= min_interval);
        if keep {
            filtered.push(value);
        }
    }

    Ok(ShotDetectionResult {
        shot_times_ms: filtered,
        threshold: threshold_value,
        min_interval_ms: min_interval,
    })
}
