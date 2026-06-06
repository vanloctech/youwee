use crate::types::{PluginManifest, PluginProvider, PostDownloadPluginPayload};

use super::sdk_bundle::current_sdk_version;

fn sdk_trigger_identifier(trigger: &str) -> &'static str {
    match trigger {
        "download.queued" => "triggers.downloadQueued",
        "download.beforeStart" => "triggers.downloadBeforeStart",
        "download.completed" => "triggers.downloadCompleted",
        "download.failed" => "triggers.downloadFailed",
        _ => "triggers.downloadCompleted",
    }
}

pub(super) fn build_scaffold_plugin_module(manifest: &PluginManifest) -> String {
    let primary_trigger = manifest
        .triggers
        .first()
        .map(|trigger| sdk_trigger_identifier(trigger))
        .unwrap_or("triggers.downloadCompleted");
    format!(
        r#"import {{ definePlugin, triggers, type PluginDefinition }} from "youwee-sdk";

const plugin = definePlugin({{
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
      // 4. Use approved app capabilities from ctx.youwee.fs, ctx.youwee.tools, or ctx.youwee.youtube
      // 5. Return ctx.ok(...) or ctx.fail(...)

      return ctx.ok(ctx.i18n.t("result.success"), {{
        filepath: ctx.file.path,
        filename: ctx.file.name,
        trigger: ctx.trigger,
      }});
    }},
  }},
}} satisfies PluginDefinition);

export default plugin;
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

pub(super) fn build_scaffold_locale_file() -> String {
    r#"{
  "log.hookStarted": "Hook started",
  "result.success": "Plugin scaffold ran successfully."
}
"#
    .to_string()
}

