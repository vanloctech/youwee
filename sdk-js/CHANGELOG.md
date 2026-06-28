# Changelog

All notable changes to `youwee-sdk` should be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Recovered download mutation** - Added a `recovered` mutation flag so `download.failed` plugins can ask Youwee to mark a successfully recovered file as completed.

## [2.2.0] - 2026-06-07

### Added
- **YouTube keyword search bridge** - Added `ctx.youwee.youtube.searchVideos(...)` with typed search filters, continuation support, and app-managed YouTube result parsing for plugins that have approved network permission.

## [2.1.1] - 2026-05-27

### Added
- **Binary and directory filesystem bridge APIs** - Added `ctx.youwee.fs.readBytes(...)`, `readBase64(...)`, `writeBytes(...)`, `writeBase64(...)`, and `readDir(...)` so approved read/write permissions work for binary payloads and directory listings through Youwee's app-mediated runtime bridge.

## [2.1.0] - 2026-05-27

### Added
- **Safe plugin cleanup API** - Added `ctx.youwee.fs.removeFile(...)` for deleting files created during the current plugin run or files inside Youwee-managed plugin temp directories.

### Changed
- **Filesystem cleanup policy** - Documented that plugin cleanup still goes through Youwee's runtime bridge and cannot delete pre-existing user files, directories, symlinks, or unsafe output paths.
- **Compatibility baseline** - Updated SDK examples to target Youwee `>=0.15.0`, because `removeFile(...)` requires the newer runtime bridge.
- **Stable package filename** - Changed the default `pack` output from `release/<slug>-<version>.ywp` to `release/<slug>.ywp` while keeping the plugin version inside package metadata.

## [2.0.0] - 2026-05-27

### Changed
- **App-mediated runtime permissions** - Reworked filesystem and tool access so installed plugins must use Youwee's runtime bridge through `ctx.youwee.fs` and `ctx.youwee.tools` instead of receiving direct Deno write/run permissions.
- **Tool execution contract** - `ctx.youwee.tools.ffmpeg.run(...)` and `ctx.youwee.tools.ytdlp.run(...)` now delegate to Youwee, which runs approved tool binaries without a shell and validates tool arguments against approved read/write scopes.
- **TypeScript-first plugin workspaces** - Changed generated plugin workspaces to use `src/plugin.ts`, ESM exports, `tsconfig.json`, and a `typecheck` script by default.
- **Workspace test script** - Updated generated `test:deno` scripts to avoid direct `--allow-write`, making local checks better match the installed runtime security model.
- **Compatibility baseline** - Updated SDK examples to target Youwee `>=0.14.1 <0.15.0`, because SDK 2.x expects the app-mediated plugin bridge.

### Added
- **Plugin output safety policy** - Documented the SDK 2.x policy that Youwee blocks dangerous write scopes, executable output extensions, unsafe command-like tool arguments, and unsafe result mutation paths.

### Removed
- **Direct command execution** - `spawnCommand(...)` no longer executes subprocesses and now rejects with guidance to use `ctx.youwee.tools` instead.
- **Direct installed-plugin writes** - Installed plugins no longer receive direct Deno `--allow-write`; filesystem operations must go through `ctx.youwee.fs`.

## [1.0.5] - 2026-05-24

### Changed
- **Plugin icon resolution** - Relaxed plugin icon handling so manifests can declare any Lucide icon name, with Youwee resolving both PascalCase and kebab-case names and falling back safely to `Puzzle`.

### Fixed
- **Cross-platform Deno test flow** - Updated the shared `runtime-cli` bootstrap and generated `test:deno` scripts so local plugin testing no longer depends on Unix-only `env -u ...` shell syntax.

## [1.0.4] - 2026-05-24

### Fixed
- **Deno subprocess tool runner** - Updated `ctx.youwee.tools.ffmpeg.run(...)` and other command helpers to use `Deno.Command` when running inside Deno, fixing subprocess stream failures in plugin runtimes.
- **Deno test flow** - Updated scaffolded `test:deno` scripts and runtime environment handling to clear linker-related environment variables that can block `Deno.Command(...)` subprocess execution on macOS.

## [1.0.3] - 2026-05-23

### Fixed
- **Localized plugin guides in packages** - Updated the `.ywp` packager to include localized README files such as `README.vi.md` and `README.zh-CN.md` so Youwee can show the correct guide for the current app language after installation.

## [1.0.2] - 2026-05-23

### Added
- **Plugin icon manifest support** - Added optional `icon` metadata for plugins so Youwee can render a declared plugin icon and fall back cleanly to the default icon when none is provided.

### Fixed
- **Workspace package helper** - Updated `createPluginPackageJson()` so generated plugin workspaces include the same `build`, `pack`, `keygen`, and `test:deno` scripts as the app scaffold.
- **Workspace CLI pack flow** - Fixed the SDK CLI argument parsing so `youwee-sdk pack --private-key ...` no longer treats the private key path as the plugin root.

## [1.0.1] - 2026-05-23

### Fixed
- **Deno-only JavaScript runtime** - Removed plugin `Node` and `Bun` providers so JavaScript plugins now execute through one supported Deno runtime path.
- **Deno runtime bootstrap** - Fixed shared runtime bootstrap execution and macOS filesystem permission path handling for Deno-based plugin runs.
- **Workspace scaffold** - Updated generated workspace scripts, CI workflows, and local test commands to use `test:deno` consistently.

## [1.0.0] - 2026-05-18

### Added
- **Stable 1.0 release** - Finalized the workspace-to-`.ywp` plugin workflow, live workspace debugging model, packaged plugin runtime, CLI build/pack commands, and publish-ready SDK docs for npm distribution.

## [0.1.0] - 2026-05-16

### Added
- **Runtime bootstrap** - Added `runtime-cli` so plugin packages do not need per-plugin runner files.
- **Hook contract** - Added typed trigger contracts for download and processing lifecycle hooks.
- **Capability bridge** - Added accessors for Youwee runtime metadata, tool paths, AI configuration, filesystem helpers, and HTTP helpers.
- **Manifest helpers** - Added manifest validation and package template helpers for plugin authoring workflows.
- **Compatibility policy** - Added app-version and SDK-version compatibility helpers and enforcement-ready manifest fields.
