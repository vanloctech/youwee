use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::types::{
    PluginPackageSource, PluginPermissionApproval, PluginProvider, PluginWorkflowStepConfig,
};

use super::{plugins_root, REGISTRY_FILE_NAME};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginRegistryEntry {
    pub(super) enabled: bool,
    pub(super) trusted: bool,
    #[serde(default)]
    pub(super) approved_permissions: PluginPermissionApproval,
    #[serde(default)]
    pub(super) config_values: BTreeMap<String, Value>,
    #[serde(default)]
    pub(super) selected_provider: Option<PluginProvider>,
    #[serde(default)]
    pub(super) timeout_sec_override: Option<u64>,
    pub(super) source: Option<PluginPackageSource>,
    #[serde(default)]
    pub(super) last_resolved_provider: Option<PluginProvider>,
    #[serde(default)]
    pub(super) last_resolved_source: Option<String>,
    #[serde(default)]
    pub(super) last_execution_status: Option<String>,
    #[serde(default)]
    pub(super) last_error: Option<String>,
    #[serde(default)]
    pub(super) signature_status: Option<String>,
    #[serde(default)]
    pub(super) signer_key_id: Option<String>,
    #[serde(default)]
    pub(super) signer_fingerprint: Option<String>,
    #[serde(default)]
    pub(super) signature_algorithm: Option<String>,
    #[serde(default)]
    pub(super) signed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginTriggerWorkflowRegistry {
    #[serde(default)]
    pub(super) steps: Vec<PluginWorkflowStepConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginRegistry {
    #[serde(default)]
    pub(super) installations: BTreeMap<String, PluginRegistryEntry>,
    #[serde(default)]
    pub(super) default_providers: BTreeMap<String, PluginProvider>,
    #[serde(default)]
    pub(super) trigger_workflows: BTreeMap<String, PluginTriggerWorkflowRegistry>,
    #[serde(default)]
    pub(super) app_locale: Option<String>,
    #[serde(default)]
    pub(super) app_fallback_locale: Option<String>,
    #[serde(default)]
    pub(super) app_direction: Option<String>,
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(plugins_root(app)?.join(REGISTRY_FILE_NAME))
}

pub(super) fn read_registry(app: &AppHandle) -> Result<PluginRegistry, String> {
    let path = registry_path(app)?;
    if !path.exists() {
        return Ok(PluginRegistry::default());
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read plugin registry {}: {}", path.display(), e))?;
    match serde_json::from_str(&raw) {
        Ok(registry) => Ok(registry),
        Err(original_error) => {
            let mut raw_json: Value = serde_json::from_str(&raw).map_err(|e| {
                format!("Failed to parse plugin registry {}: {}", path.display(), e)
            })?;

            if !normalize_legacy_registry_json(&mut raw_json) {
                return Err(format!(
                    "Failed to parse plugin registry {}: {}",
                    path.display(),
                    original_error
                ));
            }

            let registry: PluginRegistry = serde_json::from_value(raw_json).map_err(|e| {
                format!(
                    "Failed to parse normalized plugin registry {}: {}",
                    path.display(),
                    e
                )
            })?;

            write_registry(app, &registry)?;
            Ok(registry)
        }
    }
}

fn normalize_provider_value(value: &mut Value) -> bool {
    match value {
        Value::String(provider) if provider == "node" || provider == "bun" => {
            *provider = "deno".to_string();
            true
        }
        _ => false,
    }
}

fn normalize_source_kind_value(value: &mut Value) -> bool {
    match value {
        Value::String(kind) if kind == "app-scaffold" || kind == "local-folder" => {
            *kind = "workspace".to_string();
            true
        }
        Value::String(kind) if kind == "local-zip" || kind == "remote-url" => {
            *kind = "package-ywp".to_string();
            true
        }
        _ => false,
    }
}

fn normalize_legacy_registry_json(root: &mut Value) -> bool {
    let mut changed = false;

    let Some(root_object) = root.as_object_mut() else {
        return false;
    };

    if let Some(default_providers) = root_object
        .get_mut("defaultProviders")
        .and_then(Value::as_object_mut)
    {
        for value in default_providers.values_mut() {
            changed |= normalize_provider_value(value);
        }
    }

    if let Some(installations) = root_object
        .get_mut("installations")
        .and_then(Value::as_object_mut)
    {
        for installation in installations.values_mut() {
            let Some(installation_object) = installation.as_object_mut() else {
                continue;
            };

            if let Some(value) = installation_object.get_mut("selectedProvider") {
                changed |= normalize_provider_value(value);
            }
            if let Some(value) = installation_object.get_mut("lastResolvedProvider") {
                changed |= normalize_provider_value(value);
            }

            if let Some(source_object) = installation_object
                .get_mut("source")
                .and_then(Value::as_object_mut)
            {
                if let Some(kind_value) = source_object.get_mut("kind") {
                    changed |= normalize_source_kind_value(kind_value);
                }
            }
        }
    }

    changed
}

pub(super) fn write_registry(app: &AppHandle, registry: &PluginRegistry) -> Result<(), String> {
    let path = registry_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create plugin registry directory {}: {}",
                parent.display(),
                e
            )
        })?;
    }
    let raw = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize plugin registry: {}", e))?;
    std::fs::write(&path, raw)
        .map_err(|e| format!("Failed to write plugin registry {}: {}", path.display(), e))
}
