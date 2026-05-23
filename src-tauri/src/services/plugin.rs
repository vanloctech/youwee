use std::collections::{BTreeMap, VecDeque};
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use uuid::Uuid;
use zip::ZipArchive;

use crate::database::{add_log_internal, clear_plugin_logs_from_db};
use crate::types::{
    PackagedPluginBuildInfo, PackagedPluginChecksums, PackagedPluginSignature,
    PluginChainMutation, PluginChainState, PluginCompatibilitySpec, PluginConfigField,
    PluginConfigFieldInputType, PluginExecutionOutputEvent, PluginExecutionResult,
    PluginExecutionStatusEvent, PluginFilesystemPermission, PluginI18nSpec,
    PluginInstallation, PluginManifest, PluginPackageInspection, PluginPackageSource,
    PluginPackageSourceKind, PluginPermissionApproval, PluginPermissionRequest,
    PluginProvider, PluginRuntimeLanguage, PluginRuntimeSpec, PluginSignaturePayload,
    PluginSummary, PluginTriggerWorkflow, PluginWorkflowFailurePolicy, PluginWorkflowRun,
    PluginWorkflowRunStatus, PluginWorkflowStepConfig, PluginWorkflowStepSnapshot,
    PostDownloadPluginPayload, RuntimeProviderStatus,
};
use crate::utils::CommandExt;

const PLUGINS_DIR_NAME: &str = "plugins";
const REGISTRY_FILE_NAME: &str = "registry.json";
const SDK_JS_PACKAGE_JSON: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/package.json"));
const SDK_JS_INDEX: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/index.js"));
const SDK_JS_RUNTIME: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/runtime.js"));
const SDK_JS_RUNTIME_CLI: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/runtime-cli.js"));
const SDK_JS_AI: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/ai.js"));
const SDK_JS_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/index.d.ts"));
const SDK_JS_RUNTIME_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/runtime.d.ts"));
const SDK_JS_RUNTIME_CLI_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/runtime-cli.d.ts"));
const SDK_JS_AI_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/ai.d.ts"));
const SDK_JS_MANIFEST: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/manifest.js"));
const SDK_JS_MANIFEST_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/manifest.d.ts"));
const SDK_JS_COMPATIBILITY: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/compatibility.js"));
const SDK_JS_COMPATIBILITY_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/compatibility.d.ts"));
const SDK_JS_SCHEMA: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/schema.js"));
const SDK_JS_SCHEMA_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/schema.d.ts"));
const SDK_JS_SHARED_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/types.d.ts"));
const SDK_JS_SHARED_RUNTIME_TYPES: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/types.js"));
const SDK_JS_README: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/README.md"));

