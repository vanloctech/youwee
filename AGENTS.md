# AGENTS.md — Project Rules for AI Assistants

This file is read automatically at the start of every session. Follow these rules strictly.

## Project Info

- **App name**: Youwee
- **Repo**: `github.com/vanloctech/youwee`
- **Stack**: Tauri 2.0 (Rust backend) + React 19 + TypeScript + Tailwind CSS
- **Runtime**: Use `bun` (not npm/npx)
- **Linting**: `bun run biome check --write .`
- **Rust check**: `cargo check` (run in `src-tauri/`)
- **TypeScript check**: `bun run tsc -b`
- **Default branch**: `develop`
- **Language**: User communicates in Vietnamese

## Mandatory Checklists

### Version Bump Checklist

When bumping the version, you MUST do ALL of the following:

1. Update version in **3 files**:
   - `package.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
   - `src-tauri/tauri.conf.json` → `"version"`

2. Update **3 changelog files**:
   - `CHANGELOG.md` (English, root)
   - `docs/CHANGELOG.vi.md` (Vietnamese)
   - `docs/CHANGELOG.zh-CN.md` (Chinese Simplified)

   In each changelog:
   - Change `## [Unreleased]` heading to `## [X.Y.Z] - YYYY-MM-DD`
   - Add a new empty `## [Unreleased]` section above it
   - Add entries for any new features/fixes done since the last release

   **NEVER bump version without updating changelogs. This is non-negotiable.**

3. `Cargo.lock` will auto-update — no manual edit needed.

### Commit Rules

- **NEVER commit unless the user explicitly asks** (e.g. "commit nha", "commit di")
- **NEVER push unless the user explicitly asks**
- Always run all 3 checks before committing: Biome → `tsc -b` → cargo check
- Commit message style: `type: short description` (e.g. `feat:`, `fix:`, `chore:`, `docs:`)

### Pre-commit Hook

The repo has a `.git/hooks/pre-commit` that runs 3 checks automatically:
1. Biome lint
2. TypeScript type check (`tsc --noEmit`)
3. Cargo check

All must pass before a commit succeeds.

## Changelog Conventions

- Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- Sections: `### Added`, `### Fixed`, `### Changed`, `### Removed`
- Each entry starts with `- **Feature name** - Description`
- Vietnamese changelog uses: `### Thêm mới`, `### Sửa lỗi`, `### Thay đổi`, `### Xóa bỏ`
- Chinese changelog uses: `### 新增`, `### 修复`, `### 变更`, `### 移除`

## i18n

- Namespaces: `common`, `settings`, `pages`, `channels`, `download`, `universal`, `gallery`, `metadata`, `subtitles`, plus any future feature-specific namespaces already present in `src/i18n/locales/{lang}/`
- Primary locales: `en`, `vi`, `zh-CN`
- Supported locale directories currently live in `src/i18n/locales/{lang}/`
- When adding new UI text, add keys to **every existing locale directory**, not only the 3 primary locales
- Before finishing i18n work, compare the touched namespace across all locale directories and ensure no locale is missing the new keys

## SDK Rules

- SDK source lives in `sdk-js/src/`; generated build output lives in `sdk-js/dist/`
- When changing SDK TypeScript source, run `bun run build:sdk`
- When adding or changing public SDK APIs, update `sdk-js/README.md` and add an `Unreleased` entry in `sdk-js/CHANGELOG.md`
- Do not bump `sdk-js/package.json` version unless the user explicitly asks for an SDK release/version bump
- Keep SDK TypeScript strict and avoid `any` in public API types unless there is a clear compatibility reason

## UI Design Patterns

- **Info badges** (read-only): `rounded`, no border, solid background (e.g. `bg-blue-500/10 text-blue-600`)
- **Action buttons**: `rounded-md`, `border border-dashed`, hover effects
- **Time range**: amber color scheme (`bg-amber-500/10 text-amber-600 dark:text-amber-400`), Scissors icon
- **AI/Summary**: purple color scheme (`bg-purple-500/10 text-purple-500`), Sparkles icon

## Architecture Patterns

- Per-item settings are **snapshotted** at add-time from global settings, stored as `item.settings`
- App data is stored in SQLite (`youwee.db`), initialized in `src-tauri/src/database/connection.rs`
- `logs.db` is the legacy database filename; keep automatic migration to `youwee.db` and preserve the legacy file as a backup
- DB migrations use `ALTER TABLE ... ADD COLUMN` with `.ok()` to ignore "already exists" errors
- FFmpeg is bundled (not system) on macOS — rebuilt with `--enable-securetransport` for TLS support
- `download_sections` format: `"*MM:SS-MM:SS"` (with `*` prefix for yt-dlp). Strip `*` before storing in history.
