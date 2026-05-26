use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::types::{
    PluginConfigField, PluginConfigFieldInputType, PluginInstallation, PluginManifest,
    PluginPackageSource, PluginProvider, PluginRuntimeLanguage, PluginSummary,
};

use super::manifest::config_value_matches_field_type;
use super::registry::PluginRegistry;

pub(super) fn manifest_summary(
    manifest: PluginManifest,
    installation: PluginInstallation,
    warnings: Vec<String>,
    readme_content: Option<String>,
) -> PluginSummary {
    PluginSummary {
        manifest,
        installation,
        warnings,
        readme_content,
    }
}

fn append_locale_before_extension(path: &Path, locale: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("README.md");
    let localized_name = match file_name.rsplit_once('.') {
        Some((stem, ext)) => format!("{}.{}.{}", stem, locale, ext),
        None => format!("{}.{}", file_name, locale),
    };

    match path.parent() {
        Some(parent) => parent.join(localized_name),
        None => PathBuf::from(localized_name),
    }
}

fn build_readme_locale_preferences(
    app_locale: Option<&str>,
    fallback_locale: Option<&str>,
) -> Vec<String> {
    let mut locales = Vec::<String>::new();
    let mut push_locale = |value: &str| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return;
        }
        if !locales.iter().any(|entry| entry == trimmed) {
            locales.push(trimmed.to_string());
        }
        if let Some((language, _)) = trimmed.split_once('-') {
            if !language.is_empty() && !locales.iter().any(|entry| entry == language) {
                locales.push(language.to_string());
            }
        }
    };

    if let Some(value) = app_locale {
        push_locale(value);
    }
    if let Some(value) = fallback_locale {
        push_locale(value);
    }

    locales
}

fn resolve_readme_path(
    root: &Path,
    manifest: &PluginManifest,
    preferred_locales: &[String],
) -> Option<PathBuf> {
    let manifest_readme = manifest
        .readme
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);

    let candidate = manifest_readme.unwrap_or_else(|| PathBuf::from("README.md"));
    let base_path = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };

    for locale in preferred_locales {
        let localized = append_locale_before_extension(&base_path, locale);
        if localized.is_file() {
            return Some(localized);
        }
    }

    if base_path.is_file() {
        Some(base_path)
    } else {
        None
    }
}

pub(super) fn load_plugin_readme_content(
    root: &Path,
    manifest: &PluginManifest,
    app_locale: Option<&str>,
    fallback_locale: Option<&str>,
) -> Option<String> {
    let preferred_locales = build_readme_locale_preferences(app_locale, fallback_locale);
    let path = resolve_readme_path(root, manifest, &preferred_locales)?;
    let content = std::fs::read_to_string(path).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(super) fn default_provider_for_language(language: &PluginRuntimeLanguage) -> PluginProvider {
    match language {
        PluginRuntimeLanguage::Javascript => PluginProvider::Deno,
        PluginRuntimeLanguage::Python => PluginProvider::Python,
    }
}

pub(super) fn validate_runtime_config_value(
    field: &PluginConfigField,
    value: &Value,
) -> Result<(), String> {
    if !config_value_matches_field_type(field, value) {
        return Err(format!(
            "Invalid value type for plugin config field {}",
            field.key
        ));
    }

    match field.input_type {
        PluginConfigFieldInputType::Select => {
            let selected = value.as_str().unwrap_or_default();
            if !field.options.iter().any(|option| option.value == selected) {
                return Err(format!(
                    "Plugin config field {} must use one of the declared options",
                    field.key
                ));
            }
        }
        PluginConfigFieldInputType::MultiSelect => {
            let values = value.as_array().cloned().unwrap_or_default();
            for entry in values {
                let selected = entry.as_str().unwrap_or_default();
                if !field.options.iter().any(|option| option.value == selected) {
                    return Err(format!(
                        "Plugin config field {} contains unsupported option {}",
                        field.key, selected
                    ));
                }
            }
        }
        PluginConfigFieldInputType::Number => {
            let Some(number) = value.as_f64() else {
                return Err(format!(
                    "Plugin config field {} must be a number",
                    field.key
                ));
            };
            if let Some(min) = field.min {
                if number < min {
                    return Err(format!(
                        "Plugin config field {} must be greater than or equal to {}",
                        field.key, min
                    ));
                }
            }
            if let Some(max) = field.max {
                if number > max {
                    return Err(format!(
                        "Plugin config field {} must be less than or equal to {}",
                        field.key, max
                    ));
                }
            }
        }
        _ => {}
    }

    Ok(())
}

pub(super) fn resolve_effective_plugin_config_values(
    manifest: &PluginManifest,
    stored: &BTreeMap<String, Value>,
) -> Result<BTreeMap<String, Value>, String> {
    let mut resolved = BTreeMap::new();

    for field in &manifest.config_fields {
        let value = stored
            .get(&field.key)
            .cloned()
            .or_else(|| field.default_value.clone());
        match value {
            Some(value) => {
                validate_runtime_config_value(field, &value)?;
                resolved.insert(field.key.clone(), value);
            }
            None if field.required => {
                return Err(format!(
                    "Plugin config field {} ({}) is required but not configured",
                    field.key, field.label
                ));
            }
            None => {}
        }
    }

    Ok(resolved)
}

pub(super) fn build_installation_from_registry(
    registry: &PluginRegistry,
    manifest: &PluginManifest,
    source: PluginPackageSource,
    installed_path: String,
) -> PluginInstallation {
    let entry = registry.installations.get(&manifest.plugin_id);
    let config_values = manifest
        .config_fields
        .iter()
        .filter(|field| !field.sensitive)
        .filter_map(|field| {
            let value = entry
                .and_then(|record| record.config_values.get(&field.key))
                .cloned();
            value.map(|value| (field.key.clone(), value))
        })
        .collect();
    let config_value_status = manifest
        .config_fields
        .iter()
        .map(|field| {
            let is_set = entry
                .and_then(|value| value.config_values.get(&field.key))
                .or_else(|| field.default_value.as_ref())
                .is_some();
            (field.key.clone(), is_set)
        })
        .collect();
    PluginInstallation {
        plugin_id: manifest.plugin_id.clone(),
        enabled: entry.map(|value| value.enabled).unwrap_or(false),
        trusted: entry.map(|value| value.trusted).unwrap_or(false),
        approved_permissions: entry
            .map(|value| value.approved_permissions.clone())
            .unwrap_or_default(),
        selected_provider: entry
            .and_then(|value| value.selected_provider.clone())
            .or_else(|| manifest.runtime.preferred_provider.clone()),
        timeout_sec_override: entry.and_then(|value| value.timeout_sec_override),
        installed_path,
        source: entry
            .and_then(|value| value.source.clone())
            .unwrap_or(source),
        last_resolved_provider: entry.and_then(|value| value.last_resolved_provider.clone()),
        last_resolved_source: entry.and_then(|value| value.last_resolved_source.clone()),
        last_execution_status: entry.and_then(|value| value.last_execution_status.clone()),
        last_error: entry.and_then(|value| value.last_error.clone()),
        config_values,
        config_value_status,
        signature_status: entry.and_then(|value| value.signature_status.clone()),
        signer_key_id: entry.and_then(|value| value.signer_key_id.clone()),
        signer_fingerprint: entry.and_then(|value| value.signer_fingerprint.clone()),
        signature_algorithm: entry.and_then(|value| value.signature_algorithm.clone()),
        signed_at: entry.and_then(|value| value.signed_at.clone()),
    }
}
