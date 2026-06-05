use std::fs;
use std::path::Path;

use super::logging::should_persist_plugin_runtime_output;
use super::{
    build_plugin_completion_details, build_scaffold_ci_workflow, build_scaffold_package_json,
    build_scaffold_readme, build_scaffold_release_workflow, collect_compatibility_issues,
    current_sdk_version, parse_plugin_result, sanitize_slug, satisfies_version_range,
    validate_manifest, write_sdk_package_files,
};
use crate::types::{
    PluginExecutionResult, PluginPermissionRequest, PluginProvider, PluginRuntimeLanguage,
    PluginRuntimeSpec,
};

#[test]
fn sanitize_slug_normalizes_values() {
    assert_eq!(
        sanitize_slug(" Google Drive Upload "),
        "google-drive-upload"
    );
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
    assert!(readme.contains("bun run test:deno"));
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
    assert!(package_json.contains(
        "\"pack\": \"bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json\""
    ));
    assert!(package_json
        .contains("\"keygen\": \"bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json\""));
    assert!(
            package_json.contains(
                "\"test:deno\": \"deno run --quiet --unstable-detect-cjs --allow-env --allow-read=. --allow-write=. --allow-run node_modules/youwee-sdk/dist/runtime-cli.js src/plugin.js\""
            )
        );
}

#[test]
fn parse_plugin_result_accepts_json_on_the_last_stdout_line() {
    let stdout = "plain text before result\n{\"success\":true,\"message\":\"Uploaded\"}\n";
    let parsed = parse_plugin_result(stdout).expect("expected plugin result");
    assert_eq!(parsed.success, Some(true));
    assert_eq!(parsed.message.as_deref(), Some("Uploaded"));
}

#[test]
fn plugin_runtime_stdout_json_is_not_persisted_as_a_log_entry() {
    assert!(!should_persist_plugin_runtime_output(
        "stdout",
        r#"{"success":true,"message":"Uploaded"}"#,
        "info",
    ));
    assert!(should_persist_plugin_runtime_output(
        "stdout",
        "plain stdout details",
        "info",
    ));
}

#[test]
fn plugin_runtime_stderr_info_is_not_persisted_but_warnings_are() {
    assert!(!should_persist_plugin_runtime_output(
        "stderr",
        "[info] Created PCM audio file",
        "info",
    ));
    assert!(should_persist_plugin_runtime_output(
        "stderr",
        "[warn] Something needs attention",
        "stderr",
    ));
    assert!(should_persist_plugin_runtime_output(
        "stderr",
        "[error] Conversion failed",
        "error",
    ));
}

#[test]
fn plugin_completion_details_highlight_output_paths_for_follow_up_steps() {
    let result = PluginExecutionResult {
        plugin_id: "com.example.plugin".to_string(),
        success: true,
        message: Some("Created PCM audio file output.mov.".to_string()),
        artifacts: None,
        metadata: None,
        mutations: Some(crate::types::PluginChainMutation {
            active_filepath: Some("/tmp/output.mov".to_string()),
            active_filename: Some("output.mov".to_string()),
            extra_files: vec!["/tmp/output.mov".to_string(), "/tmp/output.wav".to_string()],
            metadata_patch: None,
        }),
        stdout: Some(
            r#"{"success":true,"message":"Created PCM audio file output.mov."}"#.to_string(),
        ),
        stderr: None,
    };

    let details = build_plugin_completion_details(&result).expect("expected details");

    assert!(details.contains("Message: Created PCM audio file output.mov."));
    assert!(details.contains("Active file for next step: /tmp/output.mov"));
    assert!(details.contains("Extra output files:\n- /tmp/output.wav"));
    assert!(!details.contains("stdout:"));
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
        assert!(
            temp_dir.join(relative_path).exists(),
            "missing {relative_path}"
        );
    }

    fs::remove_dir_all(&temp_dir).unwrap();
}
