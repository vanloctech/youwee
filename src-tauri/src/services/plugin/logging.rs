use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncRead, AsyncReadExt};

use crate::database::add_log_internal;
use crate::types::{PluginExecutionOutputEvent, PluginExecutionResult};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(super) struct PluginScriptOutput {
    pub(super) success: Option<bool>,
    pub(super) message: Option<String>,
    pub(super) artifacts: Option<serde_json::Value>,
    pub(super) metadata: Option<serde_json::Value>,
    pub(super) mutations: Option<crate::types::PluginChainMutation>,
}

pub(super) fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    let mut truncated = text.chars().take(max_len).collect::<String>();
    truncated.push_str("...");
    truncated
}

pub(super) fn combine_plugin_event_details(
    message: Option<&String>,
    stdout: Option<&String>,
    stderr: Option<&String>,
) -> Option<String> {
    let mut lines: Vec<String> = Vec::new();
    if let Some(value) = message {
        if !value.trim().is_empty() {
            lines.push(format!("message: {value}"));
        }
    }
    if let Some(value) = stdout {
        if !value.trim().is_empty() {
            lines.push(format!("stdout: {value}"));
        }
    }
    if let Some(value) = stderr {
        if !value.trim().is_empty() {
            lines.push(format!("stderr: {value}"));
        }
    }
    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}

pub(super) fn build_plugin_completion_details(result: &PluginExecutionResult) -> Option<String> {
    let mut lines: Vec<String> = Vec::new();

    if let Some(message) = result.message.as_ref() {
        if !message.trim().is_empty() {
            lines.push(format!("Message: {message}"));
        }
    }

    if let Some(mutation) = result.mutations.as_ref() {
        if let Some(active_filepath) = mutation.active_filepath.as_ref() {
            if !active_filepath.trim().is_empty() {
                lines.push(format!("Active file for next step: {active_filepath}"));
            }
        }

        let extra_files: Vec<&String> = mutation
            .extra_files
            .iter()
            .filter(|path| {
                !path.trim().is_empty()
                    && mutation
                        .active_filepath
                        .as_ref()
                        .map(|active| active != *path)
                        .unwrap_or(true)
            })
            .collect();

        if !extra_files.is_empty() {
            lines.push("Extra output files:".to_string());
            lines.extend(extra_files.into_iter().map(|path| format!("- {path}")));
        }
    }

    if let Some(stderr) = result.stderr.as_ref() {
        let trimmed = stderr.trim();
        if !trimmed.is_empty() {
            lines.push(format!("stderr: {trimmed}"));
        }
    }

    if let Some(stdout) = result.stdout.as_ref() {
        let trimmed = stdout.trim();
        if !trimmed.is_empty() && parse_plugin_result(trimmed).is_none() {
            lines.push(format!("stdout: {trimmed}"));
        }
    }

    if lines.is_empty() {
        None
    } else {
        Some(lines.join("\n"))
    }
}

pub(super) fn shorten_for_event(text: Option<String>) -> Option<String> {
    text.map(|value| truncate_text(&value, 1500))
}

pub(super) fn emit_plugin_runtime_output(
    app: &AppHandle,
    plugin_id: &str,
    plugin_name: &str,
    run_id: Option<&str>,
    stream: &str,
    bytes: &[u8],
    log_url: Option<&str>,
    media_title: Option<&str>,
    filename: Option<&str>,
) {
    if bytes.is_empty() {
        return;
    }
    let chunk = String::from_utf8_lossy(bytes).to_string();
    let trimmed = chunk.trim_end_matches(&['\n', '\r'][..]).trim();
    if trimmed.is_empty() {
        return;
    }

    let log_type = if stream == "stdout" {
        "info"
    } else {
        match trimmed.trim_start().strip_prefix('[').and_then(|value| {
            value
                .split_once(']')
                .map(|(level, _)| level.to_ascii_lowercase())
        }) {
            Some(level) if level == "info" || level == "debug" => "info",
            Some(level) if level == "warn" => "stderr",
            Some(level) if level == "error" => "error",
            _ => "stderr",
        }
    };
    let details = format!(
        "pluginId: {} | pluginName: {} | stream: {}",
        plugin_id, plugin_name, stream
    );
    if should_persist_plugin_runtime_output(stream, trimmed, log_type) {
        add_log_internal(log_type, &chunk, Some(&details), log_url).ok();
    }

    app.emit(
        "plugin-execution-output",
        PluginExecutionOutputEvent {
            plugin_id: plugin_id.to_string(),
            run_id: run_id.map(|value| value.to_string()),
            plugin_name: Some(plugin_name.to_string()),
            stream: stream.to_string(),
            chunk: trimmed.to_string(),
            media_title: media_title.map(str::to_string),
            filename: filename.map(str::to_string),
            media_url: log_url.map(str::to_string),
        },
    )
    .ok();
}

