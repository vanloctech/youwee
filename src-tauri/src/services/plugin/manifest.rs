use std::collections::BTreeMap;
use std::path::Path;

use serde_json::Value;

use crate::types::{
    PluginConfigField, PluginConfigFieldInputType, PluginFilesystemPermission, PluginI18nSpec,
    PluginManifest, PluginProvider, PluginRuntimeLanguage,
};

pub(super) fn default_supported_providers(language: &PluginRuntimeLanguage) -> Vec<PluginProvider> {
    match language {
        PluginRuntimeLanguage::Javascript => vec![PluginProvider::Deno],
        PluginRuntimeLanguage::Python => vec![PluginProvider::Python],
    }
}

fn allowed_manifest_triggers() -> &'static [&'static str] {
    &[
        "download.queued",
        "download.beforeStart",
        "download.completed",
        "download.failed",
    ]
}

fn validate_i18n_spec(i18n: &PluginI18nSpec, manifest_path: &Path) -> Result<(), String> {
    if let Some(default_locale) = i18n.default_locale.as_ref() {
        if !i18n.supported_locales.is_empty()
            && !i18n
                .supported_locales
                .iter()
                .any(|locale| locale == default_locale)
        {
            return Err(format!(
                "Plugin manifest {} declares i18n.defaultLocale that is not listed in i18n.supportedLocales",
                manifest_path.display()
            ));
        }
    }

    if let Some(directory) = i18n.directory.as_ref() {
        let path = Path::new(directory);
        if path.is_absolute()
            || path
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return Err(format!(
                "Plugin manifest {} declares invalid i18n.directory {}",
                manifest_path.display(),
                directory
            ));
        }
    }

    Ok(())
}

pub(super) fn config_value_matches_field_type(field: &PluginConfigField, value: &Value) -> bool {
    match field.input_type {
        PluginConfigFieldInputType::Text
        | PluginConfigFieldInputType::Textarea
        | PluginConfigFieldInputType::Password
        | PluginConfigFieldInputType::File
        | PluginConfigFieldInputType::Directory
        | PluginConfigFieldInputType::Select => value.is_string(),
        PluginConfigFieldInputType::Number => value.as_f64().is_some(),
        PluginConfigFieldInputType::Boolean => value.is_boolean(),
        PluginConfigFieldInputType::MultiSelect => value
            .as_array()
            .map(|items| items.iter().all(Value::is_string))
            .unwrap_or(false),
    }
}

