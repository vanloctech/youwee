use std::path::PathBuf;

use tauri::{AppHandle, Manager};
use tokio::process::Command;

use crate::types::{PluginProvider, RuntimeProviderStatus};
use crate::utils::CommandExt;

async fn resolve_command_path(binary: &str) -> Option<PathBuf> {
    #[cfg(unix)]
    let locator = "which";
    #[cfg(windows)]
    let locator = "where";

    let mut cmd = Command::new(locator);
    cmd.arg(binary);
    cmd.hide_window();
    let output = cmd.output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let first_line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()?
        .trim()
        .to_string();
    if first_line.is_empty() {
        None
    } else {
        Some(PathBuf::from(first_line))
    }
}

pub async fn get_runtime_provider_status_internal(
    app: &AppHandle,
    provider: PluginProvider,
) -> RuntimeProviderStatus {
    match provider {
        PluginProvider::Deno => {
            let path = crate::services::get_deno_path(app).await;
            let (resolved_path, resolved_source) = if let Some(path) = path.clone() {
                let source = match app.path().app_data_dir() {
                    Ok(app_data) if path.starts_with(app_data.join("bin")) => "app-managed",
                    _ => "system",
                };
                (
                    Some(path.to_string_lossy().to_string()),
                    Some(source.to_string()),
                )
            } else {
                (None, None)
            };
            RuntimeProviderStatus {
                provider,
                available: resolved_path.is_some(),
                resolved_path,
                resolved_source,
                details: Some("Resolves app-managed Deno first, then system Deno.".to_string()),
            }
        }
        PluginProvider::Python => {
            let path = if let Some(path) = resolve_command_path("python3").await {
                Some(path)
            } else {
                resolve_command_path("python").await
            };
            RuntimeProviderStatus {
                provider,
                available: path.is_some(),
                resolved_path: path.map(|value| value.to_string_lossy().to_string()),
                resolved_source: Some("system".to_string()),
                details: None,
            }
        }
    }
}

pub async fn list_runtime_providers_internal(app: &AppHandle) -> Vec<RuntimeProviderStatus> {
    let mut statuses = Vec::new();
    for provider in [PluginProvider::Deno, PluginProvider::Python] {
        statuses.push(get_runtime_provider_status_internal(app, provider).await);
    }
    statuses
}

pub(super) async fn resolve_provider_command(
    app: &AppHandle,
    provider: &PluginProvider,
) -> Result<(String, Option<String>), String> {
    match provider {
        PluginProvider::Deno => {
            let path = crate::services::get_deno_path(app)
                .await
                .ok_or_else(|| "Deno runtime is not available".to_string())?;
            let source = match app.path().app_data_dir() {
                Ok(app_data) if path.starts_with(app_data.join("bin")) => "app-managed",
                _ => "system",
            };
            Ok((path.to_string_lossy().to_string(), Some(source.to_string())))
        }
        PluginProvider::Python => {
            let path = if let Some(path) = resolve_command_path("python3").await {
                Some(path)
            } else {
                resolve_command_path("python").await
            };
            path.map(|value| {
                (
                    value.to_string_lossy().to_string(),
                    Some("system".to_string()),
                )
            })
            .ok_or_else(|| "Python runtime is not available".to_string())
        }
    }
}
