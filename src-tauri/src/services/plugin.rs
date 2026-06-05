use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use uuid::Uuid;

use crate::database::{add_log_internal, clear_plugin_logs_from_db};
use crate::types::{
    PluginConfigField, PluginExecutionResult, PluginExecutionStatusEvent,
    PluginFilesystemPermission, PluginManifest, PluginPackageInspection, PluginPackageSource,
    PluginPackageSourceKind, PluginPermissionApproval, PluginPermissionRequest, PluginProvider,
    PluginRuntimeLanguage, PluginSummary, PluginTriggerWorkflow, PluginWorkflowFailurePolicy,
    PluginWorkflowRun, PluginWorkflowRunStatus, PluginWorkflowStepSnapshot,
    PostDownloadPluginPayload,
};
use crate::utils::CommandExt;

mod compatibility;
mod logging;
mod manifest;
mod package;
mod permissions;
mod providers;
mod registry;
mod scaffold;
mod sdk_bundle;
mod state;
mod summary;
mod workflow;
mod workspace;

#[cfg(test)]
use compatibility::satisfies_version_range;
use compatibility::{
    collect_compatibility_issues, validate_execution_compatibility, validate_install_compatibility,
};
use logging::{
    build_plugin_completion_details, capture_process_stream, capture_process_stream_err,
    combine_plugin_event_details, output_to_string, parse_plugin_result, plugin_exit_reason,
    plugin_output_details, shorten_for_event,
};
#[cfg(test)]
use manifest::validate_manifest;
use manifest::{load_installed_manifest_from_dir, load_source_manifest_from_dir};
use package::{
    compute_dir_checksum, inspect_ywp_file, load_packaged_build_info, prepare_plugin_package,
};
use permissions::{
    build_permission_path_scopes, collect_missing_permissions, path_scope_variants,
    push_allow_flag, resolve_plugin_entrypoint,
};
use providers::resolve_provider_command;
pub use providers::{get_runtime_provider_status_internal, list_runtime_providers_internal};
use registry::{
    read_registry, write_registry, PluginRegistry, PluginRegistryEntry,
    PluginTriggerWorkflowRegistry,
};
#[cfg(test)]
use scaffold::{
    build_scaffold_ci_workflow, build_scaffold_package_json, build_scaffold_readme,
    build_scaffold_release_workflow,
};
#[cfg(test)]
use sdk_bundle::current_sdk_version;
use sdk_bundle::ensure_app_sdk_runtime_bundle;
#[cfg(test)]
use sdk_bundle::write_sdk_package_files;
pub use state::{
    approve_plugin_permissions_internal, get_plugin_trigger_workflow_internal,
    set_default_provider_for_language_internal, set_plugin_provider_internal,
    set_plugin_runtime_locale_internal, set_plugin_timeout_internal,
    update_plugin_config_values_internal, update_plugin_state_internal,
    update_plugin_trigger_workflow_internal,
};
use summary::{
    build_installation_from_registry, default_provider_for_language, load_plugin_readme_content,
    manifest_summary, resolve_effective_plugin_config_values,
};
use workflow::{
    build_chain_state, build_legacy_workflow_snapshots, merge_chain_mutation,
    payload_from_chain_state, resolve_workflow_step_snapshots, workflow_result_status,
};
pub use workspace::create_plugin_workspace_internal;
#[cfg(test)]
use workspace::sanitize_slug;

const PLUGINS_DIR_NAME: &str = "plugins";
const REGISTRY_FILE_NAME: &str = "registry.json";

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

pub fn plugins_root(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    Ok(app_data_dir.join(PLUGINS_DIR_NAME))
}

fn ensure_plugins_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = plugins_root(app)?;
    std::fs::create_dir_all(&root).map_err(|e| {
        format!(
            "Failed to create plugins directory {}: {}",
            root.display(),
            e
        )
    })?;
    Ok(root)
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

fn install_dir_name(plugin_id: &str, slug: &str) -> String {
    format!("{}-{}", plugin_id, slug)
}

