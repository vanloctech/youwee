//! Metadata command - fetches video metadata without downloading
//!
//! Supports: info.json, description, comments, thumbnail

use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::database::{add_history_internal, add_log_internal};
use crate::services::get_ytdlp_path;
use crate::utils::{sanitize_output_path, CommandExt};

pub static METADATA_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

#[derive(Clone, serde::Serialize)]
pub struct MetadataProgress {
    pub id: String,
    pub status: String, // "fetching", "finished", "error"
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub error_message: Option<String>,
}

#[tauri::command]
pub fn cancel_metadata_fetch() {
    METADATA_CANCEL_FLAG.store(true, Ordering::SeqCst);
}

/// Split comments from info.json into separate files
fn split_info_json_and_comments(
    output_dir: &str,
    title: &str,
    write_info_json: bool,
    write_comments: bool,
) -> Result<(), String> {
    // Sanitize title for filename (remove invalid chars)
    let safe_title = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>();

    let info_json_path = Path::new(output_dir).join(format!("{}.info.json", safe_title));

    if !info_json_path.exists() {
        return Ok(()); // No info.json to process
    }

    // Read the original info.json
    let content = std::fs::read_to_string(&info_json_path)
        .map_err(|e| format!("Failed to read info.json: {}", e))?;

    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse info.json: {}", e))?;

    // Extract comments if they exist
    let comments = json.get("comments").cloned();
    let comment_count = json.get("comment_count").cloned();

    if write_comments {
        if let Some(ref comments_data) = comments {
            // Write comments to separate file
            let comments_path = Path::new(output_dir).join(format!("{}.comments.json", safe_title));
            let comments_json = serde_json::json!({
                "video_id": json.get("id"),
                "video_title": json.get("title"),
                "comment_count": comment_count,
                "comments": comments_data
            });
            let comments_str = serde_json::to_string_pretty(&comments_json)
                .map_err(|e| format!("Failed to serialize comments: {}", e))?;
            std::fs::write(&comments_path, comments_str)
                .map_err(|e| format!("Failed to write comments.json: {}", e))?;
        }
    }

    // If user wants info.json without comments, remove comments from it
    if write_info_json && write_comments {
        // Remove comments from info.json to keep it clean
        if let Some(obj) = json.as_object_mut() {
            obj.remove("comments");
        }
        let clean_info = serde_json::to_string_pretty(&json)
            .map_err(|e| format!("Failed to serialize info.json: {}", e))?;
        std::fs::write(&info_json_path, clean_info)
            .map_err(|e| format!("Failed to write clean info.json: {}", e))?;
    } else if !write_info_json && write_comments {
        // User only wanted comments, delete the info.json
        std::fs::remove_file(&info_json_path).ok();
    }

    Ok(())
}

