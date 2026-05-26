# Changelog

All notable changes to `youwee-sdk` should be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