fn validate_plugin_config_field(
    field: &PluginConfigField,
    manifest_path: &Path,
    field_index: usize,
) -> Result<(), String> {
    if field.key.trim().is_empty() {
        return Err(format!(
            "Plugin manifest {} has a config field at index {} without key",
            manifest_path.display(),
            field_index
        ));
    }
    if field.label.trim().is_empty() {
        return Err(format!(
            "Plugin manifest {} has configFields[{}] without label",
            manifest_path.display(),
            field.key
        ));
    }

    let requires_options = matches!(
        field.input_type,
        PluginConfigFieldInputType::Select | PluginConfigFieldInputType::MultiSelect
    );
    if requires_options && field.options.is_empty() {
        return Err(format!(
            "Plugin manifest {} config field {} must declare options",
            manifest_path.display(),
            field.key
        ));
    }
    if !requires_options && !field.options.is_empty() {
        return Err(format!(
            "Plugin manifest {} config field {} cannot declare options for this inputType",
            manifest_path.display(),
            field.key
        ));
    }

    let mut seen_option_values = BTreeMap::<String, bool>::new();
    for option in &field.options {
        if option.value.trim().is_empty() {
            return Err(format!(
                "Plugin manifest {} config field {} contains an option with empty value",
                manifest_path.display(),
                field.key
            ));
        }
        if option.label.trim().is_empty() {
            return Err(format!(
                "Plugin manifest {} config field {} contains an option with empty label",
                manifest_path.display(),
                field.key
            ));
        }
        if seen_option_values
            .insert(option.value.clone(), true)
            .is_some()
        {
            return Err(format!(
                "Plugin manifest {} config field {} contains duplicate option value {}",
                manifest_path.display(),
                field.key,
                option.value
            ));
        }
    }

    if let Some(default_value) = field.default_value.as_ref() {
        if !config_value_matches_field_type(field, default_value) {
            return Err(format!(
                "Plugin manifest {} config field {} has defaultValue with the wrong type",
                manifest_path.display(),
                field.key
            ));
        }

        if matches!(field.input_type, PluginConfigFieldInputType::Select) {
            let selected = default_value.as_str().unwrap_or_default();
            if !field.options.iter().any(|option| option.value == selected) {
                return Err(format!(
                    "Plugin manifest {} config field {} defaultValue must match a declared option",
                    manifest_path.display(),
                    field.key
                ));
            }
        }

        if matches!(field.input_type, PluginConfigFieldInputType::MultiSelect) {
            let values = default_value.as_array().cloned().unwrap_or_default();
            for value in values {
                let selected = value.as_str().unwrap_or_default();
                if !field.options.iter().any(|option| option.value == selected) {
                    return Err(format!(
                        "Plugin manifest {} config field {} defaultValue contains unsupported option {}",
                        manifest_path.display(),
                        field.key,
                        selected
                    ));
                }
            }
        }
    }

    let uses_number_bounds = field.min.is_some() || field.max.is_some() || field.step.is_some();
    if !matches!(field.input_type, PluginConfigFieldInputType::Number) && uses_number_bounds {
        return Err(format!(
            "Plugin manifest {} config field {} can only use min, max, or step with number inputType",
            manifest_path.display(),
            field.key
        ));
    }
    if let (Some(min), Some(max)) = (field.min, field.max) {
        if min > max {
            return Err(format!(
                "Plugin manifest {} config field {} has min greater than max",
                manifest_path.display(),
                field.key
            ));
        }
    }

    Ok(())
}

