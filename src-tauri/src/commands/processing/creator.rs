use super::*;
use crate::database::add_history_internal;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "mkv", "avi", "m4v", "ts", "wmv", "flv", "webm",
];
const CREATOR_RENDER_VERSION: &str = "cjk-font-centered-bars-v2";
const CREATOR_FONT_FILE: &str = "NotoSansCJKjp-Regular.otf";
const CREATOR_LINE_SPACING: usize = 86;

static CREATOR_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorProcessingOptions {
    pub mode: String,
    pub right_folder: Option<String>,
    pub output_folder: String,
    pub split_by: Option<String>,
    pub part_seconds: Option<u32>,
    pub part_count: Option<u32>,
    pub title: Option<String>,
    pub encoder: Option<String>,
    pub right_path: Option<String>,
    #[serde(default)]
    pub delete_input_after_success: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorProcessingResult {
    pub output_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorJob {
    pub id: String,
    pub input_path: String,
    pub title: Option<String>,
    pub settings: CreatorProcessingOptions,
    pub status: String,
    pub error_message: Option<String>,
    #[serde(default)]
    pub channel_url: Option<String>,
    #[serde(default)]
    pub video_id: Option<String>,
}

#[tauri::command]
pub fn enqueue_creator_job(
    input_path: String,
    title: Option<String>,
    mut settings: CreatorProcessingOptions,
    channel_url: Option<String>,
    video_id: Option<String>,
) -> Result<(), String> {
    if settings.mode == "duet" && settings.right_path.is_none() {
        let folder = settings
            .right_folder
            .as_deref()
            .ok_or("Duet right folder is required")?;
        let mut candidates = Vec::new();
        scan_video_files(Path::new(folder), &mut candidates)?;
        candidates.sort();
        if candidates.is_empty() {
            return Err("Duet right folder contains no supported videos".to_string());
        }
        let digest = Sha256::digest(format!("{input_path}|{folder}").as_bytes());
        let mut index_bytes = [0_u8; 8];
        index_bytes.copy_from_slice(&digest[..8]);
        settings.right_path = Some(
            candidates[u64::from_be_bytes(index_bytes) as usize % candidates.len()]
                .to_string_lossy()
                .to_string(),
        );
    }
    let conn = get_db()?;
    let settings_json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    let config_key = hex::encode(Sha256::digest(settings_json.as_bytes()));
    let already_queued: i64 = conn.query_row(
        "SELECT COUNT(*) FROM creator_jobs WHERE input_path = ?1 AND mode = ?2 AND config_key = ?3 AND status IN ('pending', 'running', 'completed')",
        params![input_path, settings.mode, config_key], |row| row.get(0),
    ).map_err(|e| format!("Cannot check creator queue: {e}"))?;
    if already_queued > 0 {
        return Ok(());
    }
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let payload = serde_json::to_string(&CreatorJob {
        id: id.clone(),
        input_path: input_path.clone(),
        title,
        settings: settings.clone(),
        status: "pending".to_string(),
        error_message: None,
        channel_url,
        video_id,
    })
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO creator_jobs (id, input_path, mode, config_key, payload_json, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6)",
        params![id, input_path, settings.mode, config_key, payload, now],
    ).map_err(|e| format!("Cannot queue creator job: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_creator_jobs() -> Result<Vec<CreatorJob>, String> {
    let conn = get_db()?;
    let mut statement = conn.prepare(
        "SELECT payload_json, status, error_message FROM creator_jobs ORDER BY created_at, rowid"
    ).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let payload: String = row.get(0)?;
            let status: String = row.get(1)?;
            let error_message: Option<String> = row.get(2)?;
            Ok((payload, status, error_message))
        })
        .map_err(|e| e.to_string())?;
    let mut jobs = Vec::new();
    for row in rows {
        let (payload, status, error_message) = row.map_err(|e| e.to_string())?;
        let mut job: CreatorJob = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
        job.status = status;
        job.error_message = error_message;
        jobs.push(job);
    }
    Ok(jobs)
}

#[tauri::command]
pub fn next_creator_job() -> Result<Option<CreatorJob>, String> {
    let conn = get_db()?;
    let row = conn.query_row(
        "SELECT payload_json, status, error_message FROM creator_jobs WHERE status IN ('pending', 'running') ORDER BY created_at, rowid LIMIT 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?)),
    );
    match row {
        Ok((payload, status, error_message)) => {
            let mut job: CreatorJob = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
            job.status = status;
            job.error_message = error_message;
            Ok(Some(job))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(format!("Cannot read creator queue: {error}")),
    }
}

#[tauri::command]
pub fn set_creator_job_status(
    id: String,
    status: String,
    error_message: Option<String>,
) -> Result<(), String> {
    if !["pending", "running", "completed", "failed", "cancelled"].contains(&status.as_str()) {
        return Err("Invalid creator job status".to_string());
    }
    let conn = get_db()?;
    conn.execute(
        "UPDATE creator_jobs SET status = ?1, error_message = ?2, updated_at = ?3 WHERE id = ?4",
        params![status, error_message, chrono::Utc::now().to_rfc3339(), id],
    )
    .map_err(|e| format!("Cannot update creator job: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn retry_failed_creator_jobs() -> Result<u64, String> {
    CREATOR_CANCEL_REQUESTED.store(false, Ordering::Relaxed);
    let conn = get_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    let updated = conn
        .execute(
            "UPDATE creator_jobs SET status = 'pending', error_message = NULL, updated_at = ?1 WHERE status = 'failed'",
            params![now],
        )
        .map_err(|e| format!("Cannot retry failed creator jobs: {e}"))?;
    Ok(updated as u64)
}

#[tauri::command]
pub fn start_creator_processing_queue() {
    CREATOR_CANCEL_REQUESTED.store(false, Ordering::Relaxed);
}

#[tauri::command]
pub fn stop_creator_processing_queue() -> Result<u64, String> {
    CREATOR_CANCEL_REQUESTED.store(true, Ordering::Relaxed);
    let conn = get_db()?;
    let updated = conn
        .execute(
            "UPDATE creator_jobs SET status = 'cancelled', error_message = NULL, updated_at = ?1
             WHERE status IN ('pending', 'running')",
            params![chrono::Utc::now().to_rfc3339()],
        )
        .map_err(|e| format!("Cannot stop creator processing: {e}"))?;
    Ok(updated as u64)
}

#[tauri::command]
pub fn pause_creator_processing_queue() -> Result<u64, String> {
    CREATOR_CANCEL_REQUESTED.store(true, Ordering::Relaxed);
    let conn = get_db()?;
    let updated = conn
        .execute(
            "UPDATE creator_jobs SET status = 'pending', error_message = NULL, updated_at = ?1
             WHERE status = 'running'",
            params![chrono::Utc::now().to_rfc3339()],
        )
        .map_err(|e| format!("Cannot pause creator processing: {e}"))?;
    Ok(updated as u64)
}

#[tauri::command]
pub fn delete_creator_jobs(ids: Vec<String>) -> Result<u64, String> {
    if ids.len() > 1000 {
        return Err("Too many creator jobs selected".to_string());
    }
    let conn = get_db()?;
    let mut deleted = 0_u64;
    for id in ids {
        deleted +=
            conn.execute(
                "DELETE FROM creator_jobs WHERE id = ?1 AND status = 'failed'",
                params![id],
            )
            .map_err(|error| format!("Cannot delete creator job: {error}"))? as u64;
    }
    Ok(deleted)
}

fn scan_video_files(root: &Path, results: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in std::fs::read_dir(root).map_err(|e| format!("Cannot read RIGHT folder: {e}"))? {
        let entry = entry.map_err(|e| format!("Cannot read RIGHT folder entry: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            scan_video_files(&path, results)?;
        } else if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| VIDEO_EXTENSIONS.contains(&value.to_ascii_lowercase().as_str()))
        {
            results.push(path);
        }
    }
    Ok(())
}

fn safe_stem(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    safe_filename_component(stem)
}

fn safe_filename_component(value: &str) -> String {
    let mut safe: String = value
        .chars()
        .map(|ch| {
            if ch.is_control() || "<>:\"/\\|?*".contains(ch) {
                '_'
            } else {
                ch
            }
        })
        .take(100)
        .collect();
    safe = safe.trim().trim_end_matches('.').to_string();
    if safe.is_empty() {
        return "video".to_string();
    }

    let reserved = ["CON", "PRN", "AUX", "NUL"];
    let first_part = safe.split('.').next().unwrap_or_default();
    let is_numbered_device = ["COM", "LPT"].iter().any(|prefix| {
        let bytes = first_part.as_bytes();
        bytes.len() == 4
            && bytes[..3].eq_ignore_ascii_case(prefix.as_bytes())
            && matches!(bytes[3], b'1'..=b'9')
    });
    if reserved
        .iter()
        .any(|name| first_part.eq_ignore_ascii_case(name))
        || is_numbered_device
    {
        safe.insert(0, '_');
    }
    safe
}

fn creator_output_filename(title: &str, part: Option<u32>) -> String {
    match part {
        Some(number) => format!("{title} part {number} #fyp #viral.mp4"),
        None => format!("{title} #fyp #viral.mp4"),
    }
}

fn creator_font_file(app: &AppHandle) -> Option<PathBuf> {
    let resource_font = app
        .path()
        .resolve(
            format!("resources/fonts/{CREATOR_FONT_FILE}"),
            tauri::path::BaseDirectory::Resource,
        )
        .ok();
    let development_font = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources/fonts")
        .join(CREATOR_FONT_FILE);

    resource_font
        .filter(|path| path.is_file())
        .or_else(|| development_font.is_file().then_some(development_font))
}

fn creator_state_dir(output_root: &Path) -> PathBuf {
    output_root.join(".youwee-creator-state")
}

fn hide_creator_state_dir(path: &Path) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("attrib")
            .args(["+h", &path.to_string_lossy()])
            .status();
    }
}

/// Move marker files written by older creator builds into the hidden state
/// directory and remove stale title text sidecars.
fn migrate_legacy_creator_sidecars(output_root: &Path, state_root: &Path) {
    let Ok(entries) = std::fs::read_dir(output_root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let is_marker = name.starts_with(".youwee-creator-") && name.ends_with(".rendered");
        let is_title_file = name.starts_with(".youwee-creator-")
            && name.contains(".title-")
            && name.ends_with(".txt");
        if is_marker {
            let Some(new_name) = name.strip_prefix(".youwee-creator-") else {
                continue;
            };
            let target = state_root.join(new_name);
            if target.exists() {
                std::fs::remove_file(path).ok();
            } else if std::fs::rename(&path, &target).is_err() {
                // A copy fallback handles files on a different filesystem or
                // a transient Explorer lock without blocking the render.
                if std::fs::copy(&path, &target).is_ok() {
                    std::fs::remove_file(path).ok();
                }
            }
        } else if is_title_file {
            std::fs::remove_file(path).ok();
        }
    }
}

struct CreatorTempFiles {
    paths: Vec<PathBuf>,
}

impl Drop for CreatorTempFiles {
    fn drop(&mut self) {
        for path in &self.paths {
            std::fs::remove_file(path).ok();
        }
    }
}

fn escape_drawtext_font_path(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let normalized = normalized.strip_prefix("//?/").unwrap_or(&normalized);
    normalized
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace(',', "\\,")
        .replace(';', "\\;")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

fn output_key(input: &Path, options: &CreatorProcessingOptions) -> String {
    let mut hasher = Sha256::new();
    hasher.update(CREATOR_RENDER_VERSION.as_bytes());
    hasher.update(input.to_string_lossy().as_bytes());
    hasher.update(options.mode.as_bytes());
    hasher.update(options.split_by.as_deref().unwrap_or("duration").as_bytes());
    hasher.update(options.part_seconds.unwrap_or(60).to_le_bytes());
    hasher.update(options.part_count.unwrap_or(3).to_le_bytes());
    hasher.update(options.title.as_deref().unwrap_or("").as_bytes());
    hasher.update(options.encoder.as_deref().unwrap_or("libx264").as_bytes());
    if let Some(right) = &options.right_path {
        hasher.update(right.as_bytes());
    }
    hex::encode(hasher.finalize())[..16].to_string()
}

/// Height of the letterbox area above and below the square video. Landscape
/// sources add black padding inside the square, so these bands are larger than
/// the fixed 420px outer padding.
fn creator_black_band_height(width: i32, height: i32) -> f64 {
    if width <= 0 || height <= 0 {
        return 420.0;
    }
    let fitted_height = (1080.0 * f64::from(height) / f64::from(width)).min(1080.0);
    420.0 + (1080.0 - fitted_height) / 2.0
}

fn delete_creator_input_after_success(input: &Path, outputs: &[String]) -> Result<(), String> {
    let input_path = input
        .canonicalize()
        .map_err(|error| format!("Cannot resolve edited source video: {error}"))?;
    if outputs.is_empty() {
        return Err("Cannot delete source video because editing produced no output".to_string());
    }
    for output in outputs {
        let output_path = Path::new(output)
            .canonicalize()
            .map_err(|error| format!("Cannot verify edited output before cleanup: {error}"))?;
        if output_path == input_path {
            return Err(
                "Cannot delete source video because it is also an edited output".to_string(),
            );
        }
    }
    std::fs::remove_file(input)
        .map_err(|error| format!("Edited output is ready, but source cleanup failed: {error}"))
}

fn title_contains_cjk(value: &str) -> bool {
    value.chars().any(|character| {
        matches!(
            character as u32,
            0x2E80..=0x2FFF
                | 0x3040..=0x30FF
                | 0x3130..=0x318F
                | 0x31F0..=0x31FF
                | 0x3400..=0x9FFF
                | 0xAC00..=0xD7AF
                | 0xF900..=0xFAFF
                | 0x20000..=0x2FA1F
        )
    })
}

/// Break long titles into a small number of centered drawtext lines. FFmpeg's
/// `text_w` is calculated from the whole string, so a single long line is
/// clipped even when the title is centered. Word wrapping keeps the title in
/// the 1080px canvas and the final line is ellipsized when necessary.
fn wrap_title_for_drawtext(value: &str, max_chars: usize, max_lines: usize) -> String {
    let words: Vec<&str> = value.split_whitespace().collect();
    if words.is_empty() || max_chars == 0 || max_lines == 0 {
        return String::new();
    }

    let mut lines = Vec::new();
    let mut current = String::new();
    let mut truncated = false;
    'words: for word in &words {
        let chars: Vec<char> = word.chars().collect();
        if chars.len() > max_chars {
            if !current.is_empty() {
                lines.push(std::mem::take(&mut current));
                if lines.len() == max_lines {
                    truncated = true;
                    break;
                }
            }
            for chunk in chars.chunks(max_chars) {
                if lines.len() == max_lines {
                    truncated = true;
                    break 'words;
                }
                lines.push(chunk.iter().collect());
            }
            continue;
        }
        let word: String = chars.into_iter().collect();
        let candidate_len = if current.is_empty() {
            word.chars().count()
        } else {
            current.chars().count() + 1 + word.chars().count()
        };
        if !current.is_empty() && candidate_len > max_chars {
            lines.push(current);
            current = word;
            if lines.len() == max_lines {
                truncated = true;
                break;
            }
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(&word);
        }
    }
    if lines.len() < max_lines && !current.is_empty() {
        lines.push(current);
    }
    if truncated {
        if let Some(last) = lines.last_mut() {
            let mut chars: Vec<char> = last.chars().collect();
            while chars.len() + 3 > max_chars {
                chars.pop();
            }
            chars.extend(['.', '.', '.']);
            *last = chars.into_iter().collect();
        }
    }
    lines.join("\n")
}

fn codec_args(encoder: &str) -> Vec<String> {
    match encoder {
        "h264_nvenc" => vec![
            "-c:v",
            "h264_nvenc",
            "-preset",
            // P1 is the fastest NVENC preset. CQ still controls visual quality;
            // this avoids spending extra GPU time on the balanced preset when
            // the creator queue is processing many channel videos.
            "p1",
            "-cq",
            "23",
            "-b:v",
            "0",
        ],
        "h264_qsv" => vec!["-c:v", "h264_qsv", "-global_quality", "23"],
        "h264_amf" => vec![
            "-c:v", "h264_amf", "-quality", "balanced", "-qp_i", "23", "-qp_p", "23",
        ],
        _ => vec!["-c:v", "libx264", "-preset", "medium", "-crf", "20"],
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

async fn run_creator_ffmpeg(
    app: &AppHandle,
    input_path: &str,
    completed: u32,
    total: u32,
    duration_seconds: f64,
    ffmpeg_path: &Path,
    args: &[String],
    temp_path: &Path,
    final_path: &Path,
) -> Result<(), String> {
    let mut command = Command::new(ffmpeg_path);
    command
        .args(["-nostats", "-stats_period", "1", "-progress", "pipe:2"])
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    command.hide_window();
    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {e}"))?;
    let stderr = child.stderr.take().ok_or("Cannot read FFmpeg progress")?;
    // FFmpeg can write non-UTF-8 bytes in diagnostics (for example when a
    // filename contains a legacy Windows code page character). Reading with
    // `lines()` would turn that into a hard processing failure even though
    // the render itself may still be usable. Keep the progress parser
    // lossless and replace only invalid bytes for the UI/error log.
    let mut reader = BufReader::new(stderr);
    let mut line_bytes = Vec::new();
    let mut recent = std::collections::VecDeque::new();
    let mut silent_for = Duration::ZERO;
    loop {
        if CREATOR_CANCEL_REQUESTED.load(Ordering::Relaxed) {
            child.kill().await.ok();
            std::fs::remove_file(temp_path).ok();
            return Err("Creator processing cancelled".to_string());
        }
        line_bytes.clear();
        match tokio::time::timeout(
            Duration::from_secs(1),
            reader.read_until(b'\n', &mut line_bytes),
        )
        .await
        {
            Ok(Ok(0)) => break,
            Ok(Ok(_)) => {
                silent_for = Duration::ZERO;
                let line = String::from_utf8_lossy(&line_bytes)
                    .trim_end_matches(['\r', '\n'])
                    .to_string();
                if let Some(value) = line.strip_prefix("out_time_ms=") {
                    if let Ok(microseconds) = value.parse::<f64>() {
                        let current_seconds =
                            (microseconds / 1_000_000.0).max(0.0).min(duration_seconds);
                        let percent = if duration_seconds > 0.0 {
                            (current_seconds / duration_seconds * 100.0).clamp(0.0, 100.0)
                        } else {
                            0.0
                        };
                        app.emit(
                            "creator-processing-progress",
                            serde_json::json!({
                                "inputPath": input_path,
                                "completed": completed,
                                "total": total,
                                "currentSeconds": current_seconds,
                                "durationSeconds": duration_seconds,
                                "percent": percent,
                            }),
                        )
                        .ok();
                    }
                }
                if recent.len() == 30 {
                    recent.pop_front();
                }
                recent.push_back(line);
            }
            Ok(Err(error)) => {
                child.kill().await.ok();
                std::fs::remove_file(temp_path).ok();
                return Err(format!("Cannot read FFmpeg progress: {error}"));
            }
            Err(_) => {
                silent_for += Duration::from_secs(1);
                if silent_for >= Duration::from_secs(90) {
                    child.kill().await.ok();
                    std::fs::remove_file(temp_path).ok();
                    return Err("FFmpeg did not respond for 90 seconds".to_string());
                }
            }
        }
    }
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Cannot wait for FFmpeg: {e}"))?;
    if !status.success() {
        std::fs::remove_file(temp_path).ok();
        let detail = recent
            .iter()
            .rev()
            .find(|line| !line.trim().is_empty())
            .map(String::as_str)
            .unwrap_or("FFmpeg failed");
        return Err(detail.to_string());
    }
    if !temp_path.is_file() || temp_path.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        return Err("FFmpeg produced an empty output".to_string());
    }
    if final_path.exists() {
        return Err(format!("Output already exists: {}", final_path.display()));
    }
    std::fs::rename(temp_path, final_path).map_err(|e| format!("Cannot finalize output: {e}"))
}

async fn run_with_cpu_fallback(
    app: &AppHandle,
    ffmpeg_path: &Path,
    args: Vec<String>,
    encoder: &str,
    temp_path: &Path,
    final_path: &Path,
    input_path: &str,
    completed: u32,
    total: u32,
    duration_seconds: f64,
) -> Result<(), String> {
    match run_creator_ffmpeg(
        app,
        input_path,
        completed,
        total,
        duration_seconds,
        ffmpeg_path,
        &args,
        temp_path,
        final_path,
    )
    .await
    {
        Ok(()) => {
            if encoder != "libx264" {
                app.emit(
                    "creator-processing-encoder",
                    serde_json::json!({
                        "requested": encoder,
                        "actual": encoder,
                        "fallback": false,
                    }),
                )
                .ok();
            }
            Ok(())
        }
        Err(first_error) if encoder != "libx264" => {
            log::warn!("Creator encoder {encoder} failed; falling back to libx264: {first_error}");
            app.emit(
                "creator-processing-encoder",
                serde_json::json!({
                    "requested": encoder,
                    "actual": "libx264",
                    "fallback": true,
                    "error": first_error.clone(),
                }),
            )
            .ok();
            let mut fallback = args;
            let codec_start = fallback
                .iter()
                .position(|arg| arg == "-c:v")
                .ok_or_else(|| first_error.clone())?;
            let audio_start = fallback[codec_start + 1..]
                .iter()
                .position(|arg| arg == "-c:a")
                .map(|index| codec_start + 1 + index)
                .ok_or_else(|| first_error.clone())?;
            fallback.splice(codec_start..audio_start, codec_args("libx264"));
            run_creator_ffmpeg(
                app,
                input_path,
                completed,
                total,
                duration_seconds,
                ffmpeg_path,
                &fallback,
                temp_path,
                final_path,
            )
            .await
            .map_err(|fallback_error| format!("GPU: {first_error}; CPU: {fallback_error}"))
        }
        Err(error) => Err(error),
    }
}

fn record_creator_outputs(input_path: &str, mode: &str, outputs: &[String]) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    for output in outputs {
        let already_in_library = {
            let conn = get_db()?;
            conn.execute(
                "INSERT INTO processing_jobs (id, input_path, output_path, task_type, user_prompt, ffmpeg_command, status, progress, created_at, completed_at)
                 SELECT ?1, ?2, ?3, ?4, NULL, ?5, 'completed', 100, ?6, ?6
                 WHERE NOT EXISTS (
                     SELECT 1 FROM processing_jobs WHERE input_path = ?2 AND output_path = ?3 AND task_type = ?4
                 )",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    input_path,
                    output,
                    format!("creator-{mode}"),
                    "managed creator processing",
                    now,
                ],
            )
            .map_err(|e| format!("Failed to save creator processing history: {e}"))?;

            // Guard by filepath because a resumed persistent job may discover an
            // already-rendered part.
            conn.query_row(
                "SELECT COUNT(*) FROM history WHERE filepath = ?1",
                params![output],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| format!("Failed to inspect creator output history: {e}"))?
        };

        // Creator outputs are real user-facing media, so keep them in Library as
        // well as the technical processing log.
        if already_in_library == 0 {
            let output_path = Path::new(output);
            let title = output_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Edited video")
                .to_string();
            let filesize = output_path.metadata().ok().map(|metadata| metadata.len());
            add_history_internal(
                input_path.to_string(),
                title,
                None,
                output.to_string(),
                filesize,
                None,
                Some("edited".to_string()),
                output_path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(str::to_string),
                Some(format!("creator-{mode}")),
                None,
            )
            .map_err(|e| format!("Failed to add creator output to Library: {e}"))?;
        }
    }
    Ok(())
}

async fn verify_creator_output(
    app: &AppHandle,
    path: &Path,
    width: i32,
    height: i32,
    min_duration: f64,
) -> Result<(), String> {
    let metadata = get_video_metadata(app.clone(), path.to_string_lossy().to_string()).await?;
    if metadata.width != width || metadata.height != height || metadata.duration < min_duration {
        return Err(format!(
            "Rendered video failed validation: {}",
            path.display()
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn process_creator_video(
    app: AppHandle,
    input_path: String,
    options: CreatorProcessingOptions,
) -> Result<CreatorProcessingResult, String> {
    let input = PathBuf::from(&input_path);
    if !input.is_file() {
        return Err("Downloaded video no longer exists".to_string());
    }
    let output_root = PathBuf::from(&options.output_folder);
    let ffmpeg = get_ffmpeg_path(&app).await.ok_or("FFmpeg not found")?;
    let metadata = get_video_metadata(app.clone(), input_path.clone()).await?;
    let encoder = options.encoder.as_deref().unwrap_or("libx264");
    if !metadata.duration.is_finite() || metadata.duration <= 0.0 {
        return Err("Input video has no valid duration".to_string());
    }
    let stem = safe_stem(&input);
    let title = safe_filename_component(
        options
            .title
            .as_deref()
            .filter(|title| !title.trim().is_empty())
            .unwrap_or(&stem),
    );
    let font_path = if matches!(options.mode.as_str(), "parts" | "portrait") {
        Some(creator_font_file(&app).ok_or("Bundled Noto Sans CJK font is unavailable")?)
    } else {
        None
    };
    std::fs::create_dir_all(&output_root)
        .map_err(|e| format!("Cannot create output folder: {e}"))?;
    let mut outputs = Vec::new();

    if options.mode == "duet" {
        let right_root = options
            .right_folder
            .as_deref()
            .map(PathBuf::from)
            .ok_or("RIGHT folder is not configured")?;
        let right_canonical = right_root
            .canonicalize()
            .map_err(|e| format!("RIGHT folder unavailable: {e}"))?;
        let output_canonical = output_root
            .canonicalize()
            .map_err(|e| format!("Output folder unavailable: {e}"))?;
        if output_canonical.starts_with(&right_canonical)
            || right_canonical.starts_with(&output_canonical)
        {
            return Err("Output folder must be separate from RIGHT folder".to_string());
        }
        let mut right_files = Vec::new();
        scan_video_files(&right_root, &mut right_files)?;
        if right_files.is_empty() {
            return Err("RIGHT folder contains no supported videos".to_string());
        }
        let mut seed_hash = Sha256::new();
        seed_hash.update(input.to_string_lossy().as_bytes());
        seed_hash.update(right_root.to_string_lossy().as_bytes());
        let seed = seed_hash.finalize();
        let index = u64::from_le_bytes(seed[..8].try_into().unwrap_or_default()) as usize
            % right_files.len();
        let right = if let Some(saved) = options.right_path.as_deref() {
            let path = PathBuf::from(saved);
            if !path.is_file() {
                return Err("Saved RIGHT video is unavailable".to_string());
            }
            path
        } else {
            right_files.sort();
            right_files[index].clone()
        };
        let mut render_options = options.clone();
        render_options.right_path = Some(right.to_string_lossy().to_string());
        let key = output_key(&input, &render_options);
        let final_path = output_root.join(creator_output_filename(&title, None));
        let output_is_valid = if final_path.is_file() {
            match verify_creator_output(&app, &final_path, 1040, 1080, metadata.duration - 2.0)
                .await
            {
                Ok(()) => true,
                Err(error) => {
                    log::warn!("Removing invalid existing creator output: {error}");
                    std::fs::remove_file(&final_path).map_err(|remove_error| {
                        format!("Cannot replace invalid creator output: {remove_error}")
                    })?;
                    false
                }
            }
        } else {
            false
        };
        if output_is_valid {
            outputs.push(final_path.to_string_lossy().to_string());
        } else {
            let temp_path = output_root.join(format!(".{title}__{key}__duet.tmp.mp4"));
            let mut args = vec![
                "-y".into(), "-i".into(), input_path.clone(), "-stream_loop".into(), "-1".into(),
                "-i".into(), right.to_string_lossy().to_string(), "-filter_complex".into(),
                "[0:v]scale=520:1080:force_original_aspect_ratio=increase,crop=520:1080,setsar=1[left];[1:v]scale=520:1080:force_original_aspect_ratio=increase,crop=520:1080,setsar=1[right];[left][right]hstack=inputs=2:shortest=1,format=yuv420p[v]".into(),
                "-map".into(), "[v]".into(), "-map".into(), "0:a?".into(), "-t".into(), metadata.duration.to_string(),
            ];
            args.extend(codec_args(encoder));
            args.extend([
                "-c:a".into(),
                "aac".into(),
                "-movflags".into(),
                "+faststart".into(),
                temp_path.to_string_lossy().to_string(),
            ]);
            run_with_cpu_fallback(
                &app,
                &ffmpeg,
                args,
                encoder,
                &temp_path,
                &final_path,
                &input_path,
                0,
                1,
                metadata.duration,
            )
            .await?;
            verify_creator_output(&app, &final_path, 1040, 1080, metadata.duration - 2.0).await?;
            outputs.push(final_path.to_string_lossy().to_string());
            app.emit(
                "creator-processing-progress",
                serde_json::json!({
                    "inputPath": input_path, "completed": 1, "total": 1
                }),
            )
            .ok();
        }
    } else if matches!(options.mode.as_str(), "parts" | "portrait") {
        let state_root = creator_state_dir(&output_root);
        std::fs::create_dir_all(&state_root)
            .map_err(|error| format!("Cannot create creator state folder: {error}"))?;
        hide_creator_state_dir(&state_root);
        migrate_legacy_creator_sidecars(&output_root, &state_root);

        let key = output_key(&input, &options);
        let part_seconds = options.part_seconds.unwrap_or(60).clamp(1, 86_400);
        let split_parts = options.mode == "parts";
        let split_by_count = split_parts && options.split_by.as_deref() == Some("count");
        let total_parts = if split_by_count {
            options.part_count.unwrap_or(3).clamp(1, 1_000)
        } else if split_parts {
            (metadata.duration / f64::from(part_seconds))
                .ceil()
                .max(1.0) as u32
        } else {
            1
        };
        let segment_duration = if split_by_count {
            metadata.duration / f64::from(total_parts)
        } else {
            f64::from(part_seconds)
        };
        let title_max_chars = if title_contains_cjk(&title) { 18 } else { 30 };
        let title_lines: Vec<String> = wrap_title_for_drawtext(&title, title_max_chars, 2)
            .lines()
            .map(ToOwned::to_owned)
            .collect();
        let black_band_height = creator_black_band_height(metadata.width, metadata.height);
        let bottom_band_start = 1920.0 - black_band_height;
        let fontfile =
            escape_drawtext_font_path(font_path.as_deref().ok_or("Font file is unavailable")?);
        let mut title_text_files = CreatorTempFiles { paths: Vec::new() };
        let mut title_drawtext = String::new();
        for (line_index, line) in title_lines.iter().enumerate() {
            let text_path = state_root.join(format!("{key}.title-{}.txt", line_index + 1));
            title_text_files.paths.push(text_path.clone());
            std::fs::write(&text_path, line)
                .map_err(|error| format!("Cannot prepare title text: {error}"))?;
            let textfile = escape_drawtext_font_path(&text_path);
            let lines_below = title_lines.len().saturating_sub(1) * CREATOR_LINE_SPACING;
            let y = format!(
                "({black_band_height:.3}-(text_h+{lines_below}))/2+{}",
                line_index * CREATOR_LINE_SPACING
            );
            title_drawtext.push_str(&format!(
                ",drawtext=fontfile='{fontfile}':textfile='{textfile}':expansion=none:fontcolor=white:fontsize=54:x=(w-text_w)/2:y={y}:fix_bounds=1"
            ));
        }
        for part in 0..total_parts {
            let part_number = (split_parts && total_parts > 1).then_some(part + 1);
            let final_path = output_root.join(creator_output_filename(&title, part_number));
            let render_marker = state_root.join(format!("{key}_part_{:03}.rendered", part + 1));
            let mut previous_output = None;
            if final_path.is_file() && final_path.metadata().map(|item| item.len()).unwrap_or(0) > 0
            {
                let expected = if split_parts {
                    (metadata.duration - f64::from(part) * segment_duration).min(segment_duration)
                } else {
                    metadata.duration
                };
                let marker_is_current = std::fs::read_to_string(&render_marker)
                    .map(|version| version.trim() == CREATOR_RENDER_VERSION)
                    .unwrap_or(false);
                match verify_creator_output(&app, &final_path, 1080, 1920, expected - 2.0).await {
                    Ok(()) if marker_is_current => {
                        outputs.push(final_path.to_string_lossy().to_string());
                        continue;
                    }
                    Ok(()) => {
                        let backup_path = output_root.join(format!(
                            ".youwee-creator-{}.previous.mp4",
                            uuid::Uuid::new_v4()
                        ));
                        std::fs::rename(&final_path, &backup_path).map_err(|error| {
                            format!("Cannot preserve previous creator output: {error}")
                        })?;
                        previous_output = Some(backup_path);
                    }
                    Err(error) => {
                        log::warn!("Removing invalid existing creator output: {error}");
                        std::fs::remove_file(&final_path).map_err(|remove_error| {
                            format!("Cannot replace invalid creator output: {remove_error}")
                        })?;
                    }
                }
            }
            let temp_path =
                output_root.join(format!(".{title}__{key}_part_{:03}.tmp.mp4", part + 1));
            let part_drawtext = if let Some(part_number) = part_number {
                format!(
                    ",drawtext=fontfile='{fontfile}':text=Part {part_number}/{total_parts}:fontcolor=white:fontsize=54:x=(w-text_w)/2:y={bottom_band_start:.3}+({black_band_height:.3}-text_h)/2:fix_bounds=1"
                )
            } else {
                String::new()
            };
            let filter = format!(
                "[0:v]scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black,pad=1080:1920:0:420:black{title_drawtext}{part_drawtext},format=yuv420p[v]"
            );
            let mut args = vec!["-y".into()];
            if split_parts {
                args.extend([
                    "-ss".into(),
                    format!("{:.3}", f64::from(part) * segment_duration),
                ]);
            }
            args.extend([
                "-i".into(),
                input_path.clone(),
                "-t".into(),
                if split_parts {
                    format!("{segment_duration:.3}")
                } else {
                    metadata.duration.to_string()
                },
                "-filter_complex".into(),
                filter,
                "-map".into(),
                "[v]".into(),
                "-map".into(),
                "0:a?".into(),
            ]);
            args.extend(codec_args(encoder));
            args.extend([
                "-c:a".into(),
                "aac".into(),
                "-movflags".into(),
                "+faststart".into(),
                temp_path.to_string_lossy().to_string(),
            ]);
            let current_duration = if split_parts {
                (metadata.duration - f64::from(part) * segment_duration).min(segment_duration)
            } else {
                metadata.duration
            };
            if let Err(error) = run_with_cpu_fallback(
                &app,
                &ffmpeg,
                args,
                encoder,
                &temp_path,
                &final_path,
                &input_path,
                part,
                total_parts,
                current_duration,
            )
            .await
            {
                if let Some(backup_path) = previous_output.take() {
                    std::fs::rename(backup_path, &final_path).ok();
                }
                return Err(error);
            }
            let expected = if split_parts {
                (metadata.duration - f64::from(part) * segment_duration).min(segment_duration)
            } else {
                metadata.duration
            };
            if let Err(error) =
                verify_creator_output(&app, &final_path, 1080, 1920, expected - 2.0).await
            {
                std::fs::remove_file(&final_path).ok();
                if let Some(backup_path) = previous_output.take() {
                    std::fs::rename(backup_path, &final_path).ok();
                }
                return Err(error);
            }
            if let Err(error) = std::fs::write(&render_marker, CREATOR_RENDER_VERSION) {
                log::warn!("Cannot save creator render marker: {error}");
            }
            if let Some(backup_path) = previous_output {
                std::fs::remove_file(backup_path).ok();
            }
            outputs.push(final_path.to_string_lossy().to_string());
            app.emit(
                "creator-processing-progress",
                serde_json::json!({
                    "inputPath": input_path, "completed": part + 1, "total": total_parts
                }),
            )
            .ok();
        }
        drop(title_text_files);
    } else {
        return Err("Unsupported creator processing mode".to_string());
    }

    record_creator_outputs(&input_path, &options.mode, &outputs)?;
    if options.delete_input_after_success {
        delete_creator_input_after_success(&input, &outputs)?;
    }
    Ok(CreatorProcessingResult {
        output_paths: outputs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creator_output_names_only_contain_title_parts_and_requested_hashtags() {
        assert_eq!(
            creator_output_filename("A video title", Some(2)),
            "A video title part 2 #fyp #viral.mp4"
        );
        assert_eq!(
            creator_output_filename("A short title", None),
            "A short title #fyp #viral.mp4"
        );
    }

    #[test]
    fn filename_components_are_safe_for_windows_paths() {
        assert_eq!(safe_filename_component("  A/B: title.  "), "A_B_ title");
        assert_eq!(safe_filename_component("CON"), "_CON");
        assert_eq!(safe_filename_component("..."), "video");
    }

    #[test]
    fn drawtext_font_path_escapes_windows_drive_letter() {
        assert_eq!(
            escape_drawtext_font_path(Path::new(r"C:\Windows\Fonts\arial.ttf")),
            r"C\:/Windows/Fonts/arial.ttf"
        );
        assert_eq!(
            escape_drawtext_font_path(Path::new(r"\\?\C:\Windows\Fonts\arial.ttf")),
            r"C\:/Windows/Fonts/arial.ttf"
        );
    }

    #[test]
    fn output_key_changes_with_source_and_render_settings() {
        let mut options = CreatorProcessingOptions {
            mode: "parts".to_string(),
            right_folder: None,
            output_folder: "out".to_string(),
            split_by: Some("duration".to_string()),
            part_seconds: Some(60),
            part_count: Some(3),
            title: Some("Title".to_string()),
            encoder: Some("libx264".to_string()),
            right_path: None,
            delete_input_after_success: false,
        };
        let first = output_key(Path::new("channel-a/video.mp4"), &options);
        assert_ne!(
            first,
            output_key(Path::new("channel-b/video.mp4"), &options)
        );
        options.part_seconds = Some(90);
        assert_ne!(
            first,
            output_key(Path::new("channel-a/video.mp4"), &options)
        );
    }

    #[test]
    fn long_titles_are_wrapped_and_ellipsized() {
        let wrapped = wrap_title_for_drawtext(
            "The IRS Will Literally Pay You To Make These Investments Before Retirement",
            20,
            2,
        );
        assert!(wrapped.contains('\n'));
        assert!(wrapped.lines().count() <= 2);
        assert!(wrapped.lines().all(|line| line.chars().count() <= 20));
        assert!(wrapped.ends_with("..."));
    }

    #[test]
    fn creator_titles_support_japanese_and_korean_font_sizing() {
        assert!(title_contains_cjk("新しい動画のタイトル"));
        assert!(title_contains_cjk("한국어 제목"));
        assert!(!title_contains_cjk("A Latin title"));
        let wrapped = wrap_title_for_drawtext(
            "新しい動画のタイトルこれはとても長いです日本語フォント確認用",
            10,
            2,
        );
        assert!(wrapped.lines().count() <= 2);
        assert!(wrapped.lines().all(|line| line.chars().count() <= 10));
        assert!(wrapped.ends_with("..."));
    }

    #[test]
    fn creator_titles_are_centered_in_source_letterbox_bands() {
        assert_eq!(creator_black_band_height(1080, 1920), 420.0);
        assert_eq!(creator_black_band_height(1920, 1080), 656.25);
    }
}