pub(super) fn build_scaffold_package_json(manifest: &PluginManifest) -> String {
    let sdk_version = current_sdk_version();
    format!(
        r#"{{
  "name": "{slug}",
  "version": "{version}",
  "private": true,
  "description": "{description}",
  "type": "module",
  "main": "src/plugin.ts",
  "scripts": {{
    "build": "bunx youwee-sdk build",
    "pack": "bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json",
    "keygen": "bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test:deno": "deno run --quiet --unstable-detect-cjs --allow-env --allow-read=. --node-modules-dir=manual node_modules/youwee-sdk/dist/runtime-cli.js src/plugin.ts"
  }},
  "dependencies": {{
    "youwee-sdk": "^{sdk_version}"
  }},
  "devDependencies": {{
    "typescript": "^5.9.3"
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

pub(super) fn build_scaffold_tsconfig() -> String {
    r#"{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"]
}
"#
    .to_string()
}

pub(super) fn build_scaffold_ci_workflow() -> String {
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

      - name: Typecheck plugin
        run: bun run typecheck

      - name: Build plugin with Bun toolchain
        run: bun run build

      - name: Run Deno runtime check
        run: bun run test:deno < examples/payload.download.completed.json
"#
    .to_string()
}

pub(super) fn build_scaffold_release_workflow() -> String {
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

      - name: Typecheck plugin
        run: bun run typecheck

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

pub(super) fn build_scaffold_readme(manifest: &PluginManifest) -> String {
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
- `tsconfig.json`: TypeScript compiler settings for editor and CI checks
- `src/plugin.ts`: TypeScript plugin module and hook implementations
- `locales/en.json`: default translation file for plugin messages
- `README.md`: default documentation shown inside Youwee
- `README.vi.md` / `README.zh-CN.md`: optional localized plugin guides shown when the app language matches
- `dist/`: bundled runtime output generated by the build command
- `release/`: packaged `.ywp` output generated by the pack command
- `examples/`: sample payload and result files

## Entry module

The plugin entrypoint is `src/plugin.ts`.

You do not need a per-plugin runner file. Youwee launches the shared bootstrap from
`youwee-sdk` and passes your plugin entry module through the runtime bridge.

The installed plugin runtime is intentionally constrained:
- Deno does not receive direct `--allow-write` or `--allow-run`
- filesystem access must use `ctx.youwee.fs`
- FFmpeg and yt-dlp must use `ctx.youwee.tools`
- YouTube keyword search should use `ctx.youwee.youtube.searchVideos(...)` with approved network permission
- tool execution is mediated by Youwee and does not use a shell
- output files must stay inside approved write scopes and cannot use dangerous executable extensions

## Trigger naming

Use raw runtime trigger strings in `plugin.json`:

```json
{{
  "triggers": ["download.completed", "download.failed"]
}}
```

Use SDK identifiers only inside `src/plugin.ts`:

```ts
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
2. The shared SDK bootstrap loads `src/plugin.ts`
3. The SDK reads the payload JSON from `stdin`
4. The SDK creates `ctx`
5. The matching hook runs
6. The hook returns `ctx.ok(...)` or `ctx.fail(...)`
7. The SDK writes the final JSON result to `stdout`

## Hook implementation

Implement hooks in `src/plugin.ts`:

```ts
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
- `ctx.youwee.fs.readDir(...)`
- `ctx.youwee.fs.readBytes(...)`
- `ctx.youwee.fs.writeText(...)`
- `ctx.youwee.fs.writeBytes(...)`
- `ctx.youwee.fs.removeFile(...)`
- `ctx.youwee.http.getJson(...)`
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

```ts
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

```ts
const outputDirectory = ctx.config.require("outputDirectory");
```

Do not use `permissions.env` for plugin-defined configuration. It is obsolete.

Use filesystem capabilities instead of hardcoding user-specific absolute paths.
For example, `fs.user-selected.*` should be paired with `file` or `directory`
config fields so Youwee can resolve the actual path on each machine.

Runtime permission mapping:
- `fs.plugin.read` allows reading files from this workspace/package through `ctx.youwee.fs`
- `fs.plugin.write` allows writing inside this workspace/package only when Youwee approves it
- `fs.payload-file.read` allows reading the current downloaded file
- `fs.payload-directory.read` allows reading and listing the current download directory
- `fs.payload-directory.write` allows writing beside the current downloaded file
- `fs.temp.read` and `fs.temp.write` allow app-managed temporary work files
- `fs.user-selected.read` and `fs.user-selected.write` use user-selected `file` or `directory` config fields
- `tool.ffmpeg.run` allows `ctx.youwee.tools.ffmpeg.run(...)`
- `tool.ytdlp.run` allows `ctx.youwee.tools.ytdlp.run(...)`

Use `ctx.youwee.fs.readText(...)` / `ctx.youwee.fs.writeText(...)` for UTF-8 text files.
Use `ctx.youwee.fs.readBytes(...)`, `ctx.youwee.fs.readBase64(...)`, `ctx.youwee.fs.writeBytes(...)`, or
`ctx.youwee.fs.writeBase64(...)` for binary files such as media, thumbnails, archives, and upload payloads.
Use `ctx.youwee.fs.readDir(...)` when the plugin has directory read permission and needs to list files.

Do not call `Deno.Command(...)`, `child_process`, shell wrappers, or direct filesystem write APIs
for plugin capabilities. They are blocked in the installed runtime. Use the SDK context APIs so
Youwee can enforce the user's approved permissions.

For cleanup, use `ctx.youwee.fs.removeFile(path)`. It can only remove regular files created during
the current plugin run or files inside a Youwee-managed temp directory returned by
`ctx.youwee.fs.tempDir(...)`. It cannot remove directories, symlinks, dangerous output paths, or
user files that existed before the plugin run started.

This scaffold is optimized for:
- Deno

If your implementation depends on runtime-specific APIs, update
`runtime.supportedProviders` in `plugin.json`.

## Local execution

Install dependencies first with the Bun toolchain:

```bash
bun install
```

Run a TypeScript check:

```bash
bun run typecheck
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

The CI workflow uses Bun for dependency installation, TypeScript checking, and packaging, then runs a Deno runtime check.

The release workflow:

1. restores the signing key from `YOUWEE_PLUGIN_SIGNING_KEY`
2. typechecks the plugin
3. builds the plugin with the Bun toolchain
4. packs a signed `.ywp`
5. uploads the `.ywp` and `.sha256` files to the GitHub release

Deno runtime check:

```bash
bun run test:deno < examples/payload.download.completed.json
```

The local Deno check validates the plugin module and hook contract without granting direct write/run
permissions. Full testing for `ctx.youwee.fs` and `ctx.youwee.tools` should be done by attaching the
workspace in Youwee, because those APIs need the app-mediated runtime bridge.

## Packaging

To share this plugin:
1. Run `bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json` if you do not already have a signing key
2. Run `bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json`
3. Find the generated `.ywp` file in `release/`
4. Import the `.ywp` package into Youwee

Youwee imports signed `.ywp` files only.
The source workspace is for development and packaging, not direct end-user installation.

## Next step

Edit `src/plugin.ts` first and replace the example hook body with your actual logic.
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

pub(super) fn build_scaffold_changelog() -> String {
    "# Changelog\n\n## [0.1.0]\n- Initial scaffold\n".to_string()
}

pub(super) fn build_scaffold_success_result_example() -> String {
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

pub(super) fn build_scaffold_failure_result_example() -> String {
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

pub(super) fn sample_download_payload() -> PostDownloadPluginPayload {
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
