#!/bin/bash
# =============================================================================
# Youwee Full Build Script
# Builds .dmg installers for both aarch64 (Apple Silicon) and x86_64 (Intel)
# =============================================================================

set -e

PROXY="${PROXY:-http://127.0.0.1:1090}"
BUN_PATH="$HOME/.bun/bin/bun"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

export https_proxy="$PROXY"
export http_proxy="$PROXY"
export HTTPS_PROXY="$PROXY"
export HTTP_PROXY="$PROXY"
export PATH="$HOME/.cargo/bin:$REPO_ROOT/node_modules/.bin:$PATH"

cd "$REPO_ROOT"

log()  { echo ""; echo ">>> $*"; }
ok()   { echo "    [ok] $*"; }
fail() { echo "    [FAIL] $*"; exit 1; }

# =============================================================================
# 1. Prerequisites
# =============================================================================
log "Checking prerequisites..."

# Xcode CLT
if ! xcode-select -p &>/dev/null; then
  log "Installing Xcode Command Line Tools..."
  xcode-select --install
  echo "    Re-run this script after Xcode CLT installation completes."
  exit 1
fi
ok "Xcode CLT: $(xcode-select -p)"

# Rust
if ! command -v rustc &>/dev/null; then
  log "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
ok "Rust: $(rustc --version)"

# Bun
if [ ! -f "$BUN_PATH" ]; then
  log "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
fi
ok "Bun: $($BUN_PATH --version)"

# =============================================================================
# 2. Rust targets
# =============================================================================
log "Adding Rust targets..."

if ! rustup target list --installed | grep -q "aarch64-apple-darwin"; then
  rustup target add aarch64-apple-darwin
  ok "Added aarch64-apple-darwin"
else
  ok "aarch64-apple-darwin already installed"
fi

if ! rustup target list --installed | grep -q "x86_64-apple-darwin"; then
  rustup target add x86_64-apple-darwin
  ok "Added x86_64-apple-darwin"
else
  ok "x86_64-apple-darwin already installed"
fi

# =============================================================================
# 3. JS dependencies
# =============================================================================
log "Installing JS dependencies via npm (bun has registry issues in some envs)..."
npm install --legacy-peer-deps --silent

# Pin Tauri JS packages to match Rust crate versions in Cargo.toml
log "Pinning Tauri JS packages to match Rust crate versions..."
npm install --legacy-peer-deps --silent \
  @tauri-apps/api@2.9.1 \
  @tauri-apps/plugin-dialog@2.6.0 \
  @tauri-apps/plugin-updater@2.9.0 \
  @tauri-apps/plugin-fs@2.4.5
ok "JS dependencies installed"

# =============================================================================
# 4. Download real yt-dlp sidecar
# =============================================================================
log "Checking yt-dlp sidecar binaries..."

mkdir -p src-tauri/bin

YTDLP_AARCH64="src-tauri/bin/yt-dlp-aarch64-apple-darwin"
YTDLP_X86="src-tauri/bin/yt-dlp-x86_64-apple-darwin"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"

# Download if missing or empty (placeholder)
if [ ! -s "$YTDLP_AARCH64" ]; then
  log "Downloading yt-dlp (macOS universal binary)..."
  curl -L --proxy "$PROXY" -o "$YTDLP_AARCH64" "$YTDLP_URL"
  chmod +x "$YTDLP_AARCH64"
  ok "Downloaded yt-dlp: $(du -sh "$YTDLP_AARCH64" | cut -f1)"
else
  ok "yt-dlp aarch64 already present: $(du -sh "$YTDLP_AARCH64" | cut -f1)"
fi

# yt-dlp_macos is a universal binary — same file works for x86_64
if [ ! -s "$YTDLP_X86" ]; then
  cp "$YTDLP_AARCH64" "$YTDLP_X86"
  chmod +x "$YTDLP_X86"
  ok "Copied yt-dlp for x86_64"
else
  ok "yt-dlp x86_64 already present: $(du -sh "$YTDLP_X86" | cut -f1)"
fi

# =============================================================================
# 5. Patch tauri.conf.json — use full bun path for beforeBuildCommand
#    (bun is not in PATH when tauri spawns subprocesses)
# =============================================================================
log "Patching tauri.conf.json beforeBuildCommand..."
sed -i '' \
  's|"beforeBuildCommand": "bun run build"|"beforeBuildCommand": "'"$BUN_PATH"' run build"|' \
  src-tauri/tauri.conf.json
ok "Patched"

restore_tauri_conf() {
  sed -i '' \
    's|"beforeBuildCommand": "'"$BUN_PATH"' run build"|"beforeBuildCommand": "bun run build"|' \
    src-tauri/tauri.conf.json
}
# Always restore on exit
trap restore_tauri_conf EXIT

# =============================================================================
# 6. Build
# =============================================================================
build_target() {
  local TARGET="$1"
  log "Building $TARGET..."
  # Ignore exit code — signing key error is expected and non-fatal
  tauri build --target "$TARGET" --bundles app || true

  local APP="src-tauri/target/$TARGET/release/bundle/macos/Youwee.app"
  if [ -d "$APP" ]; then
    ok ".app bundle created: $APP"
  else
    fail ".app bundle missing for $TARGET — build failed"
  fi
}

build_target "aarch64-apple-darwin"
build_target "x86_64-apple-darwin"

# =============================================================================
# 7. Package DMGs
# =============================================================================
make_dmg() {
  local TARGET="$1"
  local DMG_NAME="$2"
  local APP="src-tauri/target/$TARGET/release/bundle/macos/Youwee.app"
  local DMG="src-tauri/target/$TARGET/release/bundle/dmg/$DMG_NAME"
  local STAGING="/tmp/youwee_dmg_${TARGET}_$$"

  log "Creating DMG for $TARGET..."
  mkdir -p "$(dirname "$DMG")"
  mkdir -p "$STAGING"
  cp -r "$APP" "$STAGING/"

  hdiutil create \
    -volname "Youwee" \
    -srcfolder "$STAGING" \
    -ov \
    -format UDZO \
    "$DMG"

  rm -rf "$STAGING"
  ok "$(ls -lh "$DMG" | awk '{print $5, $9}')"
}

make_dmg "aarch64-apple-darwin" "Youwee_0.14.1_aarch64.dmg"
make_dmg "x86_64-apple-darwin"  "Youwee_0.14.1_x64.dmg"

# =============================================================================
# 8. Summary
# =============================================================================
echo ""
echo "============================================================"
echo " Build complete!"
echo "============================================================"
echo ""
echo "  Apple Silicon:"
ls -lh "src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Youwee_0.14.1_aarch64.dmg"
echo ""
echo "  Intel:"
ls -lh "src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Youwee_0.14.1_x64.dmg"
echo ""