static PLUGIN_WORKFLOW_QUEUE: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginPermissionApprovalInput {
    pub network: bool,
    #[serde(default)]
    pub fs: Vec<PluginFilesystemPermission>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPluginPackageInput {
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachPluginWorkspaceInput {
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePluginWorkspaceInput {
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    pub destination_root: String,
    #[serde(default)]
    pub triggers: Vec<String>,
    #[serde(default)]
    pub supported_providers: Vec<PluginProvider>,
    #[serde(default)]
    pub preferred_provider: Option<PluginProvider>,
    #[serde(default)]
    pub permissions: PluginPermissionRequest,
    #[serde(default)]
    pub config_fields: Vec<PluginConfigField>,
    #[serde(default)]
    pub timeout_sec: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginConfigValuesInput {
    #[serde(default)]
    pub values: BTreeMap<String, Option<Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeLocaleInput {
    pub locale: String,
    pub fallback_locale: String,
    #[serde(default)]
    pub direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginRegistryEntry {
    enabled: bool,
    trusted: bool,
    #[serde(default)]
    approved_permissions: PluginPermissionApproval,
    #[serde(default)]
    config_values: BTreeMap<String, Value>,
    #[serde(default)]
    selected_provider: Option<PluginProvider>,
    #[serde(default)]
    timeout_sec_override: Option<u64>,
    source: Option<PluginPackageSource>,
    #[serde(default)]
    last_resolved_provider: Option<PluginProvider>,
    #[serde(default)]
    last_resolved_source: Option<String>,
    #[serde(default)]
    last_execution_status: Option<String>,
    #[serde(default)]
    last_error: Option<String>,
    #[serde(default)]
    signature_status: Option<String>,
    #[serde(default)]
    signer_key_id: Option<String>,
    #[serde(default)]
    signer_fingerprint: Option<String>,
    #[serde(default)]
    signature_algorithm: Option<String>,
    #[serde(default)]
    signed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginTriggerWorkflowRegistry {
    #[serde(default)]
    steps: Vec<PluginWorkflowStepConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginRegistry {
    #[serde(default)]
    installations: BTreeMap<String, PluginRegistryEntry>,
    #[serde(default)]
    default_providers: BTreeMap<String, PluginProvider>,
    #[serde(default)]
    trigger_workflows: BTreeMap<String, PluginTriggerWorkflowRegistry>,
    #[serde(default)]
    app_locale: Option<String>,
    #[serde(default)]
    app_fallback_locale: Option<String>,
    #[serde(default)]
    app_direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginScriptOutput {
    success: Option<bool>,
    message: Option<String>,
    artifacts: Option<Value>,
    metadata: Option<Value>,
    mutations: Option<PluginChainMutation>,
}

#[derive(Debug, Clone)]
struct PreparedPackage {
    manifest: PluginManifest,
    package_root: PathBuf,
    source: PluginPackageSource,
    warnings: Vec<String>,
    package_format: Option<String>,
    package_format_version: Option<u32>,
    builder_sdk_version: Option<String>,
    package_checksum: Option<String>,
    signature_status: Option<String>,
    signer_key_id: Option<String>,
    signer_fingerprint: Option<String>,
    signature_algorithm: Option<String>,
    signed_at: Option<String>,
}

fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    let mut truncated = text.chars().take(max_len).collect::<String>();
    truncated.push_str("...");
    truncated
}

fn combine_plugin_event_details(
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

fn shorten_for_event(text: Option<String>) -> Option<String> {
    text.map(|value| truncate_text(&value, 1500))
}

pub fn plugins_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    Ok(app_data_dir.join(PLUGINS_DIR_NAME))
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(plugins_root(app)?.join(REGISTRY_FILE_NAME))
}

fn ensure_plugins_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = plugins_root(app)?;
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("Failed to create plugins directory {}: {}", root.display(), e))?;
    Ok(root)
}

fn read_registry(app: &AppHandle) -> Result<PluginRegistry, String> {
    let path = registry_path(app)?;
    if !path.exists() {
        return Ok(PluginRegistry::default());
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read plugin registry {}: {}", path.display(), e))?;
    match serde_json::from_str(&raw) {
        Ok(registry) => Ok(registry),
        Err(original_error) => {
            let mut raw_json: Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Failed to parse plugin registry {}: {}", path.display(), e))?;

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

fn write_registry(app: &AppHandle, registry: &PluginRegistry) -> Result<(), String> {
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

fn workflow_queue_lock() -> &'static tokio::sync::Mutex<()> {
    PLUGIN_WORKFLOW_QUEUE.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn workflow_registry_for_trigger<'a>(
    registry: &'a PluginRegistry,
    trigger: &str,
) -> Option<&'a PluginTriggerWorkflowRegistry> {
    registry.trigger_workflows.get(trigger)
}

fn sanitize_slug(input: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;

    for ch in input.trim().chars() {
        let normalized = match ch {
            'a'..='z' | '0'..='9' => Some(ch),
            'A'..='Z' => Some(ch.to_ascii_lowercase()),
            _ => None,
        };

        if let Some(value) = normalized {
            slug.push(value);
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "plugin".to_string()
    } else {
        slug
    }
}

fn install_dir_name(plugin_id: &str, slug: &str) -> String {
    format!("{}-{}", plugin_id, slug)
}

fn installation_path(root: &Path, manifest: &PluginManifest) -> PathBuf {
    root.join(install_dir_name(&manifest.plugin_id, &manifest.slug))
}

fn sanitize_plugin_id(input: &str) -> String {
    let mut normalized = String::new();
    let mut last_separator: Option<char> = None;

    for char in input.trim().chars() {
        if char.is_ascii_alphanumeric() {
            normalized.push(char.to_ascii_lowercase());
            last_separator = None;
            continue;
        }

        let separator = if char == '.' { '.' } else { '-' };
        if normalized.is_empty() || last_separator == Some(separator) {
            continue;
        }
        normalized.push(separator);
        last_separator = Some(separator);
    }

    normalized
        .trim_matches(|char| char == '.' || char == '-')
        .to_string()
}

fn generate_plugin_id(author: Option<&str>, slug: &str) -> String {
    let namespace = author
        .map(sanitize_plugin_id)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "local".to_string());
    let package = sanitize_plugin_id(slug);

    if package.is_empty() {
        namespace
    } else {
        format!("{}.{}", namespace, package)
    }
}

fn find_existing_installation_path(root: &Path, plugin_id: &str) -> Option<PathBuf> {
    std::fs::read_dir(root)
        .ok()?
        .filter_map(|entry| entry.ok())
        .find_map(|entry| {
            let path = entry.path();
            let file_name = path.file_name()?.to_str()?;
            if file_name == plugin_id || file_name.starts_with(&format!("{}-", plugin_id)) {
                Some(path)
            } else {
                None
            }
        })
}

fn default_supported_providers(language: &PluginRuntimeLanguage) -> Vec<PluginProvider> {
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
            && !i18n.supported_locales.iter().any(|locale| locale == default_locale)
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

fn config_value_matches_field_type(field: &PluginConfigField, value: &Value) -> bool {
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
        if seen_option_values.insert(option.value.clone(), true).is_some() {
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

fn validate_manifest(manifest: &PluginManifest, manifest_path: &Path) -> Result<(), String> {
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
        if !matches!(
            icon.as_str(),
            "puzzle"
                | "atom"
                | "plug"
                | "blocks"
                | "package-open"
                | "bot"
                | "shield"
                | "wrench"
                | "globe"
                | "folder-open"
                | "terminal-square"
                | "info"
        ) {
            return Err(format!(
                "Plugin manifest {} declares unsupported icon {}",
                manifest_path.display(),
                icon
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
        if allowed_manifest_triggers().iter().any(|allowed| allowed == trigger) {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct SimpleSemver {
    major: u64,
    minor: u64,
    patch: u64,
}

fn parse_simple_semver(version: &str) -> Option<SimpleSemver> {
    let trimmed = version.trim().trim_start_matches('v');
    let mut parts = trimmed.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some(SimpleSemver { major, minor, patch })
}

fn compare_simple_semver(a: &str, b: &str) -> Result<std::cmp::Ordering, String> {
    let left = parse_simple_semver(a).ok_or_else(|| format!("Invalid semver: {}", a))?;
    let right = parse_simple_semver(b).ok_or_else(|| format!("Invalid semver: {}", b))?;
    Ok(left.cmp(&right))
}

fn satisfies_version_range(version: &str, range: &str) -> Result<bool, String> {
    let clauses = range
        .split(|ch: char| ch.is_whitespace() || ch == ',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if clauses.is_empty() {
        return Err("Version range cannot be empty".to_string());
    }

    for clause in clauses {
        let (operator, raw_version) = if let Some(rest) = clause.strip_prefix(">=") {
            (">=", rest)
        } else if let Some(rest) = clause.strip_prefix("<=") {
            ("<=", rest)
        } else if let Some(rest) = clause.strip_prefix('>') {
            (">", rest)
        } else if let Some(rest) = clause.strip_prefix('<') {
            ("<", rest)
        } else if let Some(rest) = clause.strip_prefix('=') {
            ("=", rest)
        } else {
            ("=", clause)
        };

        let ordering = compare_simple_semver(version, raw_version)?;
        let satisfied = match operator {
            ">=" => ordering != std::cmp::Ordering::Less,
            "<=" => ordering != std::cmp::Ordering::Greater,
            ">" => ordering == std::cmp::Ordering::Greater,
            "<" => ordering == std::cmp::Ordering::Less,
            "=" => ordering == std::cmp::Ordering::Equal,
            _ => return Err(format!("Unsupported version operator in clause: {}", clause)),
        };

        if !satisfied {
            return Ok(false);
        }
    }

    Ok(true)
}

fn current_sdk_version() -> String {
    serde_json::from_str::<serde_json::Value>(SDK_JS_PACKAGE_JSON)
        .ok()
        .and_then(|value| value.get("version").and_then(|value| value.as_str()).map(str::to_string))
        .unwrap_or_else(|| "1.0.3".to_string())
}

fn build_scaffold_compatibility_range(version: &str) -> String {
    if let Some(parsed) = parse_simple_semver(version) {
        format!(">={}.{}.{} <{}.{}.0", parsed.major, parsed.minor, parsed.patch, parsed.major, parsed.minor + 1)
    } else {
        format!("={}", version)
    }
}

fn validate_execution_compatibility(manifest: &PluginManifest) -> Result<(), String> {
    validate_install_compatibility(manifest)
}

fn load_manifest_from_file(manifest_path: &Path) -> Result<PluginManifest, String> {
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

fn load_source_manifest_from_dir(plugin_root: &Path) -> Result<PluginManifest, String> {
    load_manifest_from_file(&plugin_root.join("plugin.json"))
}

fn load_installed_manifest_from_dir(plugin_root: &Path) -> Result<PluginManifest, String> {
    let packaged_manifest = plugin_root.join("manifest.json");
    if packaged_manifest.exists() {
        return load_manifest_from_file(&packaged_manifest);
    }

    load_source_manifest_from_dir(plugin_root)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {}: {}", dst.display(), e))?;

    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {}: {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else if path.is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create directory {}: {}", parent.display(), e)
                })?;
            }
            std::fs::copy(&path, &target).map_err(|e| {
                format!(
                    "Failed to copy file {} to {}: {}",
                    path.display(),
                    target.display(),
                    e
                )
            })?;
        }
    }

    Ok(())
}

fn compute_sha256_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn derive_signer_fingerprint(public_key: &[u8]) -> String {
    compute_sha256_bytes(public_key)
}

fn derive_signer_key_id(public_key: &[u8]) -> String {
    format!("ed25519:sha256:{}", derive_signer_fingerprint(public_key))
}

fn compute_dir_checksum(root: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let mut queue = VecDeque::from([root.to_path_buf()]);
    let mut files = Vec::new();
    while let Some(path) = queue.pop_front() {
        for entry in std::fs::read_dir(&path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                queue.push_back(entry_path);
            } else if entry_path.is_file() {
                files.push(entry_path);
            }
        }
    }
    files.sort();

    let mut hasher = Sha256::new();
    for file in files {
        let relative = file
            .strip_prefix(root)
            .unwrap_or(&file)
            .to_string_lossy()
            .to_string();
        hasher.update(relative.as_bytes());
        let mut bytes = Vec::new();
        std::fs::File::open(&file)
            .map_err(|e| format!("Failed to open {}: {}", file.display(), e))?
            .read_to_end(&mut bytes)
            .map_err(|e| format!("Failed to read {}: {}", file.display(), e))?;
        hasher.update(&bytes);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn extract_zip_to_temp(bytes: &[u8], label: &str) -> Result<PathBuf, String> {
    let temp_root = std::env::temp_dir().join(format!("youwee-plugin-{}-{}", label, Uuid::new_v4()));
    std::fs::create_dir_all(&temp_root).map_err(|e| {
        format!(
            "Failed to create temporary plugin extraction directory {}: {}",
            temp_root.display(),
            e
        )
    })?;

    let cursor = Cursor::new(bytes.to_vec());
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("Failed to open plugin zip archive: {}", e))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| format!("Failed to read zip entry {}: {}", index, e))?;
        let Some(safe_name) = file.enclosed_name().map(|path| path.to_path_buf()) else {
            continue;
        };
        let outpath = temp_root.join(safe_name);
        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| {
                format!(
                    "Failed to create extracted directory {}: {}",
                    outpath.display(),
                    e
                )
            })?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create extracted directory {}: {}", parent.display(), e)
                })?;
            }
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create extracted file {}: {}", outpath.display(), e))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| {
                format!("Failed to extract zip entry to {}: {}", outpath.display(), e)
            })?;
        }
    }

    Ok(temp_root)
}

fn validate_ywp_extension(path: &Path) -> Result<(), String> {
    let is_ywp = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("ywp"))
        .unwrap_or(false);

    if is_ywp {
        Ok(())
    } else {
        Err(format!(
            "Plugin package must use the .ywp extension: {}",
            path.display()
        ))
    }
}

fn resolve_packaged_root(extracted_root: &Path) -> Result<PathBuf, String> {
    let has_layout = |root: &Path| {
        root.join("manifest.json").is_file()
            && root.join("build.json").is_file()
            && root.join("checksums.json").is_file()
    };

    if has_layout(extracted_root) {
        return Ok(extracted_root.to_path_buf());
    }

    let entries = std::fs::read_dir(extracted_root)
        .map_err(|e| format!("Failed to read extracted package root {}: {}", extracted_root.display(), e))?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();

    if entries.len() == 1 {
        let nested = entries[0].path();
        if nested.is_dir() && has_layout(&nested) {
            return Ok(nested);
        }
    }

    Err("Invalid .ywp package layout. Expected manifest.json, build.json, and checksums.json at the package root.".to_string())
}

fn load_packaged_build_info(root: &Path) -> Result<PackagedPluginBuildInfo, String> {
    let path = root.join("build.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn load_packaged_checksums(root: &Path) -> Result<PackagedPluginChecksums, String> {
    let path = root.join("checksums.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn load_packaged_signature(root: &Path) -> Result<PackagedPluginSignature, String> {
    let path = root.join("signature.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn validate_packaged_checksums(
    root: &Path,
    checksums: &PackagedPluginChecksums,
) -> Result<(), String> {
    if checksums.algorithm.to_lowercase() != "sha256" {
        return Err(format!(
            "Unsupported checksums algorithm in .ywp package: {}",
            checksums.algorithm
        ));
    }

    let mut actual_files = Vec::new();
    let mut queue = VecDeque::from([root.to_path_buf()]);
    while let Some(path) = queue.pop_front() {
        for entry in std::fs::read_dir(&path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                queue.push_back(entry_path);
            } else if entry_path.is_file() {
                let relative = normalize_path_for_checksum(root, &entry_path);
                if relative != "checksums.json" && relative != "signature.json" {
                    actual_files.push(relative);
                }
            }
        }
    }
    actual_files.sort();

    let mut expected_files = checksums.files.keys().cloned().collect::<Vec<_>>();
    expected_files.sort();

    if actual_files != expected_files {
        return Err("The .ywp package contents do not match checksums.json.".to_string());
    }

    for relative in expected_files {
        let path = root.join(&relative);
        let bytes = std::fs::read(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        let actual = compute_sha256_bytes(&bytes);
        let expected = checksums
            .files
            .get(&relative)
            .ok_or_else(|| format!("Missing checksum entry for {}", relative))?;
        if &actual != expected {
            return Err(format!(
                "Checksum mismatch in .ywp package for {}",
                relative
            ));
        }
    }

    Ok(())
}

fn validate_packaged_signature_payload(
    payload: &PluginSignaturePayload,
    manifest: &PluginManifest,
    build_info: &PackagedPluginBuildInfo,
    checksums_bytes: &[u8],
) -> Result<(), String> {
    if payload.checksums_path != "checksums.json" {
        return Err("Plugin signature payload must point to checksums.json.".to_string());
    }
    if payload.checksums_sha256 != compute_sha256_bytes(checksums_bytes) {
        return Err("Plugin signature payload does not match checksums.json.".to_string());
    }
    if payload.plugin_id != manifest.plugin_id {
        return Err("Plugin signature payload does not match manifest id.".to_string());
    }
    if payload.plugin_version != manifest.version {
        return Err("Plugin signature payload does not match manifest version.".to_string());
    }
    if payload.package_format != build_info.package_format {
        return Err("Plugin signature payload does not match package format.".to_string());
    }
    if payload.package_format_version != build_info.package_format_version {
        return Err("Plugin signature payload does not match package format version.".to_string());
    }
    Ok(())
}

fn validate_packaged_signature(
    root: &Path,
    manifest: &PluginManifest,
    build_info: &PackagedPluginBuildInfo,
    signature: &PackagedPluginSignature,
) -> Result<(), String> {
    if signature.version != 1 {
        return Err(format!(
            "Unsupported plugin signature version: {}",
            signature.version
        ));
    }
    if !signature.algorithm.eq_ignore_ascii_case("ed25519") {
        return Err(format!(
            "Unsupported plugin signature algorithm: {}",
            signature.algorithm
        ));
    }

    let checksums_path = root.join("checksums.json");
    let checksums_bytes = std::fs::read(&checksums_path)
        .map_err(|e| format!("Failed to read {}: {}", checksums_path.display(), e))?;
    validate_packaged_signature_payload(&signature.payload, manifest, build_info, &checksums_bytes)?;

    let public_key_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature.public_key.trim())
        .map_err(|e| format!("Invalid plugin signature public key: {}", e))?;
    let verifying_key_bytes: [u8; 32] = public_key_bytes
        .as_slice()
        .try_into()
        .map_err(|_| "Invalid plugin signature public key length.".to_string())?;
    let verifying_key = VerifyingKey::from_bytes(&verifying_key_bytes)
        .map_err(|e| format!("Invalid plugin signature public key: {}", e))?;

    let expected_key_id = derive_signer_key_id(&public_key_bytes);
    if signature.key_id != expected_key_id {
        return Err("Plugin signature key id does not match the embedded public key.".to_string());
    }
    let expected_fingerprint = derive_signer_fingerprint(&public_key_bytes);
    if signature.fingerprint != expected_fingerprint {
        return Err(
            "Plugin signature fingerprint does not match the embedded public key.".to_string(),
        );
    }

    let payload_bytes = serde_json::to_vec(&signature.payload)
        .map_err(|e| format!("Failed to serialize plugin signature payload: {}", e))?;
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature.signature.trim())
        .map_err(|e| format!("Invalid plugin signature bytes: {}", e))?;
    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| "Invalid plugin signature length.".to_string())?;
    let ed25519_signature = Signature::from_bytes(&signature_bytes);
    verifying_key
        .verify(&payload_bytes, &ed25519_signature)
        .map_err(|_| "Plugin signature verification failed.".to_string())
}

fn normalize_path_for_checksum(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn validate_packaged_manifest_layout(
    root: &Path,
    manifest: &PluginManifest,
    build_info: &PackagedPluginBuildInfo,
) -> Result<(), String> {
    if build_info.package_format != "ywp" {
        return Err(format!(
            "Unsupported plugin package format: {}",
            build_info.package_format
        ));
    }
    if build_info.package_format_version != 1 {
        return Err(format!(
            "Unsupported plugin package format version: {}",
            build_info.package_format_version
        ));
    }
    if build_info.builder.tool != "youwee-sdk" {
        return Err(format!(
            "Unsupported plugin package builder: {}",
            build_info.builder.tool
        ));
    }
    if manifest.runtime.entrypoint != build_info.bundle.entrypoint {
        return Err("Packaged manifest entrypoint does not match build.json bundle entrypoint.".to_string());
    }
    let entrypoint = root.join(&manifest.runtime.entrypoint);
    if !entrypoint.is_file() {
        return Err(format!(
            "Packaged plugin entrypoint is missing: {}",
            manifest.runtime.entrypoint
        ));
    }

    if let Some(i18n) = manifest.i18n.as_ref() {
        let directory = i18n
            .directory
            .clone()
            .unwrap_or_else(|| "locales".to_string());
        for locale in &i18n.supported_locales {
            let locale_path = root.join(&directory).join(format!("{}.json", locale));
            if !locale_path.is_file() {
                return Err(format!(
                    "Packaged plugin locale file is missing: {}",
                    normalize_path_for_checksum(root, &locale_path)
                ));
            }
        }
        if let Some(default_locale) = i18n.default_locale.as_ref() {
            let default_locale_path = root.join(&directory).join(format!("{}.json", default_locale));
            if !default_locale_path.is_file() {
                return Err(format!(
                    "Packaged plugin default locale file is missing: {}",
                    normalize_path_for_checksum(root, &default_locale_path)
                ));
            }
        }
    }

    Ok(())
}

fn prepared_from_ywp_file(path: &Path) -> Result<PreparedPackage, String> {
    validate_ywp_extension(path)?;
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read plugin package {}: {}", path.display(), e))?;
    prepared_from_ywp_bytes(
        &bytes,
        PluginPackageSourceKind::PackageYwp,
        path.to_string_lossy().to_string(),
    )
}

fn inspect_ywp_file(path: &Path) -> Result<PreparedPackage, String> {
    validate_ywp_extension(path)?;
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read plugin package {}: {}", path.display(), e))?;
    inspect_ywp_bytes(
        &bytes,
        PluginPackageSourceKind::PackageYwp,
        path.to_string_lossy().to_string(),
    )
}

fn inspect_ywp_bytes(
    bytes: &[u8],
    kind: PluginPackageSourceKind,
    value: String,
) -> Result<PreparedPackage, String> {
    let temp_root = extract_zip_to_temp(bytes, "inspect")?;
    let package_root = resolve_packaged_root(&temp_root)?;
    let manifest = load_manifest_from_file(&package_root.join("manifest.json"))?;
    let build_info = load_packaged_build_info(&package_root)?;
    let checksums = load_packaged_checksums(&package_root)?;
    validate_packaged_manifest_layout(&package_root, &manifest, &build_info)?;
    validate_packaged_checksums(&package_root, &checksums)?;
    let package_checksum = compute_sha256_bytes(bytes);

    let mut warnings = Vec::new();
    let signature_path = package_root.join("signature.json");
    let (signature_status, signer_key_id, signer_fingerprint, signature_algorithm, signed_at) =
        match load_packaged_signature(&package_root) {
            Ok(signature) => match validate_packaged_signature(&package_root, &manifest, &build_info, &signature) {
                Ok(()) => (
                    Some("signed".to_string()),
                    Some(signature.key_id),
                    Some(signature.fingerprint),
                    Some(signature.algorithm),
                    Some(signature.signed_at),
                ),
                Err(error) => {
                    warnings.push(error);
                    (
                        Some("invalid-signature".to_string()),
                        Some(signature.key_id),
                        Some(signature.fingerprint),
                        Some(signature.algorithm),
                        Some(signature.signed_at),
                    )
                }
            },
            Err(error) => {
                warnings.push(error);
                (
                    Some(
                        if signature_path.is_file() {
                            "invalid-signature"
                        } else {
                            "missing-signature"
                        }
                        .to_string(),
                    ),
                    None,
                    None,
                    None,
                    None,
                )
            }
        };

    Ok(PreparedPackage {
        manifest,
        package_root,
        source: PluginPackageSource {
            kind,
            value,
            checksum: Some(package_checksum.clone()),
            package_format: Some(build_info.package_format.clone()),
            package_format_version: Some(build_info.package_format_version),
            builder_sdk_version: Some(build_info.builder.version.clone()),
            signature_status: signature_status.clone(),
            signer_key_id: signer_key_id.clone(),
            signer_fingerprint: signer_fingerprint.clone(),
            signature_algorithm: signature_algorithm.clone(),
            signed_at: signed_at.clone(),
        },
        warnings,
        package_format: Some(build_info.package_format),
        package_format_version: Some(build_info.package_format_version),
        builder_sdk_version: Some(build_info.builder.version),
        package_checksum: Some(package_checksum),
        signature_status,
        signer_key_id,
        signer_fingerprint,
        signature_algorithm,
        signed_at,
    })
}

fn prepared_from_ywp_bytes(
    bytes: &[u8],
    kind: PluginPackageSourceKind,
    value: String,
) -> Result<PreparedPackage, String> {
    let temp_root = extract_zip_to_temp(bytes, "import")?;
    let package_root = resolve_packaged_root(&temp_root)?;
    let manifest = load_manifest_from_file(&package_root.join("manifest.json"))?;
    let build_info = load_packaged_build_info(&package_root)?;
    let checksums = load_packaged_checksums(&package_root)?;
    let signature = load_packaged_signature(&package_root)?;
    validate_packaged_manifest_layout(&package_root, &manifest, &build_info)?;
    validate_packaged_checksums(&package_root, &checksums)?;
    validate_packaged_signature(&package_root, &manifest, &build_info, &signature)?;
    let package_checksum = compute_sha256_bytes(bytes);

    Ok(PreparedPackage {
        manifest,
        package_root,
        source: PluginPackageSource {
            kind,
            value,
            checksum: Some(package_checksum.clone()),
            package_format: Some(build_info.package_format.clone()),
            package_format_version: Some(build_info.package_format_version),
            builder_sdk_version: Some(build_info.builder.version.clone()),
            signature_status: Some("signed".to_string()),
            signer_key_id: Some(signature.key_id.clone()),
            signer_fingerprint: Some(signature.fingerprint.clone()),
            signature_algorithm: Some(signature.algorithm.clone()),
            signed_at: Some(signature.signed_at.clone()),
        },
        warnings: Vec::new(),
        package_format: Some(build_info.package_format),
        package_format_version: Some(build_info.package_format_version),
        builder_sdk_version: Some(build_info.builder.version),
        package_checksum: Some(package_checksum),
        signature_status: Some("signed".to_string()),
        signer_key_id: Some(signature.key_id),
        signer_fingerprint: Some(signature.fingerprint),
        signature_algorithm: Some(signature.algorithm),
        signed_at: Some(signature.signed_at),
    })
}

async fn prepare_plugin_package(
    source: &InstallPluginPackageInput,
) -> Result<PreparedPackage, String> {
    prepared_from_ywp_file(Path::new(&source.value))
}

fn manifest_summary(
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

fn load_plugin_readme_content(
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

fn default_provider_for_language(language: &PluginRuntimeLanguage) -> PluginProvider {
    match language {
        PluginRuntimeLanguage::Javascript => PluginProvider::Deno,
        PluginRuntimeLanguage::Python => PluginProvider::Python,
    }
}

fn validate_runtime_config_value(field: &PluginConfigField, value: &Value) -> Result<(), String> {
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

fn resolve_effective_plugin_config_values(
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

fn build_installation_from_registry(
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

fn get_trigger_workflow_internal(app: &AppHandle, trigger: &str) -> Result<PluginTriggerWorkflow, String> {
    let registry = read_registry(app)?;
    Ok(PluginTriggerWorkflow {
        trigger: trigger.to_string(),
        steps: workflow_registry_for_trigger(&registry, trigger)
            .map(|workflow| workflow.steps.clone())
            .unwrap_or_default(),
    })
}

fn snapshot_step_from_plugin(
    plugin: &PluginSummary,
    step: &PluginWorkflowStepConfig,
) -> PluginWorkflowStepSnapshot {
    PluginWorkflowStepSnapshot {
        plugin_id: plugin.manifest.plugin_id.clone(),
        plugin_name: plugin.manifest.name.clone(),
        plugin_version: plugin.manifest.version.clone(),
        selected_provider: plugin.installation.selected_provider.clone(),
        timeout_sec_override: plugin.installation.timeout_sec_override,
        approved_permissions: plugin.installation.approved_permissions.clone(),
        failure_policy: step.failure_policy.clone(),
    }
}

fn resolve_workflow_step_snapshots(
    plugins_by_id: &BTreeMap<String, PluginSummary>,
    workflow: &PluginTriggerWorkflow,
) -> Vec<PluginWorkflowStepSnapshot> {
    workflow
        .steps
        .iter()
        .filter_map(|step| {
            plugins_by_id
                .get(&step.plugin_id)
                .filter(|plugin| plugin.installation.enabled)
                .map(|plugin| snapshot_step_from_plugin(plugin, step))
        })
        .collect()
}

fn build_legacy_workflow_snapshots(
    plugins_by_id: &BTreeMap<String, PluginSummary>,
    registry: &PluginRegistry,
    trigger: &str,
    plugin_ids: &[String],
) -> Vec<PluginWorkflowStepSnapshot> {
    let workflow = workflow_registry_for_trigger(registry, trigger);

    plugin_ids
        .iter()
        .filter_map(|plugin_id| {
            let plugin = plugins_by_id.get(plugin_id)?;
            let step = workflow
                .and_then(|workflow| workflow.steps.iter().find(|step| step.plugin_id == *plugin_id))
                .cloned()
                .unwrap_or(PluginWorkflowStepConfig {
                    plugin_id: plugin_id.clone(),
                    failure_policy: PluginWorkflowFailurePolicy::Continue,
                });
            Some(snapshot_step_from_plugin(plugin, &step))
        })
        .collect()
}

fn build_chain_state(payload: &PostDownloadPluginPayload) -> PluginChainState {
    PluginChainState {
        job_id: payload.job_id.clone(),
        source: payload.source.clone(),
        download_kind: payload.download_kind.clone(),
        url: payload.url.clone(),
        title: payload.title.clone(),
        thumbnail: payload.thumbnail.clone(),
        history_id: payload.history_id.clone(),
        time_range: payload.time_range.clone(),
        active_filepath: payload.filepath.clone(),
        active_filename: payload.filename.clone(),
        directory: payload.directory.clone(),
        filesize: payload.filesize,
        format: payload.format.clone(),
        quality: payload.quality.clone(),
        extra_files: Vec::new(),
        metadata: None,
    }
}

fn payload_from_chain_state(
    payload: &PostDownloadPluginPayload,
    workflow_run_id: &str,
    step_index: usize,
    step_plugin_id: &str,
    chain_state: &PluginChainState,
) -> PostDownloadPluginPayload {
    PostDownloadPluginPayload {
        job_id: payload.job_id.clone(),
        source: payload.source.clone(),
        trigger: payload.trigger.clone(),
        filepath: chain_state.active_filepath.clone(),
        filename: chain_state.active_filename.clone(),
        directory: chain_state.directory.clone(),
        filesize: chain_state.filesize,
        format: chain_state.format.clone(),
        quality: chain_state.quality.clone(),
        url: chain_state.url.clone(),
        title: chain_state.title.clone(),
        thumbnail: chain_state.thumbnail.clone(),
        history_id: chain_state.history_id.clone(),
        time_range: chain_state.time_range.clone(),
        download_kind: chain_state.download_kind.clone(),
        workflow_run_id: Some(workflow_run_id.to_string()),
        workflow_step_index: Some(step_index),
        workflow_step_plugin_id: Some(step_plugin_id.to_string()),
        chain_state: Some(chain_state.clone()),
    }
}

fn merge_chain_mutation(chain_state: &mut PluginChainState, mutation: &PluginChainMutation) {
    if let Some(active_filepath) = mutation.active_filepath.as_ref() {
        chain_state.active_filepath = active_filepath.clone();
        let path = Path::new(active_filepath);
        if let Some(filename) = path.file_name().and_then(|name| name.to_str()) {
            chain_state.active_filename = filename.to_string();
        }
        if let Some(directory) = path.parent() {
            chain_state.directory = directory.to_string_lossy().to_string();
        }
    }
    if let Some(active_filename) = mutation.active_filename.as_ref() {
        chain_state.active_filename = active_filename.clone();
    }
    if !mutation.extra_files.is_empty() {
        for file in &mutation.extra_files {
            if !chain_state.extra_files.iter().any(|existing| existing == file) {
                chain_state.extra_files.push(file.clone());
            }
        }
    }
    if let Some(metadata_patch) = mutation.metadata_patch.as_ref() {
        match chain_state.metadata.as_mut() {
            Some(Value::Object(current)) => {
                if let Value::Object(patch) = metadata_patch {
                    for (key, value) in patch {
                        current.insert(key.clone(), value.clone());
                    }
                } else {
                    chain_state.metadata = Some(metadata_patch.clone());
                }
            }
            _ => {
                chain_state.metadata = Some(metadata_patch.clone());
            }
        }
    }
}

fn collect_compatibility_issues(manifest: &PluginManifest) -> Result<Vec<String>, String> {
    let Some(compatibility) = manifest.compatibility.as_ref() else {
        return Ok(Vec::new());
    };

    let mut issues = Vec::new();

    if let Some(range) = compatibility.app_version.as_ref() {
        if !satisfies_version_range(env!("CARGO_PKG_VERSION"), range)? {
            issues.push(format!(
                "Requires Youwee app version {} but current app version is {}",
                range,
                env!("CARGO_PKG_VERSION")
            ));
        }
    }

    if let Some(range) = compatibility.sdk_version.as_ref() {
        let sdk_version = current_sdk_version();
        if !satisfies_version_range(&sdk_version, range)? {
            issues.push(format!(
                "Requires youwee-sdk version {} but bundled SDK version is {}",
                range, sdk_version
            ));
        }
    }

    Ok(issues)
}

fn validate_install_compatibility(manifest: &PluginManifest) -> Result<(), String> {
    let issues = collect_compatibility_issues(manifest)?;
    if issues.is_empty() {
        return Ok(());
    }

    Err(format!(
        "Plugin is not compatible with this Youwee build:\n- {}",
        issues.join("\n- ")
    ))
}

pub fn list_plugins_internal(app: &AppHandle) -> Result<Vec<PluginSummary>, String> {
    let root = ensure_plugins_root(app)?;
    let registry = read_registry(app)?;
    let registry_locale = registry.app_locale.clone();
    let registry_fallback_locale = registry.app_fallback_locale.clone();
    let mut plugins_by_id = BTreeMap::<String, PluginSummary>::new();

    for entry in std::fs::read_dir(&root)
        .map_err(|e| format!("Failed to read plugins directory {}: {}", root.display(), e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read plugin entry: {}", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }

        let manifest = match load_installed_manifest_from_dir(&path) {
            Ok(manifest) => manifest,
            Err(error) => {
                add_log_internal("error", "Invalid plugin manifest", Some(&error), None).ok();
                continue;
            }
        };
        let readme_content = load_plugin_readme_content(
            &path,
            &manifest,
            registry_locale.as_deref(),
            registry_fallback_locale.as_deref(),
        );
        let checksum = compute_dir_checksum(&path).ok();
        let build_info = if path.join("build.json").is_file() {
            load_packaged_build_info(&path).ok()
        } else {
            None
        };
        let source_kind = if path.join("manifest.json").is_file() {
            PluginPackageSourceKind::PackageYwp
        } else {
            PluginPackageSourceKind::Workspace
        };
        let installation = build_installation_from_registry(
            &registry,
            &manifest,
            PluginPackageSource {
                kind: source_kind,
                value: path.to_string_lossy().to_string(),
                checksum,
                package_format: build_info
                    .as_ref()
                    .map(|value| value.package_format.clone()),
                package_format_version: build_info
                    .as_ref()
                    .map(|value| value.package_format_version),
                builder_sdk_version: build_info
                    .as_ref()
                    .map(|value| value.builder.version.clone()),
                signature_status: None,
                signer_key_id: None,
                signer_fingerprint: None,
                signature_algorithm: None,
                signed_at: None,
            },
            path.to_string_lossy().to_string(),
        );
        let warnings = collect_compatibility_issues(&manifest).unwrap_or_else(|error| vec![error]);
        plugins_by_id.insert(
            manifest.plugin_id.clone(),
            manifest_summary(manifest, installation, warnings, readme_content),
        );
    }

    for entry in registry.installations.values() {
        let Some(source) = entry.source.as_ref() else {
            continue;
        };
        if source.kind != PluginPackageSourceKind::Workspace {
            continue;
        }

        let workspace_path = PathBuf::from(&source.value);
        if !workspace_path.is_dir() {
            continue;
        }

        let manifest = match load_source_manifest_from_dir(&workspace_path) {
            Ok(manifest) => manifest,
            Err(error) => {
                add_log_internal("error", "Invalid plugin workspace manifest", Some(&error), None).ok();
                continue;
            }
        };
        let readme_content = load_plugin_readme_content(
            &workspace_path,
            &manifest,
            registry_locale.as_deref(),
            registry_fallback_locale.as_deref(),
        );
        let checksum = compute_dir_checksum(&workspace_path).ok();
        let installation = build_installation_from_registry(
            &registry,
            &manifest,
            PluginPackageSource {
                kind: PluginPackageSourceKind::Workspace,
                value: workspace_path.to_string_lossy().to_string(),
                checksum,
                package_format: None,
                package_format_version: None,
                builder_sdk_version: None,
                signature_status: None,
                signer_key_id: None,
                signer_fingerprint: None,
                signature_algorithm: None,
                signed_at: None,
            },
            workspace_path.to_string_lossy().to_string(),
        );
        let warnings = collect_compatibility_issues(&manifest).unwrap_or_else(|error| vec![error]);
        plugins_by_id.insert(
            manifest.plugin_id.clone(),
            manifest_summary(manifest, installation, warnings, readme_content),
        );
    }

    let mut plugins = plugins_by_id.into_values().collect::<Vec<_>>();
    plugins.sort_by(|left, right| {
        left.manifest
            .name
            .to_lowercase()
            .cmp(&right.manifest.name.to_lowercase())
            .then_with(|| left.manifest.plugin_id.cmp(&right.manifest.plugin_id))
    });

    Ok(plugins)
}

pub fn get_plugin_details_internal(app: &AppHandle, plugin_id: &str) -> Result<PluginSummary, String> {
    list_plugins_internal(app)?
        .into_iter()
        .find(|plugin| plugin.manifest.plugin_id == plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))
}

pub async fn inspect_plugin_package_internal(
    app: &AppHandle,
    path: String,
) -> Result<PluginPackageInspection, String> {
    let mut package = inspect_ywp_file(Path::new(&path))?;
    let registry = read_registry(app)?;
    if package.signature_status.as_deref() == Some("signed") {
        if let Some(existing) = registry.installations.get(&package.manifest.plugin_id) {
            if let (Some(existing_fingerprint), Some(next_fingerprint)) = (
                existing.signer_fingerprint.as_deref(),
                package.signer_fingerprint.as_deref(),
            ) {
                if existing_fingerprint != next_fingerprint {
                    package.signature_status = Some("signer-changed".to_string());
                    package.source.signature_status = Some("signer-changed".to_string());
                    package.warnings.push(format!(
                        "Signer changed for {}. Uninstall the existing plugin before installing a package signed by a different key.",
                        package.manifest.plugin_id
                    ));
                }
            }
        }
    }
    let mut warnings = package.warnings;
    warnings.extend(collect_compatibility_issues(&package.manifest)?);
    let readme_content = load_plugin_readme_content(
        &package.package_root,
        &package.manifest,
        registry.app_locale.as_deref(),
        registry.app_fallback_locale.as_deref(),
    );
    Ok(PluginPackageInspection {
        manifest: package.manifest,
        source: package.source,
        warnings,
        readme_content,
        package_format: package.package_format,
        package_format_version: package.package_format_version,
        builder_sdk_version: package.builder_sdk_version,
        package_checksum: package.package_checksum,
        signature_status: package.signature_status,
        signer_key_id: package.signer_key_id,
        signer_fingerprint: package.signer_fingerprint,
        signature_algorithm: package.signature_algorithm,
        signed_at: package.signed_at,
    })
}

pub async fn install_plugin_internal(
    app: &AppHandle,
    source: InstallPluginPackageInput,
    trusted: bool,
) -> Result<PluginSummary, String> {
    let package = prepare_plugin_package(&source).await?;
    if let Err(error) = validate_install_compatibility(&package.manifest) {
        add_log_internal(
            "error",
            &format!("Plugin install blocked: {}", package.manifest.name),
            Some(&error),
            None,
        )
        .ok();
        return Err(error);
    }
    let mut registry = read_registry(app)?;
    let registry_locale = registry.app_locale.clone();
    let registry_fallback_locale = registry.app_fallback_locale.clone();
    if let Some(existing) = registry.installations.get(&package.manifest.plugin_id) {
        let existing_fingerprint = existing.signer_fingerprint.as_deref();
        let next_fingerprint = package.signer_fingerprint.as_deref();
        if let (Some(existing_fingerprint), Some(next_fingerprint)) =
            (existing_fingerprint, next_fingerprint)
        {
            if existing_fingerprint != next_fingerprint {
                return Err(format!(
                    "Plugin signer changed for {}. Uninstall the existing plugin before installing a package signed by a different key.",
                    package.manifest.plugin_id
                ));
            }
        }
    }
    let root = ensure_plugins_root(app)?;
    let destination = installation_path(&root, &package.manifest);
    if let Some(existing_path) = find_existing_installation_path(&root, &package.manifest.plugin_id)
    {
        if existing_path != destination && existing_path.exists() {
            std::fs::remove_dir_all(&existing_path).map_err(|e| {
                format!(
                    "Failed to replace existing plugin installation {}: {}",
                    existing_path.display(),
                    e
                )
            })?;
        }
    }
    if destination.exists() {
        std::fs::remove_dir_all(&destination).map_err(|e| {
            format!(
                "Failed to replace existing plugin installation {}: {}",
                destination.display(),
                e
            )
        })?;
    }
    copy_dir_recursive(&package.package_root, &destination)?;

    let selected_provider = package.manifest.runtime.preferred_provider.clone();
    registry.installations.insert(
        package.manifest.plugin_id.clone(),
        PluginRegistryEntry {
            enabled: false,
            trusted,
            approved_permissions: PluginPermissionApproval::default(),
            config_values: BTreeMap::new(),
            selected_provider,
            timeout_sec_override: None,
            source: Some(package.source.clone()),
            last_resolved_provider: None,
            last_resolved_source: None,
            last_execution_status: Some("installed".to_string()),
            last_error: None,
            signature_status: package.signature_status.clone(),
            signer_key_id: package.signer_key_id.clone(),
            signer_fingerprint: package.signer_fingerprint.clone(),
            signature_algorithm: package.signature_algorithm.clone(),
            signed_at: package.signed_at.clone(),
        },
    );
    write_registry(app, &registry)?;

    let installation = build_installation_from_registry(
        &registry,
        &package.manifest,
        package.source,
        destination.to_string_lossy().to_string(),
    );
    let readme_content = load_plugin_readme_content(
        &destination,
        &package.manifest,
        registry_locale.as_deref(),
        registry_fallback_locale.as_deref(),
    );

    add_log_internal(
        "info",
        &format!("Installed plugin: {}", package.manifest.name),
        Some(&format!("Plugin ID: {}", package.manifest.plugin_id)),
        None,
    )
    .ok();

    Ok(manifest_summary(
        package.manifest,
        installation,
        Vec::new(),
        readme_content,
    ))
}

pub async fn install_plugin_package_internal(
    app: &AppHandle,
    path: String,
    trusted: bool,
) -> Result<PluginSummary, String> {
    install_plugin_internal(
        app,
        InstallPluginPackageInput { value: path },
        trusted,
    )
    .await
}

pub fn attach_plugin_workspace_internal(
    app: &AppHandle,
    input: AttachPluginWorkspaceInput,
) -> Result<PluginSummary, String> {
    let workspace_path = PathBuf::from(input.value.trim());
    if !workspace_path.exists() || !workspace_path.is_dir() {
        return Err(format!(
            "Plugin workspace folder not found: {}",
            workspace_path.display()
        ));
    }

    let manifest = load_source_manifest_from_dir(&workspace_path)?;
    validate_install_compatibility(&manifest)?;

    let packaged_install_path = installation_path(&ensure_plugins_root(app)?, &manifest);
    if packaged_install_path.exists() {
        return Err(format!(
            "A packaged plugin with id {} is already installed. Uninstall it before attaching a workspace.",
            manifest.plugin_id
        ));
    }

    let checksum = compute_dir_checksum(&workspace_path).ok();
    let mut registry = read_registry(app)?;
    let registry_locale = registry.app_locale.clone();
    let registry_fallback_locale = registry.app_fallback_locale.clone();
    let existing = registry.installations.get(&manifest.plugin_id).cloned();
    registry.installations.insert(
        manifest.plugin_id.clone(),
        PluginRegistryEntry {
            enabled: existing.as_ref().map(|value| value.enabled).unwrap_or(false),
            trusted: true,
            approved_permissions: existing
                .as_ref()
                .map(|value| value.approved_permissions.clone())
                .unwrap_or_default(),
            config_values: existing
                .as_ref()
                .map(|value| value.config_values.clone())
                .unwrap_or_default(),
            selected_provider: existing
                .as_ref()
                .and_then(|value| value.selected_provider.clone())
                .or_else(|| manifest.runtime.preferred_provider.clone()),
            timeout_sec_override: existing.as_ref().and_then(|value| value.timeout_sec_override),
            source: Some(PluginPackageSource {
                kind: PluginPackageSourceKind::Workspace,
                value: workspace_path.to_string_lossy().to_string(),
                checksum: checksum.clone(),
                package_format: None,
                package_format_version: None,
                builder_sdk_version: None,
                signature_status: None,
                signer_key_id: None,
                signer_fingerprint: None,
                signature_algorithm: None,
                signed_at: None,
            }),
            last_resolved_provider: existing
                .as_ref()
                .and_then(|value| value.last_resolved_provider.clone()),
            last_resolved_source: existing
                .as_ref()
                .and_then(|value| value.last_resolved_source.clone()),
            last_execution_status: Some("attached".to_string()),
            last_error: None,
            signature_status: None,
            signer_key_id: None,
            signer_fingerprint: None,
            signature_algorithm: None,
            signed_at: None,
        },
    );
    write_registry(app, &registry)?;

    add_log_internal(
        "info",
        &format!("Attached plugin workspace: {}", manifest.name),
        Some(&format!(
            "workspace: {}\npluginId: {}",
            workspace_path.display(),
            manifest.plugin_id
        )),
        None,
    )
    .ok();

    let installation = build_installation_from_registry(
        &registry,
        &manifest,
        PluginPackageSource {
            kind: PluginPackageSourceKind::Workspace,
            value: workspace_path.to_string_lossy().to_string(),
            checksum,
            package_format: None,
            package_format_version: None,
            builder_sdk_version: None,
            signature_status: None,
            signer_key_id: None,
            signer_fingerprint: None,
            signature_algorithm: None,
            signed_at: None,
        },
        workspace_path.to_string_lossy().to_string(),
    );

    let warnings = collect_compatibility_issues(&manifest).unwrap_or_default();
    let readme_content = load_plugin_readme_content(
        &workspace_path,
        &manifest,
        registry_locale.as_deref(),
        registry_fallback_locale.as_deref(),
    );
    Ok(manifest_summary(
        manifest,
        installation,
        warnings,
        readme_content,
    ))
}

pub fn uninstall_plugin_internal(app: &AppHandle, plugin_id: &str) -> Result<(), String> {
    let plugin = get_plugin_details_internal(app, plugin_id)?;
    let installation_path = PathBuf::from(&plugin.installation.installed_path);

    if plugin.installation.source.kind == PluginPackageSourceKind::PackageYwp && installation_path.exists() {
        std::fs::remove_dir_all(&installation_path).map_err(|e| {
            format!(
                "Failed to remove plugin files at {}: {}",
                installation_path.display(),
                e
            )
        })?;
    }

    let mut registry = read_registry(app)?;
    registry.installations.remove(plugin_id);
    for workflow in registry.trigger_workflows.values_mut() {
        workflow.steps.retain(|step| step.plugin_id != plugin_id);
    }
    write_registry(app, &registry)?;

    clear_plugin_logs_from_db(plugin_id.to_string()).ok();
    add_log_internal(
        "info",
        &format!(
            "{} plugin: {}",
            if plugin.installation.source.kind == PluginPackageSourceKind::Workspace {
                "Detached"
            } else {
                "Uninstalled"
            },
            plugin.manifest.name
        ),
        Some(&format!("Plugin ID: {}", plugin_id)),
        None,
    )
    .ok();

    Ok(())
}

pub fn create_plugin_workspace_internal(
    _app: &AppHandle,
    input: CreatePluginWorkspaceInput,
) -> Result<crate::types::PluginWorkspaceSummary, String> {
    let CreatePluginWorkspaceInput {
        name,
        icon,
        id,
        slug,
        version,
        description,
        author,
        homepage,
        repository,
        license,
        destination_root,
        triggers,
        supported_providers,
        preferred_provider,
        permissions,
        config_fields,
        timeout_sec,
    } = input;

    let name = name.trim();
    if name.is_empty() {
        return Err("Plugin name cannot be empty".to_string());
    }

    let slug = slug.as_deref().map(sanitize_slug).unwrap_or_else(|| sanitize_slug(name));
    let plugin_id = id
        .as_deref()
        .map(sanitize_plugin_id)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| generate_plugin_id(author.as_deref(), &slug));
    let supported_providers = if supported_providers.is_empty() {
        vec![PluginProvider::Deno]
    } else {
        supported_providers
    };
    let preferred_provider = preferred_provider
        .clone()
        .filter(|provider| supported_providers.contains(provider))
        .or_else(|| supported_providers.first().cloned());
    let triggers = if triggers.is_empty() {
        vec!["download.completed".to_string()]
    } else {
        triggers
            .into_iter()
            .map(|trigger| trigger.trim().to_string())
            .filter(|trigger| !trigger.is_empty())
            .collect()
    };
    let manifest = PluginManifest {
        plugin_id: plugin_id.clone(),
        slug: slug.clone(),
        name: name.to_string(),
        version: version
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("0.1.0")
            .to_string(),
        icon: icon
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string),
        description: Some(
            description
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Describe what this plugin does.")
                .to_string(),
        ),
        author: author
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string),
        homepage: homepage
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string),
        repository: repository
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string),
        license: Some(
            license
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("MIT")
                .to_string(),
        ),
        runtime: PluginRuntimeSpec {
            language: PluginRuntimeLanguage::Javascript,
            supported_providers,
            preferred_provider,
            entrypoint: "src/plugin.js".to_string(),
        },
        compatibility: Some(PluginCompatibilitySpec {
            app_version: Some(build_scaffold_compatibility_range(env!("CARGO_PKG_VERSION"))),
            sdk_version: Some(build_scaffold_compatibility_range(&current_sdk_version())),
        }),
        triggers,
        permissions,
        config_fields,
        timeout_sec: timeout_sec.unwrap_or(60).max(1),
        readme: Some("README.md".to_string()),
        checksum: None,
        published_at: None,
        i18n: Some(PluginI18nSpec {
            default_locale: Some("en".to_string()),
            supported_locales: vec!["en".to_string()],
            directory: Some("locales".to_string()),
        }),
    };
    validate_manifest(&manifest, Path::new("plugin.json"))?;

    let destination_root = PathBuf::from(destination_root.trim());
    if destination_root.as_os_str().is_empty() {
        return Err("Workspace location cannot be empty".to_string());
    }
    if !destination_root.exists() || !destination_root.is_dir() {
        return Err(format!(
            "Workspace location must be an existing folder: {}",
            destination_root.display()
        ));
    }

    let destination = destination_root.join(&manifest.slug);
    if destination.exists() {
        return Err(format!(
            "Plugin workspace destination already exists: {}",
            destination.display()
        ));
    }
    std::fs::create_dir_all(destination.join("src")).map_err(|e| {
        format!(
            "Failed to create plugin scaffold directory {}: {}",
            destination.display(),
            e
        )
    })?;
    std::fs::create_dir_all(destination.join("examples")).map_err(|e| {
        format!(
            "Failed to create plugin examples directory {}: {}",
            destination.join("examples").display(),
            e
        )
    })?;
    std::fs::create_dir_all(destination.join(".github").join("workflows")).map_err(|e| {
        format!(
            "Failed to create plugin workflow directory {}: {}",
            destination.join(".github").join("workflows").display(),
            e
        )
    })?;
    std::fs::create_dir_all(destination.join("locales")).map_err(|e| {
        format!(
            "Failed to create plugin locales directory {}: {}",
            destination.join("locales").display(),
            e
        )
    })?;

    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize plugin manifest: {}", e))?;
    std::fs::write(destination.join("plugin.json"), manifest_json).map_err(|e| {
        format!(
            "Failed to write plugin manifest {}: {}",
            destination.join("plugin.json").display(),
            e
        )
    })?;
    std::fs::write(
        destination.join("package.json"),
        build_scaffold_package_json(&manifest),
    )
    .map_err(|e| {
        format!(
            "Failed to write plugin package.json {}: {}",
            destination.join("package.json").display(),
            e
        )
    })?;
    std::fs::write(
        destination.join("src").join("plugin.js"),
        build_scaffold_plugin_module(&manifest),
    )
    .map_err(|e| {
        format!(
            "Failed to write plugin module {}: {}",
            destination.join("src").join("plugin.js").display(),
            e
        )
    })?;
    std::fs::write(
        destination.join("locales").join("en.json"),
        build_scaffold_locale_file(),
    )
    .map_err(|e| {
        format!(
            "Failed to write scaffold locale file {}: {}",
            destination.join("locales").join("en.json").display(),
            e
        )
    })?;
    std::fs::write(destination.join("README.md"), build_scaffold_readme(&manifest)).map_err(|e| {
        format!(
            "Failed to write plugin README {}: {}",
            destination.join("README.md").display(),
            e
        )
    })?;
    std::fs::write(
        destination.join(".github").join("workflows").join("ci.yml"),
        build_scaffold_ci_workflow(),
    )
    .map_err(|e| {
        format!(
            "Failed to write plugin CI workflow {}: {}",
            destination
                .join(".github")
                .join("workflows")
                .join("ci.yml")
                .display(),
            e
        )
    })?;
    std::fs::write(
        destination
            .join(".github")
            .join("workflows")
            .join("release.yml"),
        build_scaffold_release_workflow(),
    )
    .map_err(|e| {
        format!(
            "Failed to write plugin release workflow {}: {}",
            destination
                .join(".github")
                .join("workflows")
                .join("release.yml")
                .display(),
            e
        )
    })?;
    std::fs::write(destination.join("CHANGELOG.md"), build_scaffold_changelog()).map_err(|e| {
        format!(
            "Failed to write plugin changelog {}: {}",
            destination.join("CHANGELOG.md").display(),
            e
        )
    })?;
    std::fs::write(
        destination.join(".gitignore"),
        "dist/\nrelease/\nnode_modules/\n*.youwee-plugin-key.json\n",
    )
    .map_err(|e| {
        format!(
            "Failed to write plugin gitignore {}: {}",
            destination.join(".gitignore").display(),
            e
        )
    })?;
    let payload = sample_download_payload();
    let payload_json = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize sample payload: {}", e))?;
    std::fs::write(
        destination.join("examples").join("payload.download.completed.json"),
        payload_json,
    )
    .map_err(|e| {
        format!(
            "Failed to write sample payload {}: {}",
            destination
                .join("examples")
                .join("payload.download.completed.json")
                .display(),
            e
        )
    })?;
    std::fs::write(
        destination.join("examples").join("result.success.json"),
        build_scaffold_success_result_example(),
    )
    .map_err(|e| {
        format!(
            "Failed to write sample success result {}: {}",
            destination
                .join("examples")
                .join("result.success.json")
                .display(),
            e
        )
    })?;
    std::fs::write(
        destination.join("examples").join("result.failure.json"),
        build_scaffold_failure_result_example(),
    )
    .map_err(|e| {
        format!(
            "Failed to write sample failure result {}: {}",
            destination
                .join("examples")
                .join("result.failure.json")
                .display(),
            e
        )
    })?;

    add_log_internal(
        "info",
        &format!("Created plugin workspace: {}", manifest.name),
        Some(&format!(
            "workspace: {}\npluginId: {}",
            destination.display(),
            manifest.plugin_id
        )),
        None,
    )
    .ok();
    Ok(crate::types::PluginWorkspaceSummary {
        plugin_id: manifest.plugin_id,
        slug: manifest.slug,
        name: manifest.name,
        path: destination.to_string_lossy().to_string(),
        manifest_path: destination.join("plugin.json").to_string_lossy().to_string(),
        package_json_path: destination.join("package.json").to_string_lossy().to_string(),
        readme_path: destination.join("README.md").to_string_lossy().to_string(),
    })
}

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
        .filter(|step| valid_plugin_ids.iter().any(|plugin_id| plugin_id == &step.plugin_id))
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

pub async fn open_plugin_directory_internal(app: &AppHandle, plugin_id: &str) -> Result<(), String> {
    let plugin = get_plugin_details_internal(app, plugin_id)?;
    let path = plugin.installation.installed_path.clone();

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open plugin directory: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("explorer");
        cmd.arg(&path);
        cmd.hide_window();
        cmd.spawn()
            .map_err(|e| format!("Failed to open plugin directory: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open plugin directory: {}", e))?;
    }

    Ok(())
}

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
    let first_line = String::from_utf8_lossy(&output.stdout).lines().next()?.trim().to_string();
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
                (Some(path.to_string_lossy().to_string()), Some(source.to_string()))
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

fn resolve_plugin_entrypoint(plugin_dir: &Path, entrypoint: &str) -> Result<PathBuf, String> {
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

fn collect_missing_permissions(
    requested: &PluginPermissionRequest,
    approved: &PluginPermissionApproval,
) -> Vec<String> {
    let mut missing = Vec::new();
    if requested.network && !approved.network {
        missing.push("network".to_string());
    }
    for permission in &requested.fs {
        if !approved.fs.iter().any(|approved_permission| approved_permission == permission) {
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

fn path_scope_variants(path: &Path) -> Vec<PathBuf> {
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

fn build_permission_path_scopes(
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

fn push_allow_flag(args: &mut Vec<String>, flag_name: &str, values: &[PathBuf]) {
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

async fn resolve_provider_command(
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
            path.map(|value| (value.to_string_lossy().to_string(), Some("system".to_string())))
                .ok_or_else(|| "Python runtime is not available".to_string())
        }
    }
}

fn emit_plugin_runtime_output(
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
        match trimmed
            .trim_start()
            .strip_prefix('[')
            .and_then(|value| value.split_once(']').map(|(level, _)| level.to_ascii_lowercase()))
        {
            Some(level) if level == "info" || level == "debug" => "info",
            Some(level) if level == "warn" => "stderr",
            Some(level) if level == "error" => "error",
            _ => "stderr",
        }
    };
    let details = format!("pluginId: {} | pluginName: {} | stream: {}", plugin_id, plugin_name, stream);
    add_log_internal(log_type, &chunk, Some(&details), log_url).ok();

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

async fn capture_process_stream<R>(
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

fn output_to_string(raw: &[u8]) -> String {
    let text = String::from_utf8_lossy(raw);
    text.trim_end_matches(&['\r', '\n'][..]).to_string()
}

fn plugin_output_details(stdout: &str, stderr: &str) -> String {
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

fn parse_plugin_result(stdout: &str) -> Option<PluginScriptOutput> {
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
fn plugin_exit_reason(status: &std::process::ExitStatus) -> String {
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
fn plugin_exit_reason(status: &std::process::ExitStatus) -> String {
    status
        .code()
        .map_or_else(|| "terminated".to_string(), |code| format!("code {}", code))
}

async fn capture_process_stream_err(
    app: AppHandle,
    stream_name: &str,
    plugin_id: String,
    plugin_name: String,
    run_id: Option<String>,
    reader: tokio::process::ChildStderr,
    log_url: Option<String>,
    media_title: Option<String>,
    filename: Option<String>,
) -> Vec<u8> {
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

async fn execute_plugin(
    app: &AppHandle,
    plugin: &PluginSummary,
    run_id: &str,
    payload: &PostDownloadPluginPayload,
) -> Result<(PluginExecutionResult, PluginProvider, Option<String>), String> {
    let timeout_sec = plugin
        .installation
        .timeout_sec_override
        .unwrap_or(plugin.manifest.timeout_sec)
        .max(1);
    let selected_provider = plugin
        .installation
        .selected_provider
        .clone()
        .or(plugin.manifest.runtime.preferred_provider.clone())
        .unwrap_or_else(|| default_provider_for_language(&plugin.manifest.runtime.language));
    if !plugin
        .manifest
        .runtime
        .supported_providers
        .iter()
        .any(|provider| provider == &selected_provider)
    {
        return Err(format!(
            "Plugin does not support provider {}",
            selected_provider.as_str()
        ));
    }

    let missing_permissions =
        collect_missing_permissions(&plugin.manifest.permissions, &plugin.installation.approved_permissions);
    if !missing_permissions.is_empty() {
        return Err(format!(
            "Plugin requires unapproved permissions: {}",
            missing_permissions.join(", ")
        ));
    }

    validate_execution_compatibility(&plugin.manifest)?;

    let plugin_dir = PathBuf::from(&plugin.installation.installed_path);
    let entrypoint = resolve_plugin_entrypoint(&plugin_dir, &plugin.manifest.runtime.entrypoint)?;
    let (command_path, resolved_source) = resolve_provider_command(app, &selected_provider).await?;
    let registry = read_registry(app).unwrap_or_default();
    let stored_config_values = registry
        .installations
        .get(&plugin.manifest.plugin_id)
        .map(|entry| entry.config_values.clone())
        .unwrap_or_default();
    let resolved_config_values =
        resolve_effective_plugin_config_values(&plugin.manifest, &stored_config_values)?;
    let app_locale = registry.app_locale.clone().unwrap_or_else(|| "en".to_string());
    let app_fallback_locale = registry
        .app_fallback_locale
        .clone()
        .unwrap_or_else(|| "en".to_string());
    let app_direction = registry
        .app_direction
        .clone()
        .unwrap_or_else(|| "ltr".to_string());
    let ffmpeg_path = crate::services::get_ffmpeg_path(app)
        .await
        .map(|path| path.to_string_lossy().to_string());
    let ytdlp_path = crate::services::get_ytdlp_path(app)
        .await
        .map(|(path, _)| path.to_string_lossy().to_string());
    let ai_config = crate::commands::get_ai_config(app.clone()).await.unwrap_or_default();

    let payload_json = serde_json::to_vec(payload)
        .map_err(|e| format!("Failed to serialize plugin payload: {}", e))?;
    let payload_file = std::fs::canonicalize(PathBuf::from(&payload.filepath))
        .unwrap_or_else(|_| PathBuf::from(&payload.filepath));
    let (mut allow_read_scopes, allow_write_scopes) = build_permission_path_scopes(
        &plugin_dir,
        &payload_file,
        &plugin.manifest,
        &resolved_config_values,
    )?;
    let app_sdk_runtime_bundle = if matches!(
        (&plugin.manifest.runtime.language, &selected_provider),
        (PluginRuntimeLanguage::Javascript, PluginProvider::Deno)
    ) {
        Some(ensure_app_sdk_runtime_bundle(app)?)
    } else {
        None
    };
    if let Some(bundle_root) = app_sdk_runtime_bundle.as_ref() {
        allow_read_scopes.extend(path_scope_variants(bundle_root));
        allow_read_scopes.sort();
        allow_read_scopes.dedup();
    }

    let mut command_args = Vec::<String>::new();
    match selected_provider {
        PluginProvider::Deno => {
            command_args.push("run".to_string());
            command_args.push("--quiet".to_string());
            command_args.push("--unstable-detect-cjs".to_string());
            command_args.push("--node-modules-dir=auto".to_string());
            command_args.push("--allow-env".to_string());
            if plugin.manifest.permissions.network {
                command_args.push("--allow-net".to_string());
            }
            push_allow_flag(&mut command_args, "allow-read", &allow_read_scopes);
            if !allow_write_scopes.is_empty() {
                push_allow_flag(&mut command_args, "allow-write", &allow_write_scopes);
            }
            let runtime_cli = app_sdk_runtime_bundle
                .as_ref()
                .ok_or_else(|| "Missing app SDK runtime bundle".to_string())?
                .join("dist")
                .join("runtime-cli.js");
            command_args.push(runtime_cli.to_string_lossy().to_string());
        }
        PluginProvider::Python => {
            command_args.push(entrypoint.to_string_lossy().to_string());
        }
    }

    let mut cmd = Command::new(&command_path);
    cmd.args(&command_args)
        .current_dir(&plugin_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();
    cmd.env(
        "YOUWEE_PLUGIN_TIMEOUT_MS",
        timeout_sec.saturating_mul(1000).to_string(),
    );
    cmd.env("YOUWEE_PLUGIN_ID", &plugin.manifest.plugin_id);
    cmd.env("YOUWEE_PLUGIN_SLUG", &plugin.manifest.slug);
    cmd.env("YOUWEE_PLUGIN_NAME", &plugin.manifest.name);
    cmd.env("YOUWEE_PLUGIN_VERSION", &plugin.manifest.version);
    cmd.env(
        "YOUWEE_PLUGIN_CONFIG_JSON",
        serde_json::to_string(&resolved_config_values)
            .map_err(|e| format!("Failed to serialize plugin config values: {}", e))?,
    );
    cmd.env("YOUWEE_APP_VERSION", env!("CARGO_PKG_VERSION"));
    cmd.env("YOUWEE_APP_LOCALE", &app_locale);
    cmd.env("YOUWEE_APP_FALLBACK_LOCALE", &app_fallback_locale);
    cmd.env("YOUWEE_APP_DIRECTION", &app_direction);
    cmd.env("YOUWEE_PLUGIN_LANGUAGE", plugin.manifest.runtime.language.as_str());
    cmd.env("YOUWEE_PLUGIN_PROVIDER", selected_provider.as_str());
    cmd.env("YOUWEE_PLUGIN_MAIN", entrypoint.to_string_lossy().to_string());
    cmd.env(
        "YOUWEE_PLUGIN_I18N_DEFAULT_LOCALE",
        plugin
            .manifest
            .i18n
            .as_ref()
            .and_then(|value| value.default_locale.clone())
            .unwrap_or_else(|| "en".to_string()),
    );
    cmd.env(
        "YOUWEE_PLUGIN_I18N_SUPPORTED_LOCALES",
        plugin
            .manifest
            .i18n
            .as_ref()
            .map(|value| value.supported_locales.join(","))
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "en".to_string()),
    );
    cmd.env(
        "YOUWEE_PLUGIN_I18N_DIR",
        plugin
            .manifest
            .i18n
            .as_ref()
            .and_then(|value| value.directory.clone())
            .unwrap_or_else(|| "locales".to_string()),
    );
    if let Some(source) = resolved_source.as_ref() {
        cmd.env("YOUWEE_PLUGIN_PROVIDER_SOURCE", source);
    }
    if let Some(path) = ffmpeg_path.as_ref() {
        cmd.env("YOUWEE_FFMPEG_PATH", path);
    }
    if let Some(path) = ytdlp_path.as_ref() {
        cmd.env("YOUWEE_YTDLP_PATH", path);
    }
    cmd.env("YOUWEE_AI_ENABLED", if ai_config.enabled { "true" } else { "false" });
    cmd.env(
        "YOUWEE_AI_PROVIDER",
        serde_json::to_value(&ai_config.provider)
            .ok()
            .and_then(|value| value.as_str().map(|value| value.to_string()))
            .unwrap_or_else(|| "gemini".to_string()),
    );
    cmd.env("YOUWEE_AI_MODEL", &ai_config.model);
    if let Some(value) = ai_config.api_key.as_ref() {
        cmd.env("YOUWEE_AI_API_KEY", value);
    }
    if let Some(value) = ai_config.proxy_url.as_ref() {
        cmd.env("YOUWEE_AI_PROXY_URL", value);
    }
    if let Some(value) = ai_config.ollama_url.as_ref() {
        cmd.env("YOUWEE_AI_OLLAMA_URL", value);
    }
    if let Some(value) = ai_config.lmstudio_url.as_ref() {
        cmd.env("YOUWEE_AI_LMSTUDIO_URL", value);
    }
    if let Some(value) = ai_config.timeout_seconds {
        cmd.env("YOUWEE_AI_TIMEOUT_SECONDS", value.to_string());
    }
    cmd.env(
        "YOUWEE_AI_SUMMARY_STYLE",
        serde_json::to_value(&ai_config.summary_style)
            .ok()
            .and_then(|value| value.as_str().map(|value| value.to_string()))
            .unwrap_or_else(|| "concise".to_string()),
    );
    cmd.env("YOUWEE_AI_SUMMARY_LANGUAGE", &ai_config.summary_language);
    cmd.env(
        "YOUWEE_AI_WHISPER_ENABLED",
        if ai_config.whisper_enabled { "true" } else { "false" },
    );
    if let Some(value) = ai_config.whisper_api_key.as_ref() {
        cmd.env("YOUWEE_AI_WHISPER_API_KEY", value);
    }
    if let Some(value) = ai_config.whisper_endpoint_url.as_ref() {
        cmd.env("YOUWEE_AI_WHISPER_ENDPOINT_URL", value);
    }
    if let Some(value) = ai_config.whisper_model.as_ref() {
        cmd.env("YOUWEE_AI_WHISPER_MODEL", value);
    }
    for (key, value) in &resolved_config_values {
        let serialized = match value {
            Value::String(text) => text.clone(),
            Value::Number(number) => number.to_string(),
            Value::Bool(flag) => flag.to_string(),
            Value::Array(items) => serde_json::to_string(items)
                .map_err(|e| format!("Failed to serialize config field {}: {}", key, e))?,
            _ => continue,
        };
        cmd.env(key, serialized);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start plugin {}: {}", plugin.manifest.plugin_id, e))?;
    let mut stdin = child.stdin.take().ok_or_else(|| "Failed to open plugin stdin".to_string())?;
    stdin
        .write_all(&payload_json)
        .await
        .map_err(|e| format!("Failed to write plugin payload: {}", e))?;
    stdin
        .shutdown()
        .await
        .map_err(|e| format!("Failed to close plugin stdin: {}", e))?;
    drop(stdin);

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open plugin stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to open plugin stderr".to_string())?;

    let plugin_id = plugin.manifest.plugin_id.clone();
    let plugin_name = plugin.manifest.name.clone();
    let log_url = payload.url.clone();
    let media_title = payload.title.clone();
    let filename = Some(payload.filename.clone());
    let log_run_id = Some(run_id.to_string());
    let stdout_task = tokio::spawn(capture_process_stream(
        app.clone(),
        "stdout",
        plugin_id.clone(),
        plugin_name.clone(),
        log_run_id.clone(),
        stdout,
        Some(log_url.clone()),
        media_title.clone(),
        filename.clone(),
    ));
    let stderr_task = tokio::spawn(capture_process_stream_err(
        app.clone(),
        "stderr",
        plugin_id.clone(),
        plugin_name.clone(),
        log_run_id,
        stderr,
        Some(log_url),
        media_title.clone(),
        filename.clone(),
    ));

    let status = match tokio::time::timeout(
        std::time::Duration::from_secs(timeout_sec),
        child.wait(),
    )
    .await
    {
        Ok(result) => result.map_err(|e| format!("Failed waiting for plugin process: {}", e))?,
        Err(_) => {
            if let Err(error) = child.kill().await {
                add_log_internal(
                    "warn",
                    "Failed to stop plugin process after timeout",
                    Some(&format!("pluginId: {}; provider: {} - {}", plugin_id, selected_provider.as_str(), error)),
                    Some(&payload.url),
                )
                .ok();
            }
            let stdout = output_to_string(&stdout_task.await.unwrap_or_default());
            let stderr = output_to_string(&stderr_task.await.unwrap_or_default());

            let mut message = format!("Plugin timed out after {}s", timeout_sec);
            message.push_str(&format!(
                "\nProvider: {}\nResolved source: {}",
                selected_provider.as_str(),
                resolved_source.as_deref().unwrap_or("unknown")
            ));
            if !stderr.is_empty() {
                message.push_str(&format!("\n\nstderr:\n{}", stderr));
            }
            if !stdout.is_empty() {
                message.push_str(&format!("\n\nstdout:\n{}", stdout));
            }
            return Err(message);
        }
    };

    let stdout = output_to_string(&stdout_task.await.unwrap_or_default());
    let stderr = output_to_string(&stderr_task.await.unwrap_or_default());

    if !status.success() {
        let details = plugin_output_details(&stdout, &stderr);
        return Err(format!("Plugin exited with {}.\n{}", plugin_exit_reason(&status), details));
    }

    let parsed_output = parse_plugin_result(&stdout);

    Ok((
        PluginExecutionResult {
            plugin_id: plugin.manifest.plugin_id.clone(),
            success: parsed_output
                .as_ref()
                .and_then(|value| value.success)
                .unwrap_or(true),
            message: parsed_output.as_ref().and_then(|value| value.message.clone()),
            artifacts: parsed_output.as_ref().and_then(|value| value.artifacts.clone()),
            metadata: parsed_output.as_ref().and_then(|value| value.metadata.clone()),
            mutations: parsed_output.as_ref().and_then(|value| value.mutations.clone()),
            stdout: if stdout.is_empty() { None } else { Some(stdout) },
            stderr: if stderr.is_empty() { None } else { Some(stderr) },
        },
        selected_provider,
        resolved_source,
    ))
}

fn workflow_result_status(
    results: &[PluginExecutionResult],
    stopped_early: bool,
) -> PluginWorkflowRunStatus {
    if results.is_empty() {
        return PluginWorkflowRunStatus::Completed;
    }
    let success_count = results.iter().filter(|result| result.success).count();
    if success_count == results.len() {
        PluginWorkflowRunStatus::Completed
    } else if success_count == 0 || stopped_early {
        PluginWorkflowRunStatus::Failed
    } else {
        PluginWorkflowRunStatus::PartialFailed
    }
}

async fn execute_plugin_workflow_run(
    app: AppHandle,
    workflow_run: PluginWorkflowRun,
) -> Vec<PluginExecutionResult> {
    let _queue_guard = workflow_queue_lock().lock().await;

    add_log_internal(
        "info",
        "Post-processing workflow started",
        Some(&format!(
            "Workflow Run ID: {}\nTrigger: {}\nSteps: {}",
            workflow_run.run_id,
            workflow_run.trigger,
            workflow_run.steps.len()
        )),
        Some(&workflow_run.initial_payload.url),
    )
    .ok();

    let plugins = match list_plugins_internal(&app) {
        Ok(plugins) => plugins,
        Err(error) => {
            add_log_internal(
                "error",
                "Failed to load plugins for workflow execution",
                Some(&error),
                Some(&workflow_run.initial_payload.url),
            )
            .ok();
            return Vec::new();
        }
    };
    let plugins_by_id: BTreeMap<String, PluginSummary> = plugins
        .into_iter()
        .map(|plugin| (plugin.manifest.plugin_id.clone(), plugin))
        .collect();

    let mut chain_state = workflow_run.current_chain_state.clone();
    let mut registry = read_registry(&app).unwrap_or_default();
    let mut results = Vec::new();
    let mut stopped_early = false;

    for (step_index, step) in workflow_run.steps.iter().enumerate() {
        let Some(base_plugin) = plugins_by_id.get(&step.plugin_id) else {
            let message = format!(
                "Workflow step plugin not found: {}",
                step.plugin_id
            );
            add_log_internal(
                "error",
                "Post-processing step missing",
                Some(&format!(
                    "Workflow Run ID: {}\nStep: {}\n{}",
                    workflow_run.run_id,
                    step_index + 1,
                    message
                )),
                Some(&chain_state.url),
            )
            .ok();
            results.push(PluginExecutionResult {
                plugin_id: step.plugin_id.clone(),
                success: false,
                message: Some(message),
                artifacts: None,
                metadata: None,
                mutations: None,
                stdout: None,
                stderr: None,
            });
            if step.failure_policy == PluginWorkflowFailurePolicy::StopChain {
                stopped_early = true;
                break;
            }
            continue;
        };

        let mut plugin = base_plugin.clone();
        plugin.installation.enabled = true;
        plugin.installation.selected_provider = step.selected_provider.clone();
        plugin.installation.timeout_sec_override = step.timeout_sec_override;
        plugin.installation.approved_permissions = step.approved_permissions.clone();
        let effective_timeout_sec = plugin
            .installation
            .timeout_sec_override
            .unwrap_or(plugin.manifest.timeout_sec)
            .max(1);

        let selected_provider = plugin
            .installation
            .selected_provider
            .clone()
            .or(plugin.manifest.runtime.preferred_provider.clone())
            .unwrap_or_else(|| default_provider_for_language(&plugin.manifest.runtime.language));
        let step_payload = payload_from_chain_state(
            &workflow_run.initial_payload,
            &workflow_run.run_id,
            step_index,
            &plugin.manifest.plugin_id,
            &chain_state,
        );

        add_log_internal(
            "info",
            &format!("Running post-processing step: {}", plugin.manifest.name),
            Some(&format!(
                "Workflow Run ID: {}\nStep: {} / {}\nPolicy: {}",
                workflow_run.run_id,
                step_index + 1,
                workflow_run.steps.len(),
                match step.failure_policy {
                    PluginWorkflowFailurePolicy::Continue => "continue",
                    PluginWorkflowFailurePolicy::StopChain => "stop-chain",
                }
            )),
            Some(&step_payload.url),
        )
        .ok();

        if let Some(entry) = registry.installations.get_mut(&plugin.manifest.plugin_id) {
            entry.last_execution_status = Some("running".to_string());
            entry.last_error = None;
        }
        app.emit(
            "plugin-execution-status",
            PluginExecutionStatusEvent {
                plugin_id: plugin.manifest.plugin_id.clone(),
                run_id: Some(workflow_run.run_id.clone()),
                plugin_name: Some(plugin.manifest.name.clone()),
                runtime: Some(plugin.manifest.runtime.language.as_str().to_string()),
                provider: Some(selected_provider.as_str().to_string()),
                resolved_provider: None,
                resolved_source: None,
                status: "running".to_string(),
                message: Some(format!("Running {}", plugin.manifest.name)),
                details: Some(format!(
                    "Runtime: {}\nTimeout: {}s\nStep: {} / {}",
                    plugin.manifest.runtime.language.as_str(),
                    effective_timeout_sec,
                    step_index + 1,
                    workflow_run.steps.len()
                )),
                media_title: step_payload.title.clone(),
                filename: Some(step_payload.filename.clone()),
                media_url: Some(step_payload.url.clone()),
            },
        )
        .ok();
        write_registry(&app, &registry).ok();

        match execute_plugin(&app, &plugin, &workflow_run.run_id, &step_payload).await {
            Ok((result, resolved_provider, resolved_source)) => {
                if let Some(entry) = registry.installations.get_mut(&plugin.manifest.plugin_id) {
                    entry.last_resolved_provider = Some(resolved_provider.clone());
                    entry.last_resolved_source = resolved_source.clone();
                    entry.last_execution_status = Some(if result.success {
                        "success".to_string()
                    } else {
                        "error".to_string()
                    });
                    entry.last_error = if result.success {
                        None
                    } else {
                        result.message.clone()
                    };
                }

                if let Some(mutation) = result.mutations.as_ref() {
                    merge_chain_mutation(&mut chain_state, mutation);
                }

                app.emit(
                    "plugin-execution-status",
                    PluginExecutionStatusEvent {
                        plugin_id: plugin.manifest.plugin_id.clone(),
                        run_id: Some(workflow_run.run_id.clone()),
                        plugin_name: Some(plugin.manifest.name.clone()),
                        runtime: Some(plugin.manifest.runtime.language.as_str().to_string()),
                        provider: Some(selected_provider.as_str().to_string()),
                        resolved_provider: Some(resolved_provider.as_str().to_string()),
                        resolved_source: resolved_source.clone(),
                        status: if result.success {
                            "success".to_string()
                        } else {
                            "error".to_string()
                        },
                        message: result.message.clone(),
                        details: shorten_for_event(combine_plugin_event_details(
                            result.message.as_ref(),
                            result.stdout.as_ref(),
                            result.stderr.as_ref(),
                        )),
                        media_title: step_payload.title.clone(),
                        filename: Some(step_payload.filename.clone()),
                        media_url: Some(step_payload.url.clone()),
                    },
                )
                .ok();

                let details = combine_plugin_event_details(
                    result.message.as_ref(),
                    result.stdout.as_ref(),
                    result.stderr.as_ref(),
                );
                add_log_internal(
                    if result.success { "success" } else { "error" },
                    &format!("Post-processing step finished: {}", plugin.manifest.name),
                    Some(&format!(
                        "Workflow Run ID: {}\nStep: {} / {}\n{}",
                        workflow_run.run_id,
                        step_index + 1,
                        workflow_run.steps.len(),
                        details.as_deref().unwrap_or("")
                    )),
                    Some(&step_payload.url),
                )
                .ok();

                let should_stop = !result.success
                    && step.failure_policy == PluginWorkflowFailurePolicy::StopChain;
                results.push(result);
                if should_stop {
                    stopped_early = true;
                    break;
                }
            }
            Err(error) => {
                if let Some(entry) = registry.installations.get_mut(&plugin.manifest.plugin_id) {
                    entry.last_execution_status = Some("error".to_string());
                    entry.last_error = Some(error.clone());
                }
                app.emit(
                    "plugin-execution-status",
                    PluginExecutionStatusEvent {
                        plugin_id: plugin.manifest.plugin_id.clone(),
                        run_id: Some(workflow_run.run_id.clone()),
                        plugin_name: Some(plugin.manifest.name.clone()),
                        runtime: Some(plugin.manifest.runtime.language.as_str().to_string()),
                        provider: Some(selected_provider.as_str().to_string()),
                        resolved_provider: Some(selected_provider.as_str().to_string()),
                        resolved_source: None,
                        status: "error".to_string(),
                        message: Some(error.clone()),
                        details: shorten_for_event(Some(error.clone())),
                        media_title: step_payload.title.clone(),
                        filename: Some(step_payload.filename.clone()),
                        media_url: Some(step_payload.url.clone()),
                    },
                )
                .ok();
                add_log_internal(
                    "error",
                    &format!("Post-processing step failed: {}", plugin.manifest.name),
                    Some(&format!(
                        "Workflow Run ID: {}\nStep: {} / {}\n{}",
                        workflow_run.run_id,
                        step_index + 1,
                        workflow_run.steps.len(),
                        error
                    )),
                    Some(&step_payload.url),
                )
                .ok();

                results.push(PluginExecutionResult {
                    plugin_id: plugin.manifest.plugin_id.clone(),
                    success: false,
                    message: Some(error),
                    artifacts: None,
                    metadata: None,
                    mutations: None,
                    stdout: None,
                    stderr: None,
                });
                if step.failure_policy == PluginWorkflowFailurePolicy::StopChain {
                    stopped_early = true;
                    break;
                }
            }
        }
    }

    write_registry(&app, &registry).ok();

    let final_status = workflow_result_status(&results, stopped_early);
    add_log_internal(
        match final_status {
            PluginWorkflowRunStatus::Completed => "success",
            PluginWorkflowRunStatus::PartialFailed => "error",
            PluginWorkflowRunStatus::Failed => "error",
            PluginWorkflowRunStatus::Queued | PluginWorkflowRunStatus::Running => "info",
        },
        "Post-processing workflow finished",
        Some(&format!(
            "Workflow Run ID: {}\nStatus: {:?}\nSteps run: {}",
            workflow_run.run_id,
            final_status,
            results.len()
        )),
        Some(&workflow_run.initial_payload.url),
    )
    .ok();

    results
}

pub fn enqueue_post_download_workflow(
    app: &AppHandle,
    workflow_steps: Vec<PluginWorkflowStepSnapshot>,
    payload: PostDownloadPluginPayload,
) -> Option<String> {
    if workflow_steps.is_empty() {
        return None;
    }

    let run_id = Uuid::new_v4().to_string();
    let workflow_run = PluginWorkflowRun {
        run_id: run_id.clone(),
        trigger: payload.trigger.clone(),
        status: PluginWorkflowRunStatus::Queued,
        current_chain_state: build_chain_state(&payload),
        initial_payload: payload,
        steps: workflow_steps,
        current_step_index: None,
        failed_step_plugin_id: None,
    };
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = execute_plugin_workflow_run(app_handle, workflow_run).await;
    });
    Some(run_id)
}

pub fn enqueue_plugin_trigger_workflow(
    app: &AppHandle,
    trigger: &str,
    workflow_steps: Option<Vec<PluginWorkflowStepSnapshot>>,
    mut payload: PostDownloadPluginPayload,
) -> Option<String> {
    payload.trigger = trigger.to_string();
    let steps = resolve_download_workflow_snapshot(app, trigger, workflow_steps, &[]);
    enqueue_post_download_workflow(app, steps, payload)
}

pub fn resolve_download_workflow_snapshot(
    app: &AppHandle,
    trigger: &str,
    workflow_steps: Option<Vec<PluginWorkflowStepSnapshot>>,
    legacy_plugin_ids: &[String],
) -> Vec<PluginWorkflowStepSnapshot> {
    if let Some(steps) = workflow_steps {
        if !steps.is_empty() {
            return steps;
        }
    }

    let registry = match read_registry(app) {
        Ok(registry) => registry,
        Err(error) => {
            add_log_internal(
                "error",
                "Failed to read plugin workflow registry",
                Some(&error),
                None,
            )
            .ok();
            return Vec::new();
        }
    };
    let plugins = match list_plugins_internal(app) {
        Ok(plugins) => plugins,
        Err(error) => {
            add_log_internal(
                "error",
                "Failed to load plugins for workflow snapshot",
                Some(&error),
                None,
            )
            .ok();
            return Vec::new();
        }
    };
    let plugins_by_id: BTreeMap<String, PluginSummary> = plugins
        .into_iter()
        .map(|plugin| (plugin.manifest.plugin_id.clone(), plugin))
        .collect();

    if !legacy_plugin_ids.is_empty() {
        return build_legacy_workflow_snapshots(&plugins_by_id, &registry, trigger, legacy_plugin_ids);
    }

    let workflow = PluginTriggerWorkflow {
        trigger: trigger.to_string(),
        steps: workflow_registry_for_trigger(&registry, trigger)
            .map(|workflow| workflow.steps.clone())
            .unwrap_or_default(),
    };
    resolve_workflow_step_snapshots(&plugins_by_id, &workflow)
}

fn sdk_trigger_identifier(trigger: &str) -> &'static str {
    match trigger {
        "download.queued" => "triggers.downloadQueued",
        "download.beforeStart" => "triggers.downloadBeforeStart",
        "download.completed" => "triggers.downloadCompleted",
        "download.failed" => "triggers.downloadFailed",
        _ => "triggers.downloadCompleted",
    }
}

fn build_scaffold_plugin_module(manifest: &PluginManifest) -> String {
    let primary_trigger = manifest
        .triggers
        .first()
        .map(|trigger| sdk_trigger_identifier(trigger))
        .unwrap_or("triggers.downloadCompleted");
    format!(
        r#"const {{ definePlugin, triggers }} = require("youwee-sdk");

module.exports = definePlugin({{
  meta: {{
    name: "{name}",
    version: "{version}",
    description: "{description}",
  }},

  hooks: {{
    [{primary_trigger}]: async (ctx) => {{
      ctx.log.info(ctx.i18n.t("log.hookStarted"), {{
        filename: ctx.file.name,
        trigger: ctx.trigger,
        ffmpegAvailable: ctx.youwee.tools.ffmpeg.available,
      }});

      // Start editing here:
      // 1. Read the downloaded file info from ctx.file
      // 2. Read extra metadata from ctx.media or ctx.download
      // 3. Read plugin config from ctx.config.require("yourConfigKey")
      // 4. Use app capabilities from ctx.youwee.tools / ctx.youwee.ai
      // 5. Return ctx.ok(...) or ctx.fail(...)

      return ctx.ok(ctx.i18n.t("result.success"), {{
        filepath: ctx.file.path,
        filename: ctx.file.name,
        trigger: ctx.trigger,
      }});
    }},
  }},
}});
"#,
        name = manifest.name.replace('"', "\\\""),
        version = manifest.version.replace('"', "\\\""),
        description = manifest
            .description
            .as_deref()
            .unwrap_or("Describe what this plugin does.")
            .replace('"', "\\\""),
        primary_trigger = primary_trigger,
    )
}

fn build_scaffold_locale_file() -> String {
    r#"{
  "log.hookStarted": "Hook started",
  "result.success": "Plugin scaffold ran successfully."
}
"#
    .to_string()
}

fn build_scaffold_package_json(manifest: &PluginManifest) -> String {
    let sdk_version = current_sdk_version();
    format!(
        r#"{{
  "name": "{slug}",
  "version": "{version}",
  "private": true,
  "description": "{description}",
  "type": "commonjs",
  "main": "src/plugin.js",
  "scripts": {{
    "build": "bunx youwee-sdk build",
    "pack": "bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json",
    "keygen": "bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json",
    "test:deno": "YOUWEE_PLUGIN_MAIN=src/plugin.js deno run --quiet --unstable-detect-cjs --allow-env --allow-read=. --allow-write=. node_modules/youwee-sdk/dist/runtime-cli.js"
  }},
  "dependencies": {{
    "youwee-sdk": "^{sdk_version}"
  }}
}}
"#,
        slug = manifest.slug,
        version = manifest.version,
        sdk_version = sdk_version,
        description = manifest
            .description
            .as_deref()
            .unwrap_or("Youwee plugin scaffold")
            .replace('"', "\\\"")
    )
}

fn build_scaffold_ci_workflow() -> String {
    r#"name: Plugin CI

on:
  push:
    branches:
      - main
      - master
      - develop
  pull_request:
  workflow_dispatch:

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: vx

      - name: Install dependencies with Bun
        run: bun install --frozen-lockfile

      - name: Build plugin with Bun toolchain
        run: bun run build

      - name: Run Deno runtime check
        run: bun run test:deno < examples/payload.download.completed.json
"#
    .to_string()
}

fn build_scaffold_release_workflow() -> String {
    r#"name: Plugin Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: vx

      - name: Install dependencies with Bun
        run: bun install --frozen-lockfile

      - name: Restore signing key
        env:
          YOUWEE_PLUGIN_SIGNING_KEY: ${{ secrets.YOUWEE_PLUGIN_SIGNING_KEY }}
        run: |
          if [ -z "$YOUWEE_PLUGIN_SIGNING_KEY" ]; then
            echo "Missing YOUWEE_PLUGIN_SIGNING_KEY secret."
            exit 1
          fi
          printf '%s' "$YOUWEE_PLUGIN_SIGNING_KEY" > plugin.youwee-plugin-key.json

      - name: Build plugin with Bun toolchain
        run: bun run build

      - name: Pack signed plugin with Bun toolchain
        run: bun run pack

      - name: Generate checksum
        run: |
          PACKAGE_FILE=$(find release -maxdepth 1 -name "*.ywp" | head -1)
          if [ -z "$PACKAGE_FILE" ]; then
            echo "No .ywp package found in release/."
            exit 1
          fi
          sha256sum "$PACKAGE_FILE" > "$PACKAGE_FILE.sha256"

      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ github.ref_name }}
          tag_name: ${{ github.ref_name }}
          draft: false
          prerelease: false
          generate_release_notes: true
          files: |
            release/*.ywp
            release/*.sha256
"#
    .to_string()
}

fn write_sdk_package_files(package_root: &Path) -> Result<(), String> {
    std::fs::create_dir_all(package_root.join("dist")).map_err(|e| {
        format!(
            "Failed to create scaffold SDK dist directory {}: {}",
            package_root.join("dist").display(),
            e
        )
    })?;
    let files = [
        ("package.json", SDK_JS_PACKAGE_JSON),
        ("dist/index.js", SDK_JS_INDEX),
        ("dist/runtime.js", SDK_JS_RUNTIME),
        ("dist/runtime-cli.js", SDK_JS_RUNTIME_CLI),
        ("dist/ai.js", SDK_JS_AI),
        ("dist/compatibility.js", SDK_JS_COMPATIBILITY),
        ("dist/schema.js", SDK_JS_SCHEMA),
        ("dist/types.js", SDK_JS_SHARED_RUNTIME_TYPES),
        ("dist/manifest.js", SDK_JS_MANIFEST),
        ("dist/index.d.ts", SDK_JS_TYPES),
        ("dist/runtime.d.ts", SDK_JS_RUNTIME_TYPES),
        ("dist/runtime-cli.d.ts", SDK_JS_RUNTIME_CLI_TYPES),
        ("dist/ai.d.ts", SDK_JS_AI_TYPES),
        ("dist/compatibility.d.ts", SDK_JS_COMPATIBILITY_TYPES),
        ("dist/schema.d.ts", SDK_JS_SCHEMA_TYPES),
        ("dist/manifest.d.ts", SDK_JS_MANIFEST_TYPES),
        ("dist/types.d.ts", SDK_JS_SHARED_TYPES),
        ("README.md", SDK_JS_README),
    ];

    for (relative_path, content) in files {
        let path = package_root.join(relative_path);
        std::fs::write(&path, content)
            .map_err(|e| format!("Failed to write scaffold SDK file {}: {}", path.display(), e))?;
    }

    Ok(())
}

fn ensure_app_sdk_runtime_bundle(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir for SDK bundle: {}", e))?;
    let node_modules_root = app_data_dir
        .join(PLUGINS_DIR_NAME)
        .join(".sdk")
        .join("node_modules");
    let sdk_package_root = node_modules_root.join("youwee-sdk");

    write_sdk_package_files(&sdk_package_root)?;
    Ok(sdk_package_root)
}

fn build_scaffold_readme(manifest: &PluginManifest) -> String {
    format!(
        r#"# {name}

## Overview

This plugin scaffold targets the Youwee JavaScript plugin runtime.

For JavaScript plugins:
- `Deno` is the runtime used by Youwee to execute the plugin
- `Bun` is only the local authoring toolchain for install/build/pack commands in this workspace

Identity:
- `id`: `{plugin_id}`
- `slug`: `{slug}`
- `icon`: `{icon}`
- `language`: `{language}`
- `supportedProviders`: `{providers}`
- `preferredProvider`: `{preferred}`
- `compatibility.appVersion`: use this to declare the minimum compatible Youwee app range
- `compatibility.sdkVersion`: use this to declare the minimum compatible SDK range

Package layout:
- `plugin.json`: plugin manifest consumed by Youwee
- `package.json`: package metadata and local test scripts
- `src/plugin.js`: plugin module and hook implementations
- `locales/en.json`: default translation file for plugin messages
- `README.md`: default documentation shown inside Youwee
- `README.vi.md` / `README.zh-CN.md`: optional localized plugin guides shown when the app language matches
- `dist/`: bundled runtime output generated by the build command
- `release/`: packaged `.ywp` output generated by the pack command
- `examples/`: sample payload and result files

## Entry module

The plugin entrypoint is `src/plugin.js`.

You do not need a per-plugin runner file. Youwee launches the shared bootstrap from
`youwee-sdk` and passes your plugin entry module through the runtime bridge.

## Trigger naming

Use raw runtime trigger strings in `plugin.json`:

```json
{{
  "triggers": ["download.completed", "download.failed"]
}}
```

Use SDK identifiers only inside `src/plugin.js`:

```js
hooks: {{
  [triggers.downloadCompleted]: async (ctx) => {{
    return ctx.ok("Done");
  }},
}}
```

Do not write values like `"triggers.downloadCompleted"` in `plugin.json`.

## Execution model

Execution flow:
1. Youwee dispatches a trigger such as `download.completed`
2. The shared SDK bootstrap loads `src/plugin.js`
3. The SDK reads the payload JSON from `stdin`
4. The SDK creates `ctx`
5. The matching hook runs
6. The hook returns `ctx.ok(...)` or `ctx.fail(...)`
7. The SDK writes the final JSON result to `stdout`

## Hook implementation

Implement hooks in `src/plugin.js`:

```js
hooks: {{
  [triggers.downloadCompleted]: async (ctx) => {{
    return ctx.ok("Done");
  }},
}}
```

Available high-level APIs:
- `ctx.trigger`
- `ctx.download`
- `ctx.file`
- `ctx.media`
- `ctx.config.get(...)`
- `ctx.config.require(...)`
- `ctx.log.info(...)`
- `ctx.i18n.t(...)`
- `ctx.youwee.runtime`
- `ctx.youwee.app.version`
- `ctx.youwee.app.locale`
- `ctx.youwee.sdk.assertAppVersion(...)`
- `ctx.youwee.tools.ffmpeg`
- `ctx.youwee.tools.ytdlp`
- `ctx.youwee.fs.readText(...)`
- `ctx.youwee.http.getJson(...)`
- `ctx.youwee.ai.generateText(...)`
- `ctx.youwee.ai.summarize(...)`
- `ctx.youwee.ai.extractJson(...)`
- `ctx.ok(...)`
- `ctx.fail(...)`

Reference payload: `examples/payload.download.completed.json`

## Result contract

Return a JSON-serializable result:

```json
{{
  "success": true,
  "message": "Human readable summary",
  "artifacts": null,
  "metadata": {{}}
}}
```

Examples:

```js
return ctx.ok("Uploaded successfully", {{ driveFileId: "abc123" }});
return ctx.fail("Missing API token");
```

## Logging contract

Use:
- `ctx.log.debug(message, metadata?)`
- `ctx.log.info(message, metadata?)`
- `ctx.log.warn(message, metadata?)`
- `ctx.log.error(message, metadata?)`

Runtime logs are written to `stderr`.
The final structured result must remain on `stdout`.

## Runtime notes

## Plugin configuration fields

Declare user-facing plugin settings with `configFields` in `plugin.json`.

Example:

```json
{{
  "permissions": {{
    "fs": ["fs.user-selected.write"]
  }},
  "configFields": [
    {{
      "key": "outputDirectory",
      "inputType": "directory",
      "label": "Output folder",
      "required": true
    }}
  ]
}}
```

Read them at runtime with:

```js
const outputDirectory = ctx.config.require("outputDirectory");
```

Do not use `permissions.env` for plugin-defined configuration. It is obsolete.

Use filesystem capabilities instead of hardcoding user-specific absolute paths.
For example, `fs.user-selected.*` should be paired with `file` or `directory`
config fields so Youwee can resolve the actual path on each machine.

This scaffold is optimized for:
- Deno

If your implementation depends on runtime-specific APIs, update
`runtime.supportedProviders` in `plugin.json`.

## Local execution

Install dependencies first with the Bun toolchain:

```bash
bun install
```

Build a bundled runtime artifact with the Bun toolchain:

```bash
bunx youwee-sdk build
```

Create a distributable package with the Bun toolchain:

```bash
bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json
bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json
```

## GitHub Actions

This scaffold includes:

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

Recommended setup:

1. Push the workspace to a GitHub repository
2. Add the secret `YOUWEE_PLUGIN_SIGNING_KEY`
3. Store the full JSON contents of `plugin.youwee-plugin-key.json` in that secret
4. Create a tag like `v0.1.0` to trigger the release workflow

The CI workflow uses Bun for dependency installation and packaging, then runs a Deno runtime check.

The release workflow:

1. restores the signing key from `YOUWEE_PLUGIN_SIGNING_KEY`
2. builds the plugin with the Bun toolchain
3. packs a signed `.ywp`
4. uploads the `.ywp` and `.sha256` files to the GitHub release

Deno runtime check:

```bash
cat examples/payload.download.completed.json | YOUWEE_PLUGIN_MAIN=src/plugin.js deno run --quiet --unstable-detect-cjs --allow-env --allow-read=. --allow-write=. node_modules/youwee-sdk/dist/runtime-cli.js
```

## Packaging

To share this plugin:
1. Run `bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json` if you do not already have a signing key
2. Run `bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json`
3. Find the generated `.ywp` file in `release/`
4. Import the `.ywp` package into Youwee

Youwee imports signed `.ywp` files only.
The source workspace is for development and packaging, not direct end-user installation.

## Next step

Edit `src/plugin.js` first and replace the example hook body with your actual logic.
"#,
        name = manifest.name,
        plugin_id = manifest.plugin_id,
        slug = manifest.slug,
        icon = manifest.icon.as_deref().unwrap_or("puzzle"),
        language = manifest.runtime.language.as_str(),
        providers = manifest
            .runtime
            .supported_providers
            .iter()
            .map(PluginProvider::as_str)
            .collect::<Vec<_>>()
            .join(", "),
        preferred = manifest
            .runtime
            .preferred_provider
            .as_ref()
            .map(PluginProvider::as_str)
            .unwrap_or("none")
    )
}

fn build_scaffold_changelog() -> String {
    "# Changelog\n\n## [0.1.0]\n- Initial scaffold\n".to_string()
}

fn build_scaffold_success_result_example() -> String {
    r#"{
  "success": true,
  "message": "Uploaded successfully",
  "artifacts": null,
  "metadata": {
    "example": true
  }
}
"#
    .to_string()
}

fn build_scaffold_failure_result_example() -> String {
    r#"{
  "success": false,
  "message": "Missing configuration",
  "artifacts": null,
  "metadata": {
    "reason": "GOOGLE_DRIVE_ACCESS_TOKEN is missing"
  }
}
"#
    .to_string()
}

fn sample_download_payload() -> PostDownloadPluginPayload {
    PostDownloadPluginPayload {
        job_id: "sample-job".to_string(),
        source: Some("youtube".to_string()),
        trigger: "download.completed".to_string(),
        filepath: "/tmp/sample.mp4".to_string(),
        filename: "sample.mp4".to_string(),
        directory: "/tmp".to_string(),
        filesize: Some(12345678),
        format: Some("mp4".to_string()),
        quality: Some("1080p".to_string()),
        url: "https://example.com/video".to_string(),
        title: Some("Sample video".to_string()),
        thumbnail: Some("https://example.com/thumb.jpg".to_string()),
        history_id: Some("sample-history-id".to_string()),
        time_range: None,
        download_kind: "download".to_string(),
        workflow_run_id: None,
        workflow_step_index: None,
        workflow_step_plugin_id: None,
        chain_state: None,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use super::{
        build_scaffold_ci_workflow, build_scaffold_package_json, build_scaffold_readme,
        build_scaffold_release_workflow, collect_compatibility_issues, current_sdk_version,
        parse_plugin_result, satisfies_version_range, sanitize_slug, validate_manifest,
        write_sdk_package_files,
    };
    use crate::types::{PluginPermissionRequest, PluginProvider, PluginRuntimeLanguage, PluginRuntimeSpec};

    #[test]
    fn sanitize_slug_normalizes_values() {
        assert_eq!(sanitize_slug(" Google Drive Upload "), "google-drive-upload");
    }

    #[test]
    fn scaffold_readme_mentions_framework_entrypoint() {
        let manifest = crate::types::PluginManifest {
            plugin_id: "id".to_string(),
            slug: "slug".to_string(),
            name: "Name".to_string(),
            version: "0.1.0".to_string(),
            icon: None,
            description: None,
            author: None,
            homepage: None,
            repository: None,
            license: None,
            runtime: PluginRuntimeSpec {
                language: PluginRuntimeLanguage::Javascript,
                supported_providers: vec![PluginProvider::Deno],
                preferred_provider: Some(PluginProvider::Deno),
                entrypoint: "src/plugin.js".to_string(),
            },
            compatibility: None,
            i18n: None,
            triggers: vec!["download.completed".to_string()],
            permissions: PluginPermissionRequest::default(),
            config_fields: Vec::new(),
            timeout_sec: 60,
            readme: None,
            checksum: None,
            published_at: None,
        };
        let readme = build_scaffold_readme(&manifest);
        assert!(readme.contains("src/plugin.js"));
        assert!(readme.contains("ctx.ok"));
        assert!(readme.contains("Execution flow"));
        assert!(readme.contains("node_modules/youwee-sdk"));
    }

    #[test]
    fn validate_manifest_rejects_empty_supported_providers() {
        let manifest = crate::types::PluginManifest {
            plugin_id: "id".to_string(),
            slug: "slug".to_string(),
            name: "Name".to_string(),
            version: "0.1.0".to_string(),
            icon: None,
            description: None,
            author: None,
            homepage: None,
            repository: None,
            license: None,
            runtime: PluginRuntimeSpec {
                language: PluginRuntimeLanguage::Javascript,
                supported_providers: Vec::new(),
                preferred_provider: None,
                entrypoint: "index.ts".to_string(),
            },
            compatibility: None,
            i18n: None,
            triggers: vec!["download.completed".to_string()],
            permissions: PluginPermissionRequest::default(),
            config_fields: Vec::new(),
            timeout_sec: 60,
            readme: None,
            checksum: None,
            published_at: None,
        };
        let err = validate_manifest(&manifest, Path::new("/tmp/plugin.json")).unwrap_err();
        assert!(err.contains("supportedProviders"));
    }

    #[test]
    fn validate_manifest_rejects_sdk_trigger_identifiers() {
        let manifest = crate::types::PluginManifest {
            plugin_id: "id".to_string(),
            slug: "slug".to_string(),
            name: "Name".to_string(),
            version: "0.1.0".to_string(),
            icon: None,
            description: None,
            author: None,
            homepage: None,
            repository: None,
            license: None,
            runtime: PluginRuntimeSpec {
                language: PluginRuntimeLanguage::Javascript,
                supported_providers: vec![PluginProvider::Deno],
                preferred_provider: Some(PluginProvider::Deno),
                entrypoint: "src/plugin.js".to_string(),
            },
            compatibility: None,
            i18n: None,
            triggers: vec!["triggers.downloadQueued".to_string()],
            permissions: PluginPermissionRequest::default(),
            config_fields: Vec::new(),
            timeout_sec: 60,
            readme: None,
            checksum: None,
            published_at: None,
        };
        let err = validate_manifest(&manifest, Path::new("/tmp/plugin.json")).unwrap_err();
        assert!(err.contains("raw runtime names"));
    }

    #[test]
    fn scaffold_readme_mentions_runtime_contract() {
        let manifest = crate::types::PluginManifest {
            plugin_id: "id".to_string(),
            slug: "slug".to_string(),
            name: "Name".to_string(),
            version: "0.1.0".to_string(),
            icon: None,
            description: None,
            author: None,
            homepage: None,
            repository: None,
            license: None,
            runtime: PluginRuntimeSpec {
                language: PluginRuntimeLanguage::Javascript,
                supported_providers: vec![PluginProvider::Deno],
                preferred_provider: Some(PluginProvider::Deno),
                entrypoint: "index.ts".to_string(),
            },
            compatibility: None,
            i18n: None,
            triggers: vec!["download.completed".to_string()],
            permissions: PluginPermissionRequest::default(),
            config_fields: Vec::new(),
            timeout_sec: 60,
            readme: Some("README.md".to_string()),
            checksum: None,
            published_at: None,
        };
        let readme = build_scaffold_readme(&manifest);
        assert!(readme.contains("supportedProviders"));
        assert!(readme.contains("ctx.youwee.ai"));
        assert!(readme.contains("YOUWEE_PLUGIN_SIGNING_KEY"));
    }

    #[test]
    fn scaffold_workflows_cover_ci_and_release() {
        let ci_workflow = build_scaffold_ci_workflow();
        let release_workflow = build_scaffold_release_workflow();

        assert!(ci_workflow.contains("name: Plugin CI"));
        assert!(ci_workflow.contains("bun run build"));
        assert!(ci_workflow.contains("bun run test:deno"));
        assert!(release_workflow.contains("name: Plugin Release"));
        assert!(release_workflow.contains("YOUWEE_PLUGIN_SIGNING_KEY"));
        assert!(release_workflow.contains("release/*.ywp"));
    }

    #[test]
    fn scaffold_package_json_uses_npm_sdk_dependency() {
        let manifest = crate::types::PluginManifest {
            plugin_id: "id".to_string(),
            slug: "gg-drive".to_string(),
            name: "GG Drive".to_string(),
            version: "0.1.0".to_string(),
            icon: None,
            description: Some("Upload files to Drive".to_string()),
            author: None,
            homepage: None,
            repository: None,
            license: None,
            runtime: PluginRuntimeSpec {
                language: PluginRuntimeLanguage::Javascript,
                supported_providers: vec![PluginProvider::Deno],
                preferred_provider: Some(PluginProvider::Deno),
                entrypoint: "src/plugin.js".to_string(),
            },
            compatibility: None,
            i18n: None,
            triggers: vec!["download.completed".to_string()],
            permissions: PluginPermissionRequest::default(),
            config_fields: Vec::new(),
            timeout_sec: 60,
            readme: Some("README.md".to_string()),
            checksum: None,
            published_at: None,
        };
        let package_json = build_scaffold_package_json(&manifest);
        assert!(package_json.contains(&format!("\"youwee-sdk\": \"^{}\"", current_sdk_version())));
        assert!(
            package_json
                .contains("\"pack\": \"bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json\"")
        );
        assert!(
            package_json.contains("\"keygen\": \"bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json\"")
        );
        assert!(package_json.contains("YOUWEE_PLUGIN_MAIN=src/plugin.js"));
        assert!(package_json.contains("deno run --quiet"));
    }

    #[test]
    fn parse_plugin_result_accepts_json_on_the_last_stdout_line() {
        let stdout = "plain text before result\n{\"success\":true,\"message\":\"Uploaded\"}\n";
        let parsed = parse_plugin_result(stdout).expect("expected plugin result");
        assert_eq!(parsed.success, Some(true));
        assert_eq!(parsed.message.as_deref(), Some("Uploaded"));
    }

    #[test]
    fn version_ranges_are_checked_correctly() {
        assert!(satisfies_version_range("0.13.3", ">=0.13.0 <0.14.0").unwrap());
        assert!(!satisfies_version_range("0.14.0", ">=0.13.0 <0.14.0").unwrap());
        assert!(satisfies_version_range("0.13.3", "=0.13.3").unwrap());
    }

    #[test]
    fn compatibility_issues_are_reported_for_mismatched_ranges() {
        let manifest = crate::types::PluginManifest {
            plugin_id: "id".to_string(),
            slug: "slug".to_string(),
            name: "Name".to_string(),
            version: "0.1.0".to_string(),
            icon: None,
            description: None,
            author: None,
            homepage: None,
            repository: None,
            license: None,
            runtime: PluginRuntimeSpec {
                language: PluginRuntimeLanguage::Javascript,
                supported_providers: vec![PluginProvider::Deno],
                preferred_provider: Some(PluginProvider::Deno),
                entrypoint: "src/plugin.js".to_string(),
            },
            compatibility: Some(crate::types::PluginCompatibilitySpec {
                app_version: Some(">=999.0.0 <1000.0.0".to_string()),
                sdk_version: Some(">=999.0.0 <1000.0.0".to_string()),
            }),
            i18n: None,
            triggers: vec!["download.completed".to_string()],
            permissions: PluginPermissionRequest::default(),
            config_fields: Vec::new(),
            timeout_sec: 60,
            readme: None,
            checksum: None,
            published_at: None,
        };

        let issues = collect_compatibility_issues(&manifest).unwrap();
        assert_eq!(issues.len(), 2);
        assert!(issues[0].contains("Requires Youwee app version"));
        assert!(issues[1].contains("Requires youwee-sdk version"));
    }

    #[test]
    fn app_sdk_bundle_includes_all_runtime_modules() {
        let temp_dir = std::env::temp_dir().join(format!("youwee-sdk-bundle-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        write_sdk_package_files(&temp_dir).unwrap();

        for relative_path in [
            "dist/index.js",
            "dist/runtime.js",
            "dist/runtime-cli.js",
            "dist/ai.js",
            "dist/compatibility.js",
            "dist/schema.js",
            "dist/manifest.js",
            "dist/types.js",
        ] {
            assert!(temp_dir.join(relative_path).exists(), "missing {relative_path}");
        }

        fs::remove_dir_all(&temp_dir).unwrap();
    }
}
