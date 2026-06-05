use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::database::add_log_internal;
use crate::types::{
    PluginCompatibilitySpec, PluginI18nSpec, PluginManifest, PluginProvider, PluginRuntimeLanguage,
    PluginRuntimeSpec,
};

use super::compatibility::build_scaffold_compatibility_range;
use super::manifest::validate_manifest;
use super::scaffold::{
    build_scaffold_changelog, build_scaffold_ci_workflow, build_scaffold_failure_result_example,
    build_scaffold_locale_file, build_scaffold_package_json, build_scaffold_plugin_module,
    build_scaffold_readme, build_scaffold_release_workflow, build_scaffold_success_result_example,
    sample_download_payload,
};
use super::sdk_bundle::current_sdk_version;
use super::CreatePluginWorkspaceInput;

pub(super) fn sanitize_slug(input: &str) -> String {
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

    let slug = slug
        .as_deref()
        .map(sanitize_slug)
        .unwrap_or_else(|| sanitize_slug(name));
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
            app_version: Some(build_scaffold_compatibility_range(env!(
                "CARGO_PKG_VERSION"
            ))),
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
    std::fs::write(
        destination.join("README.md"),
        build_scaffold_readme(&manifest),
    )
    .map_err(|e| {
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
        destination
            .join("examples")
            .join("payload.download.completed.json"),
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
        manifest_path: destination
            .join("plugin.json")
            .to_string_lossy()
            .to_string(),
        package_json_path: destination
            .join("package.json")
            .to_string_lossy()
            .to_string(),
        readme_path: destination.join("README.md").to_string_lossy().to_string(),
    })
}
