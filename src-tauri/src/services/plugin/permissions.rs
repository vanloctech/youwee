use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::types::{
    PluginConfigField, PluginConfigFieldInputType, PluginFilesystemPermission, PluginManifest,
    PluginPermissionApproval, PluginPermissionRequest,
};

pub(super) fn resolve_plugin_entrypoint(
    plugin_dir: &Path,
    entrypoint: &str,
) -> Result<PathBuf, String> {
    let entrypoint_path = PathBuf::from(entrypoint);
    if entrypoint_path.is_absolute() {
        return Err("Plugin entrypoint must be relative".to_string());
    }
    let candidate = plugin_dir.join(entrypoint_path);
    let canonical_plugin_dir = std::fs::canonicalize(plugin_dir).map_err(|e| {
        format!(
            "Failed to resolve plugin directory {}: {}",
            plugin_dir.display(),
            e
        )
    })?;
    let canonical_candidate = std::fs::canonicalize(&candidate).map_err(|e| {
        format!(
            "Failed to resolve plugin entrypoint {}: {}",
            candidate.display(),
            e
        )
    })?;
    if !canonical_candidate.starts_with(&canonical_plugin_dir) {
        return Err("Plugin entrypoint must stay inside the plugin directory".to_string());
    }
    if !canonical_candidate.is_file() {
        return Err(format!(
            "Plugin entrypoint {} is not a file",
            canonical_candidate.display()
        ));
    }
    Ok(canonical_candidate)
}

pub(super) fn collect_missing_permissions(
    requested: &PluginPermissionRequest,
    approved: &PluginPermissionApproval,
) -> Vec<String> {
    let mut missing = Vec::new();
    if requested.network && !approved.network {
        missing.push("network".to_string());
    }
    for permission in &requested.fs {
        if !approved
            .fs
            .iter()
            .any(|approved_permission| approved_permission == permission)
        {
            missing.push(permission.as_str().to_string());
        }
    }
    missing
}

fn collect_user_selected_permission_paths(
    fields: &[PluginConfigField],
    values: &BTreeMap<String, Value>,
) -> Vec<PathBuf> {
    fields
        .iter()
        .filter(|field| {
            matches!(
                field.input_type,
                PluginConfigFieldInputType::File | PluginConfigFieldInputType::Directory
            )
        })
        .filter_map(|field| values.get(&field.key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .collect()
}

pub(super) fn path_scope_variants(path: &Path) -> Vec<PathBuf> {
    let mut variants = vec![path.to_path_buf()];
    if let Ok(canonical) = std::fs::canonicalize(path) {
        if canonical != path {
            variants.push(canonical);
        }
    }
    variants.sort();
    variants.dedup();
    variants
}

pub(super) fn build_permission_path_scopes(
    plugin_dir: &Path,
    payload_file: &Path,
    manifest: &PluginManifest,
    resolved_config_values: &BTreeMap<String, Value>,
) -> Result<(Vec<PathBuf>, Vec<PathBuf>), String> {
    let mut allow_read = path_scope_variants(plugin_dir);
    let mut allow_write = Vec::<PathBuf>::new();
    let payload_directory = payload_file.parent().map(Path::to_path_buf);
    let user_selected_paths =
        collect_user_selected_permission_paths(&manifest.config_fields, resolved_config_values);
    let temp_dir = std::env::temp_dir();

    for permission in &manifest.permissions.fs {
        match permission {
            PluginFilesystemPermission::PluginRead => {
                allow_read.extend(path_scope_variants(plugin_dir));
            }
            PluginFilesystemPermission::PluginWrite => {
                allow_write.extend(path_scope_variants(plugin_dir));
            }
            PluginFilesystemPermission::PayloadFileRead => {
                allow_read.extend(path_scope_variants(payload_file));
            }
            PluginFilesystemPermission::PayloadDirectoryRead => {
                if let Some(directory) = payload_directory.as_ref() {
                    allow_read.extend(path_scope_variants(directory));
                }
            }
            PluginFilesystemPermission::PayloadDirectoryWrite => {
                if let Some(directory) = payload_directory.as_ref() {
                    allow_write.extend(path_scope_variants(directory));
                }
            }
            PluginFilesystemPermission::TempRead => {
                allow_read.extend(path_scope_variants(&temp_dir));
            }
            PluginFilesystemPermission::TempWrite => {
                allow_write.extend(path_scope_variants(&temp_dir));
            }
            PluginFilesystemPermission::UserSelectedRead => {
                for path in &user_selected_paths {
                    if !path.exists() {
                        return Err(format!(
                            "Failed to resolve configured path {}: path does not exist",
                            path.display()
                        ));
                    }
                    allow_read.extend(path_scope_variants(path));
                }
            }
            PluginFilesystemPermission::UserSelectedWrite => {
                for path in &user_selected_paths {
                    allow_write.extend(path_scope_variants(path));
                }
            }
        }
    }

    allow_read.sort();
    allow_read.dedup();
    allow_write.sort();
    allow_write.dedup();
    Ok((allow_read, allow_write))
}

pub(super) fn push_allow_flag(args: &mut Vec<String>, flag_name: &str, values: &[PathBuf]) {
    if values.is_empty() {
        return;
    }
    args.push(format!(
        "--{}={}",
        flag_name,
        values
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(",")
    ));
}