pub(super) fn should_persist_plugin_runtime_output(
    stream: &str,
    trimmed: &str,
    log_type: &str,
) -> bool {
    if stream == "stdout" {
        return parse_plugin_result(trimmed).is_none();
    }

    !matches!(log_type, "info")
}

pub(super) async fn capture_process_stream<R>(
    app: AppHandle,
    stream_name: &str,
    plugin_id: String,
    plugin_name: String,
    run_id: Option<String>,
    mut reader: R,
    log_url: Option<String>,
    media_title: Option<String>,
    filename: Option<String>,
) -> Vec<u8>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut raw = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break,
            Ok(size) => {
                raw.extend_from_slice(&buffer[..size]);
                emit_plugin_runtime_output(
                    &app,
                    &plugin_id,
                    &plugin_name,
                    run_id.as_deref(),
                    stream_name,
                    &buffer[..size],
                    log_url.as_deref(),
                    media_title.as_deref(),
                    filename.as_deref(),
                );
            }
            Err(_) => break,
        }
    }

    raw
}

pub(super) fn output_to_string(raw: &[u8]) -> String {
    let text = String::from_utf8_lossy(raw);
    text.trim_end_matches(&['\r', '\n'][..]).to_string()
}

pub(super) fn plugin_output_details(stdout: &str, stderr: &str) -> String {
    let mut parts = Vec::new();
    if !stdout.trim().is_empty() {
        parts.push(format!("stdout:\n{}", stdout.trim_end()));
    }
    if !stderr.trim().is_empty() {
        parts.push(format!("stderr:\n{}", stderr.trim_end()));
    }

    if parts.is_empty() {
        "No output captured from plugin process.".to_string()
    } else {
        parts.join("\n\n")
    }
}

pub(super) fn parse_plugin_result(stdout: &str) -> Option<PluginScriptOutput> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(output) = serde_json::from_str::<PluginScriptOutput>(trimmed) {
        return Some(output);
    }

    trimmed
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .and_then(|line| serde_json::from_str::<PluginScriptOutput>(line).ok())
}

#[cfg(unix)]
pub(super) fn plugin_exit_reason(status: &std::process::ExitStatus) -> String {
    use std::os::unix::process::ExitStatusExt;
    if let Some(code) = status.code() {
        format!("code {}", code)
    } else if let Some(signal) = status.signal() {
        format!("signal {}", signal)
    } else {
        "terminated".to_string()
    }
}

#[cfg(not(unix))]
pub(super) fn plugin_exit_reason(status: &std::process::ExitStatus) -> String {
    status
        .code()
        .map(|code| format!("code {}", code))
        .unwrap_or_else(|| "terminated".to_string())
}

pub(super) async fn capture_process_stream_err<R>(
    app: AppHandle,
    stream_name: &str,
    plugin_id: String,
    plugin_name: String,
    run_id: Option<String>,
    reader: R,
    log_url: Option<String>,
    media_title: Option<String>,
    filename: Option<String>,
) -> Vec<u8>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    capture_process_stream(
        app,
        stream_name,
        plugin_id,
        plugin_name,
        run_id,
        reader,
        log_url,
        media_title,
        filename,
    )
    .await
}
