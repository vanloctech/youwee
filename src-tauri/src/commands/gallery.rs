use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;

use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::database::add_history_internal;
use crate::database::add_log_internal;
use crate::services::{build_cookie_args, get_gallerydl_path, system_gallerydl_not_found_message};
use crate::types::BackendError;
use crate::utils::{normalize_url, sanitize_output_path, validate_url, CommandExt};

const RECENT_OUTPUT_LIMIT: usize = 30;

#[derive(serde::Serialize)]
pub struct GalleryDownloadResult {
    pub filepath: String,
    pub history_id: Option<String>,
}

fn push_recent_output(buffer: &mut VecDeque<String>, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    if buffer.len() >= RECENT_OUTPUT_LIMIT {
        buffer.pop_front();
    }
    buffer.push_back(trimmed.to_string());
}

fn kill_gallery_processes() {
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("pkill")
            .args(["-9", "-f", "gallery-dl"])
            .spawn()
            .ok();
    }
    #[cfg(windows)]
    {
        use std::process::Command as StdCommand;
        let mut cmd = StdCommand::new("taskkill");
        cmd.args(["/F", "/IM", "gallery-dl.exe"]);
        cmd.hide_window();
        cmd.spawn().ok();
    }
}

fn archive_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    Ok(app_data_dir.join("archive").join("gallery-dl.txt"))
}

#[tauri::command]
pub async fn stop_gallery_download() -> Result<(), String> {
    kill_gallery_processes();
    Ok(())
}

#[tauri::command]
pub async fn download_gallery(
    app: AppHandle,
    url: String,
    output_path: String,
    log_stderr: Option<bool>,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
    source: Option<String>,
) -> Result<GalleryDownloadResult, String> {
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    let Some(binary_path) = get_gallerydl_path(&app) else {
        return Err(BackendError::new(
            crate::types::code::GALLERYDL_NOT_FOUND,
            system_gallerydl_not_found_message(),
        )
        .with_retryable(false)
        .to_wire_string());
    };

    let sanitized_path = sanitize_output_path(&output_path)
        .map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let archive_path = archive_file_path(&app)?;
    if let Some(parent) = archive_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create archive directory: {}", e))?;
    }

    let mut args = vec![
        "--destination".to_string(),
        sanitized_path.clone(),
        "--download-archive".to_string(),
        archive_path.to_string_lossy().to_string(),
    ];

    args.extend(build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    ));

    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    args.push(url.clone());

    let command_str = format!("[{}] gallery-dl {}", binary_path.display(), args.join(" "));
    add_log_internal("command", &command_str, None, Some(&url)).ok();

    let mut cmd = Command::new(&binary_path);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();

    let mut child = cmd.spawn().map_err(|e| {
        BackendError::from_message(format!("Failed to start gallery-dl: {}", e)).to_wire_string()
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut recent = VecDeque::with_capacity(RECENT_OUTPUT_LIMIT);
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                push_recent_output(&mut recent, &line);
            }
        }
        recent
    });

    let url_for_stderr = url.clone();
    let stderr_enabled = log_stderr.unwrap_or(true);
    let stderr_task = tokio::spawn(async move {
        let mut recent = VecDeque::with_capacity(RECENT_OUTPUT_LIMIT);
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if stderr_enabled {
                    add_log_internal("stderr", &line, None, Some(&url_for_stderr)).ok();
                }
                push_recent_output(&mut recent, &line);
            }
        }
        recent
    });

    let status = child.wait().await.map_err(|e| {
        BackendError::from_message(format!("gallery-dl process error: {}", e)).to_wire_string()
    })?;

    let mut recent_lines: Vec<String> = stdout_task.await.unwrap_or_default().into_iter().collect();
    recent_lines.extend(stderr_task.await.unwrap_or_default().into_iter());

    if !status.success() {
        let reason = recent_lines
            .iter()
            .rev()
            .find(|line| {
                let lower = line.to_lowercase();
                lower.contains("error")
                    || lower.contains("failed")
                    || lower.contains("forbidden")
                    || lower.contains("too many requests")
                    || lower.contains("not found")
            })
            .cloned()
            .or_else(|| recent_lines.last().cloned())
            .unwrap_or_else(|| "Unknown error".to_string());

        return Err(BackendError::from_message(format!(
            "Gallery download failed (exit code {}): {}",
            status.code().unwrap_or(-1),
            reason
        ))
        .with_param("exitCode", status.code().unwrap_or(-1))
        .to_wire_string());
    }

    let title = source.clone().unwrap_or_else(|| url.clone());
    let history_id = add_history_internal(
        url.clone(),
        title,
        None,
        sanitized_path.clone(),
        None,
        None,
        None,
        Some("gallery".to_string()),
        source.or(Some("gallery-dl".to_string())),
        None,
    )
    .ok();

    add_log_internal("success", "Gallery download completed", None, Some(&url)).ok();

    Ok(GalleryDownloadResult {
        filepath: sanitized_path,
        history_id,
    })
}
