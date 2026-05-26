# Youwee — Build Instructions

Builds `.dmg` installers for macOS Apple Silicon (`aarch64`) and Intel (`x86_64`).

---

## Quick Start

```bash
git clone -b feat/custom-ytdlp-args https://github.com/miguelAngelo1999/youwee.git
cd youwee
PROXY=http://127.0.0.1:1090 bash scripts/build.sh
```

That's it. The script handles everything below automatically.

---

## What the Build Script Does

### 1. Prerequisites check

- **Xcode Command Line Tools** — required for compiling native code on macOS.
  If missing, the script runs `xcode-select --install` and exits. Re-run after installation.

- **Rust** — installed via `rustup` if not present.

- **Bun** — installed to `~/.bun/bin/bun` if not present.
  > Note: Bun's registry downloads return 403 in some network environments (proxy/firewall).
  > The script uses `npm` as the package manager fallback, which works reliably.

### 2. Rust cross-compilation targets

Both targets are added via `rustup target add` if not already installed:
- `aarch64-apple-darwin` — Apple Silicon (M1/M2/M3/M4)
- `x86_64-apple-darwin` — Intel Macs

Downloading Rust std components requires internet access. If you're behind a firewall,
set the `PROXY` env var (see below).

### 3. JS dependencies

```bash
npm install --legacy-peer-deps
```

Tauri JS packages are pinned to match the Rust crate versions in `Cargo.toml`:

| JS package | Pinned version |
|---|---|
| `@tauri-apps/api` | `2.9.1` |
| `@tauri-apps/plugin-dialog` | `2.6.0` |
| `@tauri-apps/plugin-updater` | `2.9.0` |
| `@tauri-apps/plugin-fs` | `2.4.5` |

> Tauri CLI will refuse to build if JS and Rust crate versions are mismatched.

### 4. yt-dlp sidecar binary

The app bundles `yt-dlp` as a sidecar binary. The build downloads the official
`yt-dlp_macos` universal binary (works for both arm64 and x86_64) from:

```
https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos
```

It is placed at:
- `src-tauri/bin/yt-dlp-aarch64-apple-darwin`
- `src-tauri/bin/yt-dlp-x86_64-apple-darwin`

> **Do not use `touch` to create placeholder files here.** An empty sidecar means
> the app bundles a zero-byte binary and downloads will silently fail at runtime.

### 5. tauri.conf.json patch

`tauri build` runs `beforeBuildCommand` in a subprocess where `bun` is not in `PATH`.
The script temporarily patches `beforeBuildCommand` from `bun run build` to the full
path `~/.bun/bin/bun run build`, then restores it on exit via a `trap`.

### 6. Rust + frontend build

```bash
tauri build --target aarch64-apple-darwin --bundles app
tauri build --target x86_64-apple-darwin  --bundles app
```

The `beforeBuildCommand` runs `tsc -b && vite build` to produce the frontend `dist/`.
Rust then compiles the backend and bundles everything into a `.app`.

> **Expected non-fatal error:** After bundling, Tauri checks for a signing key and
> prints `A public key has been found, but no private key`. This is harmless —
> the `.app` is fully built before this check runs. The script ignores this exit code.

### 7. DMG packaging

Tauri's built-in `bundle_dmg.sh` fails on macOS 26 (Tahoe) because it is invoked
without arguments by the bundler. The script works around this by using `hdiutil`
directly:

```bash
hdiutil create -volname "Youwee" -srcfolder <staging> -ov -format UDZO <output.dmg>
```

---

## Output

| File | Target |
|---|---|
| `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Youwee_0.14.1_aarch64.dmg` | Apple Silicon |
| `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Youwee_0.14.1_x64.dmg` | Intel |

Expected sizes: ~49–50 MB each (includes the real yt-dlp binary).

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PROXY` | `http://127.0.0.1:1090` | HTTP/HTTPS proxy for downloading Rust targets and yt-dlp |

Example:
```bash
PROXY=http://127.0.0.1:7890 bash scripts/build.sh
```

To build without a proxy (if your network has direct access):
```bash
PROXY="" bash scripts/build.sh
```

---

## Troubleshooting

**`bun install` returns 403 errors**
Bun's TLS fingerprint is blocked by some proxies/firewalls. The build script uses
`npm` instead, which works fine.

**`rustup target add` fails with SSL certificate error**
Your system's certificate store doesn't trust the Rust CDN cert. Set the `PROXY`
env var — rustup will route downloads through it.

**`bundle_dmg.sh: Not enough arguments`**
This is a known Tauri issue on macOS 26. The build script bypasses it using `hdiutil`
directly. No action needed.

**`TAURI_SIGNING_PRIVATE_KEY` error**
Expected. The app has an updater public key configured but no private key in the
build environment. The `.dmg` is fully produced before this error. Ignore it.

**Version mismatch error from Tauri CLI**
```
Found version mismatched Tauri packages
```
Run the npm pin step manually:
```bash
npm install --legacy-peer-deps \
  @tauri-apps/api@2.9.1 \
  @tauri-apps/plugin-dialog@2.6.0 \
  @tauri-apps/plugin-updater@2.9.0 \
  @tauri-apps/plugin-fs@2.4.5
```

**`sh: bun: command not found` during tauri build**
The `beforeBuildCommand` in `tauri.conf.json` uses `bun run build` but bun isn't
in the subprocess PATH. The build script patches this automatically. If running
`tauri build` manually, either add bun to your PATH or edit `tauri.conf.json`
to use the full path `/Users/<you>/.bun/bin/bun run build`.