pub(super) fn validate_manifest(
    manifest: &PluginManifest,
    manifest_path: &Path,
) -> Result<(), String> {
    if manifest.plugin_id.trim().is_empty() {
        return Err(format!(
            "Plugin manifest {} is missing id",
            manifest_path.display()
        ));
    }
    if manifest.slug.trim().is_empty() {
        return Err(format!(
            "Plugin manifest {} is missing slug",
            manifest_path.display()
        ));
    }
    if manifest.name.trim().is_empty() {
        return Err(format!(
            "Plugin manifest {} is missing name",
            manifest_path.display()
        ));
    }
    if let Some(icon) = manifest.icon.as_ref() {
        if icon.trim().is_empty() {
            return Err(format!(
                "Plugin manifest {} declares an empty icon name",
                manifest_path.display()
            ));
        }
    }
    if manifest.runtime.entrypoint.trim().is_empty() {
        return Err(format!(
            "Plugin manifest {} is missing runtime.entrypoint",
            manifest_path.display()
        ));
    }
    if manifest.runtime.supported_providers.is_empty() {
        return Err(format!(
            "Plugin manifest {} is missing runtime.supportedProviders",
            manifest_path.display()
        ));
    }
    let allowed = default_supported_providers(&manifest.runtime.language);
    for provider in &manifest.runtime.supported_providers {
        if !allowed.iter().any(|candidate| candidate == provider) {
            return Err(format!(
                "Plugin {} declares unsupported provider {} for language {}",
                manifest.plugin_id,
                provider.as_str(),
                manifest.runtime.language.as_str()
            ));
        }
    }
    if let Some(preferred) = manifest.runtime.preferred_provider.as_ref() {
        if !manifest
            .runtime
            .supported_providers
            .iter()
            .any(|provider| provider == preferred)
        {
            return Err(format!(
                "Plugin {} preferredProvider is not listed in supportedProviders",
                manifest.plugin_id
            ));
        }
    }
    let permissions_json = serde_json::to_value(&manifest.permissions)
        .map_err(|e| format!("Failed to inspect plugin permissions: {}", e))?;
    if permissions_json.get("env").is_some() {
        return Err(format!(
            "Plugin manifest {} uses obsolete permissions.env. Define configFields instead.",
            manifest_path.display()
        ));
    }
    if let Some(compatibility) = manifest.compatibility.as_ref() {
        if let Some(range) = compatibility.app_version.as_ref() {
            if range.trim().is_empty() {
                return Err(format!(
                    "Plugin manifest {} has an empty compatibility.appVersion",
                    manifest_path.display()
                ));
            }
        }
        if let Some(range) = compatibility.sdk_version.as_ref() {
            if range.trim().is_empty() {
                return Err(format!(
                    "Plugin manifest {} has an empty compatibility.sdkVersion",
                    manifest_path.display()
                ));
            }
        }
    }
    let mut seen_fs_permissions = BTreeMap::<String, bool>::new();
    for permission in &manifest.permissions.fs {
        if seen_fs_permissions
            .insert(permission.as_str().to_string(), true)
            .is_some()
        {
            return Err(format!(
                "Plugin manifest {} contains duplicate filesystem capability {}",
                manifest_path.display(),
                permission.as_str()
            ));
        }
    }
    let needs_user_selected = manifest.permissions.fs.iter().any(|permission| {
        matches!(
            permission,
            PluginFilesystemPermission::UserSelectedRead
                | PluginFilesystemPermission::UserSelectedWrite
        )
    });
    if needs_user_selected
        && !manifest.config_fields.iter().any(|field| {
            matches!(
                field.input_type,
                PluginConfigFieldInputType::File | PluginConfigFieldInputType::Directory
            )
        })
    {
        return Err(format!(
            "Plugin manifest {} uses fs.user-selected.* but configFields does not declare any file or directory inputs",
            manifest_path.display()
        ));
    }
    if manifest.triggers.is_empty() {
        return Err(format!(
            "Plugin manifest {} must declare at least one trigger",
            manifest_path.display()
        ));
    }
    for trigger in &manifest.triggers {
        if allowed_manifest_triggers()
            .iter()
            .any(|allowed| allowed == trigger)
        {
            continue;
        }
        if trigger.starts_with("triggers.") {
            return Err(format!(
                "Plugin manifest {} contains invalid trigger {}. plugin.json must use raw runtime names like download.completed, not SDK identifiers like triggers.downloadCompleted",
                manifest_path.display(),
                trigger
            ));
        }
        return Err(format!(
            "Plugin manifest {} contains unsupported trigger {}",
            manifest_path.display(),
            trigger
        ));
    }
    if let Some(i18n) = manifest.i18n.as_ref() {
        validate_i18n_spec(i18n, manifest_path)?;
    }
    let mut seen_config_field_keys = BTreeMap::<String, bool>::new();
    for (index, field) in manifest.config_fields.iter().enumerate() {
        if seen_config_field_keys
            .insert(field.key.clone(), true)
            .is_some()
        {
            return Err(format!(
                "Plugin manifest {} contains duplicate config field key {}",
                manifest_path.display(),
                field.key
            ));
        }
        validate_plugin_config_field(field, manifest_path, index)?;
    }
    Ok(())
}

pub(super) fn load_manifest_from_file(manifest_path: &Path) -> Result<PluginManifest, String> {
    let raw = std::fs::read_to_string(manifest_path)
        .map_err(|e| format!("Failed to read {}: {}", manifest_path.display(), e))?;

    let raw_json: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse {}: {}", manifest_path.display(), e))?;
    if raw_json
        .get("permissions")
        .and_then(|value| value.get("env"))
        .is_some()
    {
        return Err(format!(
            "Plugin manifest {} uses obsolete permissions.env. Define configFields instead.",
            manifest_path.display()
        ));
    }

    let manifest: PluginManifest = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse {}: {}", manifest_path.display(), e))?;

    validate_manifest(&manifest, &manifest_path)?;
    Ok(manifest)
}

pub(super) fn load_source_manifest_from_dir(plugin_root: &Path) -> Result<PluginManifest, String> {
    load_manifest_from_file(&plugin_root.join("plugin.json"))
}

pub(super) fn load_installed_manifest_from_dir(
    plugin_root: &Path,
) -> Result<PluginManifest, String> {
    let packaged_manifest = plugin_root.join("manifest.json");
    if packaged_manifest.exists() {
        return load_manifest_from_file(&packaged_manifest);
    }

    load_source_manifest_from_dir(plugin_root)
}
