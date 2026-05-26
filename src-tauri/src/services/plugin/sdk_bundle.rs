use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const SDK_JS_PACKAGE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/package.json"
));
const SDK_JS_INDEX: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/index.js"
));
const SDK_JS_RUNTIME: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/runtime.js"
));
const SDK_JS_RUNTIME_CLI: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/runtime-cli.js"
));
const SDK_JS_AI: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/dist/ai.js"));
const SDK_JS_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/index.d.ts"
));
const SDK_JS_RUNTIME_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/runtime.d.ts"
));
const SDK_JS_RUNTIME_CLI_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/runtime-cli.d.ts"
));
const SDK_JS_AI_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/ai.d.ts"
));
const SDK_JS_MANIFEST: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/manifest.js"
));
const SDK_JS_MANIFEST_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/manifest.d.ts"
));
const SDK_JS_COMPATIBILITY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/compatibility.js"
));
const SDK_JS_COMPATIBILITY_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/compatibility.d.ts"
));
const SDK_JS_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/schema.js"
));
const SDK_JS_SCHEMA_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/schema.d.ts"
));
const SDK_JS_SHARED_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/types.d.ts"
));
const SDK_JS_SHARED_RUNTIME_TYPES: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../sdk-js/dist/types.js"
));
const SDK_JS_README: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk-js/README.md"));

pub(super) fn current_sdk_version() -> String {
    serde_json::from_str::<serde_json::Value>(SDK_JS_PACKAGE_JSON)
        .ok()
        .and_then(|value| {
            value
                .get("version")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "1.0.5".to_string())
}

pub(super) fn write_sdk_package_files(package_root: &Path) -> Result<(), String> {
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
        std::fs::write(&path, content).map_err(|e| {
            format!(
                "Failed to write scaffold SDK file {}: {}",
                path.display(),
                e
            )
        })?;
    }

    Ok(())
}

pub(super) fn ensure_app_sdk_runtime_bundle(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir for SDK bundle: {}", e))?;
    let node_modules_root = app_data_dir
        .join(super::PLUGINS_DIR_NAME)
        .join(".sdk")
        .join("node_modules");
    let sdk_package_root = node_modules_root.join("youwee-sdk");

    write_sdk_package_files(&sdk_package_root)?;
    Ok(sdk_package_root)
}