fn installation_path(root: &Path, manifest: &PluginManifest) -> PathBuf {
    root.join(install_dir_name(&manifest.plugin_id, &manifest.slug))
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
                add_log_internal(
                    "error",
                    "Invalid plugin workspace manifest",
                    Some(&error),
                    None,
                )
                .ok();
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

pub fn get_plugin_details_internal(
    app: &AppHandle,
    plugin_id: &str,
) -> Result<PluginSummary, String> {
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
    install_plugin_internal(app, InstallPluginPackageInput { value: path }, trusted).await
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
            enabled: existing
                .as_ref()
                .map(|value| value.enabled)
                .unwrap_or(false),
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
            timeout_sec_override: existing
                .as_ref()
                .and_then(|value| value.timeout_sec_override),
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

    if plugin.installation.source.kind == PluginPackageSourceKind::PackageYwp
        && installation_path.exists()
    {
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

pub async fn open_plugin_directory_internal(
    app: &AppHandle,
    plugin_id: &str,
) -> Result<(), String> {
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

    let missing_permissions = collect_missing_permissions(
        &plugin.manifest.permissions,
        &plugin.installation.approved_permissions,
    );
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
    let app_locale = registry
        .app_locale
        .clone()
        .unwrap_or_else(|| "en".to_string());
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
    let ai_config = crate::commands::get_ai_config(app.clone())
        .await
        .unwrap_or_default();

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
    let mut allow_run_scopes = Vec::<PathBuf>::new();
    if let Some(path) = ffmpeg_path.as_ref() {
        allow_run_scopes.extend(path_scope_variants(Path::new(path)));
    }
    if let Some(path) = ytdlp_path.as_ref() {
        allow_run_scopes.extend(path_scope_variants(Path::new(path)));
    }
    allow_run_scopes.sort();
    allow_run_scopes.dedup();

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
            if !allow_run_scopes.is_empty() {
                push_allow_flag(&mut command_args, "allow-run", &allow_run_scopes);
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
    if matches!(selected_provider, PluginProvider::Deno) {
        cmd.env_remove("DYLD_FALLBACK_LIBRARY_PATH");
        cmd.env_remove("DYLD_LIBRARY_PATH");
        cmd.env_remove("LD_LIBRARY_PATH");
    }
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
    cmd.env(
        "YOUWEE_PLUGIN_LANGUAGE",
        plugin.manifest.runtime.language.as_str(),
    );
    cmd.env("YOUWEE_PLUGIN_PROVIDER", selected_provider.as_str());
    cmd.env(
        "YOUWEE_PLUGIN_MAIN",
        entrypoint.to_string_lossy().to_string(),
    );
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
    cmd.env(
        "YOUWEE_AI_ENABLED",
        if ai_config.enabled { "true" } else { "false" },
    );
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
        if ai_config.whisper_enabled {
            "true"
        } else {
            "false"
        },
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

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to start plugin {}: {}",
            plugin.manifest.plugin_id, e
        )
    })?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to open plugin stdin".to_string())?;
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

    let status =
        match tokio::time::timeout(std::time::Duration::from_secs(timeout_sec), child.wait()).await
        {
            Ok(result) => {
                result.map_err(|e| format!("Failed waiting for plugin process: {}", e))?
            }
            Err(_) => {
                if let Err(error) = child.kill().await {
                    add_log_internal(
                        "warn",
                        "Failed to stop plugin process after timeout",
                        Some(&format!(
                            "pluginId: {}; provider: {} - {}",
                            plugin_id,
                            selected_provider.as_str(),
                            error
                        )),
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
        return Err(format!(
            "Plugin exited with {}.\n{}",
            plugin_exit_reason(&status),
            details
        ));
    }

    let parsed_output = parse_plugin_result(&stdout);

    Ok((
        PluginExecutionResult {
            plugin_id: plugin.manifest.plugin_id.clone(),
            success: parsed_output
                .as_ref()
                .and_then(|value| value.success)
                .unwrap_or(true),
            message: parsed_output
                .as_ref()
                .and_then(|value| value.message.clone()),
            artifacts: parsed_output
                .as_ref()
                .and_then(|value| value.artifacts.clone()),
            metadata: parsed_output
                .as_ref()
                .and_then(|value| value.metadata.clone()),
            mutations: parsed_output
                .as_ref()
                .and_then(|value| value.mutations.clone()),
            stdout: if stdout.is_empty() {
                None
            } else {
                Some(stdout)
            },
            stderr: if stderr.is_empty() {
                None
            } else {
                Some(stderr)
            },
        },
        selected_provider,
        resolved_source,
    ))
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
            let message = format!("Workflow step plugin not found: {}", step.plugin_id);
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

                let details = build_plugin_completion_details(&result);
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
        return build_legacy_workflow_snapshots(
            &plugins_by_id,
            &registry,
            trigger,
            legacy_plugin_ids,
        );
    }

    let workflow = PluginTriggerWorkflow {
        trigger: trigger.to_string(),
        steps: workflow_registry_for_trigger(&registry, trigger)
            .map(|workflow| workflow.steps.clone())
            .unwrap_or_default(),
    };
    resolve_workflow_step_snapshots(&plugins_by_id, &workflow)
}

#[cfg(test)]
mod tests;
