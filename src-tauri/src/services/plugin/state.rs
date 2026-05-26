use std::collections::BTreeMap;

use tauri::AppHandle;

use crate::types::{
    PluginPermissionApproval, PluginProvider, PluginRuntimeLanguage, PluginTriggerWorkflow,
};

use super::manifest::default_supported_providers;
use super::registry::{read_registry, write_registry, PluginTriggerWorkflowRegistry};
use super::summary::validate_runtime_config_value;
use super::workflow::get_trigger_workflow_internal;
use super::{
    get_plugin_details_internal, list_plugins_internal, PluginConfigValuesInput,
    PluginPermissionApprovalInput, PluginRuntimeLocaleInput,
};

pub fn update_plugin_state_internal(
    app: &AppHandle,
    plugin_id: &str,
    enabled: bool,
) -> Result<(), String> {
    let mut registry = read_registry(app)?;
    let entry = registry
        .installations
        .get_mut(plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;
    entry.enabled = enabled;
    write_registry(app, &registry)
}

pub fn get_plugin_trigger_workflow_internal(
    app: &AppHandle,
    trigger: &str,
) -> Result<PluginTriggerWorkflow, String> {
    get_trigger_workflow_internal(app, trigger)
}

pub fn update_plugin_trigger_workflow_internal(
    app: &AppHandle,
    workflow: PluginTriggerWorkflow,
) -> Result<PluginTriggerWorkflow, String> {
    let valid_plugin_ids = list_plugins_internal(app)?
        .into_iter()
        .map(|plugin| plugin.manifest.plugin_id)
        .collect::<Vec<_>>();

    let steps = workflow
        .steps
        .into_iter()
        .filter(|step| {
            valid_plugin_ids
                .iter()
                .any(|plugin_id| plugin_id == &step.plugin_id)
        })
        .collect::<Vec<_>>();

    let mut registry = read_registry(app)?;
    registry.trigger_workflows.insert(
        workflow.trigger.clone(),
        PluginTriggerWorkflowRegistry {
            steps: steps.clone(),
        },
    );
    write_registry(app, &registry)?;

    Ok(PluginTriggerWorkflow {
        trigger: workflow.trigger,
        steps,
    })
}

pub fn approve_plugin_permissions_internal(
    app: &AppHandle,
    plugin_id: &str,
    permissions: PluginPermissionApprovalInput,
) -> Result<(), String> {
    let mut registry = read_registry(app)?;
    let entry = registry
        .installations
        .get_mut(plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;
    entry.approved_permissions = PluginPermissionApproval {
        network: permissions.network,
        fs: permissions.fs,
    };
    write_registry(app, &registry)
}

pub fn update_plugin_config_values_internal(
    app: &AppHandle,
    plugin_id: &str,
    input: PluginConfigValuesInput,
) -> Result<(), String> {
    let plugin = get_plugin_details_internal(app, plugin_id)?;
    let fields_by_key = plugin
        .manifest
        .config_fields
        .iter()
        .map(|field| (field.key.clone(), field.clone()))
        .collect::<BTreeMap<_, _>>();

    let mut registry = read_registry(app)?;
    let entry = registry
        .installations
        .get_mut(plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

    for (key, value) in input.values {
        let field = fields_by_key
            .get(&key)
            .ok_or_else(|| format!("Plugin does not declare config field: {}", key))?;

        match value {
            Some(raw) => {
                validate_runtime_config_value(field, &raw)?;
                entry.config_values.insert(key, raw);
            }
            None => {
                entry.config_values.remove(&key);
            }
        }
    }

    write_registry(app, &registry)
}

pub fn set_plugin_provider_internal(
    app: &AppHandle,
    plugin_id: &str,
    provider: PluginProvider,
) -> Result<(), String> {
    let plugin = get_plugin_details_internal(app, plugin_id)?;
    if !plugin
        .manifest
        .runtime
        .supported_providers
        .iter()
        .any(|candidate| candidate == &provider)
    {
        return Err(format!(
            "Plugin {} does not support provider {}",
            plugin.manifest.plugin_id,
            provider.as_str()
        ));
    }

    let mut registry = read_registry(app)?;
    let entry = registry
        .installations
        .get_mut(plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;
    entry.selected_provider = Some(provider);
    write_registry(app, &registry)
}

pub fn set_plugin_timeout_internal(
    app: &AppHandle,
    plugin_id: &str,
    timeout_sec: Option<u64>,
) -> Result<(), String> {
    if let Some(value) = timeout_sec {
        if value == 0 {
            return Err("Plugin timeout must be greater than 0".to_string());
        }
    }

    let mut registry = read_registry(app)?;
    let entry = registry
        .installations
        .get_mut(plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;
    entry.timeout_sec_override = timeout_sec;
    write_registry(app, &registry)
}

pub fn set_default_provider_for_language_internal(
    app: &AppHandle,
    language: PluginRuntimeLanguage,
    provider: PluginProvider,
) -> Result<(), String> {
    let allowed = default_supported_providers(&language);
    if !allowed.iter().any(|candidate| candidate == &provider) {
        return Err(format!(
            "Provider {} is not valid for language {}",
            provider.as_str(),
            language.as_str()
        ));
    }
    let mut registry = read_registry(app)?;
    registry
        .default_providers
        .insert(language.as_str().to_string(), provider);
    write_registry(app, &registry)
}

pub fn set_plugin_runtime_locale_internal(
    app: &AppHandle,
    input: PluginRuntimeLocaleInput,
) -> Result<(), String> {
    let mut registry = read_registry(app)?;
    registry.app_locale = Some(input.locale.trim().to_string());
    registry.app_fallback_locale = Some(input.fallback_locale.trim().to_string());
    registry.app_direction = input.direction.map(|value| value.trim().to_string());
    write_registry(app, &registry)
}