#[tauri::command]
pub async fn fetch_metadata(
    app: AppHandle,
    id: String,
    url: String,
    output_path: String,
    write_info_json: bool,
    write_description: bool,
    write_comments: bool,
    write_thumbnail: bool,
) -> Result<(), String> {
    METADATA_CANCEL_FLAG.store(false, Ordering::SeqCst);

    let sanitized_path = sanitize_output_path(&output_path)?;
    // Use title only without extension - yt-dlp will add .info.json, .description, .jpg etc
    let output_template = format!("{}/%(title)s", sanitized_path);

    let mut args = vec![
        "--skip-download".to_string(),
        "--no-warnings".to_string(),
        "--no-simulate".to_string(), // Actually write files even with --print
        "-o".to_string(),
        output_template.clone(),
    ];

    // Description uses separate output template with .txt extension
    if write_description {
        args.push("-o".to_string());
        args.push(format!(
            "description:{}/%(title)s.description.txt",
            sanitized_path
        ));
    }

    // Comments require info.json to be written first, then we'll split them
    let need_info_json = write_info_json || write_comments;

    // Info JSON - full metadata (we'll split comments out later if needed)
    if need_info_json {
        args.push("--write-info-json".to_string());
        args.push("--no-clean-info-json".to_string()); // Keep all fields
    }

    // Description file (output template already set above)
    if write_description {
        args.push("--write-description".to_string());
    }

    // Comments (stored in info.json, we'll extract to separate file)
    if write_comments {
        args.push("--write-comments".to_string());
    }

    // Thumbnail
    if write_thumbnail {
        args.push("--write-thumbnail".to_string());
        args.push("--convert-thumbnails".to_string());
        args.push("jpg".to_string());
    }

    // Print JSON info for parsing
    args.push("--print".to_string());
    args.push("%(title)s|||%(thumbnail)s|||%(duration)s".to_string());

    args.push(url.clone());

    // Emit initial progress
    app.emit(
        "metadata-progress",
        MetadataProgress {
            id: id.clone(),
            status: "fetching".to_string(),
            title: None,
            thumbnail: None,
            error_message: None,
        },
    )
    .ok();

    // Get yt-dlp path
    if let Some((binary_path, _)) = get_ytdlp_path(&app).await {
        let home_dir = std::env::var("HOME").unwrap_or_else(|_| "/Users".to_string());
        let current_path = std::env::var("PATH").unwrap_or_default();
        let extended_path = format!(
            "{}/.deno/bin:{}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:{}",
            home_dir, home_dir, current_path
        );

        // Log command
        let command_str = format!("{} {}", binary_path.display(), args.join(" "));
        add_log_internal("command", &command_str, None, Some(&url)).ok();

        let mut cmd = Command::new(&binary_path);
        cmd.args(&args)
            .env("HOME", &home_dir)
            .env("PATH", &extended_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd.hide_window();

        let mut process = cmd
            .spawn()
            .map_err(|e| format!("Failed to start yt-dlp: {}", e))?;

        let stdout = process
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture stdout".to_string())?;
        let stderr = process
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture stderr".to_string())?;

        let mut stdout_reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        let mut video_title: Option<String> = None;
        let mut video_thumbnail: Option<String> = None;
        let mut video_duration: Option<i64> = None;
        let mut error_message: Option<String> = None;

        loop {
            if METADATA_CANCEL_FLAG.load(Ordering::SeqCst) {
                process.kill().await.ok();
                add_log_internal("info", "Metadata fetch cancelled by user", None, Some(&url)).ok();
                return Err("Metadata fetch cancelled".to_string());
            }

            tokio::select! {
                line = stdout_reader.next_line() => {
                    match line {
                        Ok(Some(text)) => {
                            // Parse title|||thumbnail|||duration format
                            if video_title.is_none() && text.contains("|||") {
                                let parts: Vec<&str> = text.split("|||").collect();
                                if parts.len() >= 3 {
                                    video_title = Some(parts[0].to_string());
                                    if parts[1] != "NA" && !parts[1].is_empty() {
                                        video_thumbnail = Some(parts[1].to_string());
                                    }
                                    if let Ok(dur) = parts[2].parse::<f64>() {
                                        video_duration = Some(dur as i64);
                                    }

                                    app.emit("metadata-progress", MetadataProgress {
                                        id: id.clone(),
                                        status: "fetching".to_string(),
                                        title: video_title.clone(),
                                        thumbnail: video_thumbnail.clone(),
                                        error_message: None,
                                    }).ok();
                                }
                            } else if video_title.is_none() && !text.is_empty() && !text.starts_with("[") {
                                video_title = Some(text.clone());
                                app.emit("metadata-progress", MetadataProgress {
                                    id: id.clone(),
                                    status: "fetching".to_string(),
                                    title: Some(text),
                                    thumbnail: None,
                                    error_message: None,
                                }).ok();
                            }
                        }
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
                line = stderr_reader.next_line() => {
                    match line {
                        Ok(Some(text)) => {
                            // Log stderr
                            if !text.is_empty() {
                                add_log_internal("stderr", &text, None, Some(&url)).ok();
                            }
                            if text.contains("ERROR") {
                                error_message = Some(text.clone());
                            }
                        }
                        Ok(None) => {}
                        Err(_) => {}
                    }
                }
            }
        }

        let status = process
            .wait()
            .await
            .map_err(|e| format!("Process error: {}", e))?;

        if status.success() {
            let title = video_title.clone().unwrap_or_else(|| "Unknown".to_string());

            // Post-process: split comments into separate file
            if write_comments || (write_info_json && write_comments) {
                if let Err(e) =
                    split_info_json_and_comments(&sanitized_path, &title, write_info_json, write_comments)
                {
                    add_log_internal("stderr", &format!("Post-process warning: {}", e), None, Some(&url))
                        .ok();
                }
            }

            // Build output file info
            let mut files_saved = Vec::new();
            if write_info_json {
                files_saved.push("info.json");
            }
            if write_comments {
                files_saved.push("comments.json");
            }
            if write_description {
                files_saved.push("description.txt");
            }
            if write_thumbnail {
                files_saved.push("thumbnail.jpg");
            }

            let success_msg = format!("Metadata fetched: {} ({})", title, files_saved.join(", "));
            add_log_internal("success", &success_msg, None, Some(&url)).ok();

            // Save to library/history
            add_history_internal(
                url.clone(),
                title.clone(),
                video_thumbnail.clone(),
                sanitized_path.clone(),           // filepath = output folder
                None,                             // filesize
                video_duration.map(|d| d as u64), // duration as u64
                Some("metadata".to_string()),    // quality field used for type
                Some(files_saved.join(", ")),    // format field used for what was saved
                Some("metadata".to_string()),    // source
            )
            .ok();

            app.emit(
                "metadata-progress",
                MetadataProgress {
                    id: id.clone(),
                    status: "finished".to_string(),
                    title: video_title,
                    thumbnail: video_thumbnail,
                    error_message: None,
                },
            )
            .ok();
            Ok(())
        } else {
            let err_msg = error_message.unwrap_or_else(|| "Failed to fetch metadata".to_string());
            add_log_internal("error", &err_msg, None, Some(&url)).ok();

            app.emit(
                "metadata-progress",
                MetadataProgress {
                    id: id.clone(),
                    status: "error".to_string(),
                    title: video_title,
                    thumbnail: video_thumbnail,
                    error_message: Some(err_msg.clone()),
                },
            )
            .ok();
            Err(err_msg)
        }
    } else {
        add_log_internal("error", "yt-dlp not found", None, Some(&url)).ok();
        Err("yt-dlp not found".to_string())
    }
}
