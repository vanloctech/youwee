use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::process::Command;

use crate::database::{
    add_history_internal, assign_history_collections_in_db, delete_history_from_db,
    ensure_collection_for_download_in_db,
};
use crate::services::get_ffmpeg_path;
use crate::utils::{sanitize_filename_part, CommandExt};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSplitSegmentRequest {
    pub name: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSplitRequest {
    pub input_path: String,
    pub source_url: String,
    pub parent_title: String,
    pub thumbnail: Option<String>,
    pub source: Option<String>,
    pub quality: Option<String>,
    pub format: Option<String>,
    pub auto_collection: Option<bool>,
    pub delete_original: Option<bool>,
    pub segments: Vec<MediaSplitSegmentRequest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSplitSegmentResult {
    pub history_id: String,
    pub title: String,
    pub filepath: String,
    pub filesize: Option<u64>,
    pub duration: u64,
    pub time_range: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaSplitResult {
    pub output_dir: String,
    pub segments: Vec<MediaSplitSegmentResult>,
}

fn format_timestamp(total_seconds: f64) -> String {
    let seconds = total_seconds.max(0.0).round() as u64;
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    format!("{hours:02}:{minutes:02}:{secs:02}")
}

fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "segment".to_string());
    let extension = path.extension().map(|value| value.to_os_string());

    for index in 2..10_000 {
        let mut filename = format!("{stem} ({index})");
        if let Some(ext) = &extension {
            filename.push('.');
            filename.push_str(&ext.to_string_lossy());
        }
        let candidate = parent.join(filename);
        if !candidate.exists() {
            return candidate;
        }
    }

    path
}

fn validate_segment(segment: &MediaSplitSegmentRequest) -> Result<(), String> {
    if !segment.start_seconds.is_finite() || !segment.end_seconds.is_finite() {
        return Err("Segment time is invalid".to_string());
    }
    if segment.start_seconds < 0.0 || segment.end_seconds <= segment.start_seconds {
        return Err("Segment start time must be before end time".to_string());
    }
    Ok(())
}

async fn rollback_split_outputs(output_paths: &[PathBuf], history_ids: &[String]) {
    for history_id in history_ids {
        let _ = delete_history_from_db(history_id.clone());
    }
    for output_path in output_paths {
        let _ = tokio::fs::remove_file(output_path).await;
    }
}

#[tauri::command]
pub async fn split_media_segments(
    app: AppHandle,
    request: MediaSplitRequest,
) -> Result<MediaSplitResult, String> {
    let ffmpeg_path = get_ffmpeg_path(&app)
        .await
        .ok_or_else(|| "FFmpeg is required to split media files.".to_string())?;

    let input_path = PathBuf::from(request.input_path.trim());
    if !input_path.exists() || !input_path.is_file() {
        return Err("Media file not found".to_string());
    }
    if request.segments.is_empty() {
        return Err("Add at least one segment before splitting".to_string());
    }
    for segment in &request.segments {
        validate_segment(segment)?;
    }

    let parent_dir = input_path
        .parent()
        .ok_or_else(|| "Cannot determine media folder".to_string())?;
    let parent_title = sanitize_filename_part(&request.parent_title, "Media");
    let output_dir = parent_dir.join(format!("{parent_title} - segments"));
    tokio::fs::create_dir_all(&output_dir)
        .await
        .map_err(|e| format!("Failed to create segment folder: {}", e))?;

    let extension = input_path
        .extension()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            request
                .format
                .clone()
                .unwrap_or_else(|| "mp4".to_string())
                .trim_start_matches('.')
                .to_string()
        });

    let collection_id = if request.auto_collection.unwrap_or(false) {
        Some(
            ensure_collection_for_download_in_db(
                &request.parent_title,
                Some("#f43f7f".to_string()),
            )
            .map(|collection| collection.id)?,
        )
    } else {
        None
    };

    let mut results = Vec::with_capacity(request.segments.len());
    let mut created_output_paths = Vec::with_capacity(request.segments.len());
    let mut created_history_ids = Vec::with_capacity(request.segments.len());
    for (index, segment) in request.segments.iter().enumerate() {
        let default_name = format!("Part {:02}", index + 1);
        let segment_name = sanitize_filename_part(&segment.name, &default_name);
        let filename = format!("{:02} - {segment_name}.{extension}", index + 1);
        let output_path = unique_path(output_dir.join(filename));
        let start = format_timestamp(segment.start_seconds);
        let end = format_timestamp(segment.end_seconds);

        let mut cmd = Command::new(&ffmpeg_path);
        cmd.args([
            "-hide_banner",
            "-nostdin",
            "-y",
            "-ss",
            &start,
            "-to",
            &end,
            "-i",
        ])
        .arg(&input_path)
        .args(["-map", "0", "-c", "copy", "-avoid_negative_ts", "make_zero"])
        .arg(&output_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
        cmd.hide_window();

        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            rollback_split_outputs(&created_output_paths, &created_history_ids).await;
            return Err(format!(
                "FFmpeg failed while splitting {}: {}",
                segment_name,
                stderr.lines().last().unwrap_or("unknown error")
            ));
        }

        let filesize = tokio::fs::metadata(&output_path)
            .await
            .ok()
            .map(|m| m.len());
        let filepath = output_path.to_string_lossy().to_string();
        let duration = (segment.end_seconds - segment.start_seconds)
            .round()
            .max(0.0) as u64;
        let time_range = format!("{start}-{end}");
        let history_id = match add_history_internal(
            request.source_url.clone(),
            segment_name.clone(),
            request.thumbnail.clone(),
            filepath.clone(),
            filesize,
            Some(duration),
            request.quality.clone(),
            Some(extension.clone()),
            request.source.clone(),
            Some(time_range.clone()),
        ) {
            Ok(history_id) => history_id,
            Err(error) => {
                let mut rollback_paths = created_output_paths.clone();
                rollback_paths.push(output_path.clone());
                rollback_split_outputs(&rollback_paths, &created_history_ids).await;
                return Err(error);
            }
        };

        created_output_paths.push(output_path.clone());
        created_history_ids.push(history_id.clone());

        if let Some(collection_id) = &collection_id {
            if let Err(error) =
                assign_history_collections_in_db(history_id.clone(), vec![collection_id.clone()])
            {
                rollback_split_outputs(&created_output_paths, &created_history_ids).await;
                return Err(error);
            }
        }

        results.push(MediaSplitSegmentResult {
            history_id,
            title: segment_name,
            filepath,
            filesize,
            duration,
            time_range,
        });
    }

    if request.delete_original.unwrap_or(false) {
        let metadata = tokio::fs::symlink_metadata(&input_path)
            .await
            .map_err(|e| format!("Failed to inspect original file before deleting: {}", e))?;
        if metadata.is_dir() {
            return Err("Refusing to delete original media because it is a directory".to_string());
        }
        tokio::fs::remove_file(&input_path)
            .await
            .map_err(|e| format!("Failed to delete original media file: {}", e))?;
    }

    Ok(MediaSplitResult {
        output_dir: output_dir.to_string_lossy().to_string(),
        segments: results,
    })
}
