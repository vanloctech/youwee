use std::fs;
use std::path::Path;

use super::logging::{classify_plugin_runtime_error, should_persist_plugin_runtime_output};
use super::security_policy::{validate_plugin_output_path, validate_plugin_write_scope};
use super::{
    build_plugin_completion_details, build_scaffold_ci_workflow, build_scaffold_package_json,
    build_scaffold_readme, build_scaffold_release_workflow, collect_compatibility_issues,
    current_sdk_version, merge_chain_mutation, parse_plugin_result, sanitize_slug,
    satisfies_version_range, should_mark_failed_download_recovered, validate_manifest,
    write_sdk_package_files,
};
use crate::types::{
    PluginChainMutation, PluginChainState, PluginExecutionResult, PluginPermissionRequest,
    PluginProvider, PluginRuntimeLanguage, PluginRuntimeSpec,
};

#[test]
fn sanitize_slug_normalizes_values() {
    assert_eq!(
        sanitize_slug(" Google Drive Upload "),
        "google-drive-upload"
    );
}

#[test]
fn classify_plugin_runtime_error_formats_env_error_for_users() {
    let err = classify_plugin_runtime_error(
        r#"Requires env access to "YOUWEE_AI_PROXY_URL", run again with the --allow-env flag"#,
    )
    .expect("expected runtime permission error");

    assert_eq!(err.kind, "env");
    assert_eq!(err.resource.as_deref(), Some("YOUWEE_AI_PROXY_URL"));
    assert_eq!(err.resource_label.as_deref(), Some("AI proxy setting"));
    assert!(err.user_message.contains("AI helpers are disabled"));
    assert!(err.user_message.contains("AI proxy setting"));
    assert!(!err.user_message.contains("YOUWEE_AI_PROXY_URL"));
    assert!(!err.user_message.contains("--allow-env"));
    assert!(err
        .technical_details
        .contains("Deno runtime permission error"));
    assert!(err.technical_details.contains("YOUWEE_AI_PROXY_URL"));
}

#[test]
fn classify_plugin_runtime_error_formats_run_error_for_users() {
    let err = classify_plugin_runtime_error(
        r#"Requires run access to "/bin/sh". Run again with the --allow-run flag"#,
    )
    .expect("expected runtime permission error");

    assert_eq!(err.kind, "run");
    assert_eq!(err.resource.as_deref(), Some("/bin/sh"));
    assert_eq!(err.resource_label.as_deref(), Some("/bin/sh"));
    assert!(err.user_message.contains("not approved"));
    assert!(!err.user_message.contains("--allow-run"));
}

#[test]
fn plugin_security_policy_blocks_dangerous_output_extensions() {
    assert!(validate_plugin_output_path(Path::new("/tmp/youwee-output/video.mov")).is_ok());
    assert!(validate_plugin_output_path(Path::new("/tmp/youwee-output/payload.sh")).is_err());
    assert!(validate_plugin_output_path(Path::new("/tmp/youwee-output/agent.plist")).is_err());
}

#[test]
fn plugin_security_policy_blocks_sensitive_write_scopes() {
    assert!(validate_plugin_write_scope(Path::new("/tmp/youwee-output")).is_ok());
    assert!(validate_plugin_write_scope(Path::new("/")).is_err());

    if let Some(home) = std::env::var_os("HOME") {
        let home = Path::new(&home);
        assert!(validate_plugin_write_scope(home).is_err());
        assert!(validate_plugin_write_scope(&home.join(".ssh")).is_err());
    }
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
            entrypoint: "src/plugin.ts".to_string(),
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
    assert!(readme.contains("src/plugin.ts"));
    assert!(readme.contains("ctx.ok"));
    assert!(readme.contains("Execution flow"));
    assert!(readme.contains("bun run typecheck"));
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
            entrypoint: "src/plugin.ts".to_string(),
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
    assert!(readme.contains("ctx.youwee.tools"));
    assert!(readme.contains("YOUWEE_PLUGIN_SIGNING_KEY"));
}

#[test]
fn scaffold_workflows_cover_ci_and_release() {
    let ci_workflow = build_scaffold_ci_workflow();
    let release_workflow = build_scaffold_release_workflow();

    assert!(ci_workflow.contains("name: Plugin CI"));
    assert!(ci_workflow.contains("bun run typecheck"));
    assert!(ci_workflow.contains("bun run build"));
    assert!(ci_workflow.contains("bun run test:deno"));
    assert!(release_workflow.contains("name: Plugin Release"));
    assert!(release_workflow.contains("bun run typecheck"));
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
            entrypoint: "src/plugin.ts".to_string(),
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
    assert!(package_json.contains("\"type\": \"module\""));
    assert!(package_json.contains("\"main\": \"src/plugin.ts\""));
    assert!(package_json.contains("\"typescript\": \"^5.9.3\""));
    assert!(package_json.contains(
        "\"pack\": \"bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json\""
    ));
    assert!(package_json
        .contains("\"keygen\": \"bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json\""));
    assert!(package_json.contains("\"typecheck\": \"tsc --noEmit -p tsconfig.json\""));
    assert!(
            package_json.contains(
                "\"test:deno\": \"deno run --quiet --unstable-detect-cjs --allow-env --allow-read=. --node-modules-dir=manual node_modules/youwee-sdk/dist/runtime-cli.js src/plugin.ts\""
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
            recovered: None,
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
fn chain_mutation_can_mark_failed_download_recovered() {
    let mut chain_state = PluginChainState {
        job_id: "job-1".to_string(),
        source: Some("facebook".to_string()),
        download_kind: "download".to_string(),
        url: "https://example.com/video".to_string(),
        title: Some("Example".to_string()),
        thumbnail: None,
        history_id: None,
        time_range: None,
        active_filepath: "/tmp".to_string(),
        active_filename: "tmp".to_string(),
        directory: "/".to_string(),
        filesize: None,
        format: Some("mp4".to_string()),
        quality: Some("best".to_string()),
        extra_files: Vec::new(),
        metadata: None,
        recovered: false,
    };

    merge_chain_mutation(
        &mut chain_state,
        &PluginChainMutation {
            active_filepath: Some("/tmp/recovered.mp4".to_string()),
            active_filename: None,
            extra_files: Vec::new(),
            metadata_patch: None,
            recovered: Some(true),
        },
    );

    assert!(chain_state.recovered);
    assert_eq!(chain_state.active_filepath, "/tmp/recovered.mp4");
    assert_eq!(chain_state.active_filename, "recovered.mp4");
}

#[test]
fn recovered_failed_download_can_complete_partial_failed_workflow() {
    let chain_state = PluginChainState {
        job_id: "job-1".to_string(),
        source: Some("facebook".to_string()),
        download_kind: "download".to_string(),
        url: "https://example.com/video".to_string(),
        title: Some("Example".to_string()),
        thumbnail: None,
        history_id: None,
        time_range: None,
        active_filepath: "/tmp/recovered.mp4".to_string(),
        active_filename: "recovered.mp4".to_string(),
        directory: "/tmp".to_string(),
        filesize: None,
        format: Some("mp4".to_string()),
        quality: Some("best".to_string()),
        extra_files: Vec::new(),
        metadata: None,
        recovered: true,
    };

    assert!(should_mark_failed_download_recovered(
        "download.failed",
        &chain_state,
        &crate::types::PluginWorkflowRunStatus::Completed,
    ));
    assert!(should_mark_failed_download_recovered(
        "download.failed",
        &chain_state,
        &crate::types::PluginWorkflowRunStatus::PartialFailed,
    ));
    assert!(!should_mark_failed_download_recovered(
        "download.failed",
        &chain_state,
        &crate::types::PluginWorkflowRunStatus::Failed,
    ));
    assert!(!should_mark_failed_download_recovered(
        "download.completed",
        &chain_state,
        &crate::types::PluginWorkflowRunStatus::Completed,
    ));
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
            entrypoint: "src/plugin.ts".to_string(),
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
