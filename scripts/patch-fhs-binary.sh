#!/usr/bin/env bash
# =============================================================================
# patch-fhs-binary.sh — Make Tauri binaries portable for FHS Linux distributions
# =============================================================================
#
# Called by tauri.conf.json beforeBundleCommand after cargo build, before
# .deb/.rpm/.AppImage assembly. Patches the ELF interpreter from nix store
# to standard FHS path and removes RPATH so the binary uses system libraries.
#
# Environment variables (set by Tauri CLI):
#   TAURI_ENV_TARGET_TRIPLE  — e.g. x86_64-unknown-linux-gnu
#   TAURI_ENV_DEBUG          — "true" for debug builds, "false" for release
#   TAURI_ENV_ARCH           — e.g. x86_64, aarch64
#   TAURI_ENV_PLATFORM       — e.g. linux, darwin, windows
#
# No-op conditions (exits 0):
#   - patchelf not on PATH (non-nix builds, macOS, Windows, CI)
#   - binary not found (cross-compilation target mismatch)
#   - interpreter already points to FHS path (idempotent)
#
# Fails loudly (exits non-zero, aborts tauri build) if:
#   - patchelf is available but patching fails
# =============================================================================
set -euo pipefail

# Skip if patchelf is not available (non-nix builds, macOS, Windows)
if ! command -v patchelf >/dev/null 2>&1; then
  exit 0
fi

# Determine build profile
PROFILE="release"
if [ "${TAURI_ENV_DEBUG:-false}" = "true" ]; then
  PROFILE="debug"
fi

# Determine binary path — Tauri places it at:
#   src-tauri/target/<triple>/<profile>/<name>  (cross-compilation)
#   src-tauri/target/<profile>/<name>            (native)
CARGO_NAME="youwee"
TRIPLE="${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV 2>/dev/null | sed -n 's/host: //p')}"
BIN="src-tauri/target/${TRIPLE}/${PROFILE}/${CARGO_NAME}"
if [ ! -f "$BIN" ]; then
  BIN="src-tauri/target/${PROFILE}/${CARGO_NAME}"
fi
if [ ! -f "$BIN" ]; then
  echo "patch-fhs-binary: binary not found, skipping" >&2
  exit 0
fi

# Determine correct FHS interpreter for target architecture
ARCH="${TAURI_ENV_ARCH:-$(uname -m)}"
case "$ARCH" in
  x86_64)   INTERP="/lib64/ld-linux-x86-64.so.2" ;;
  aarch64)  INTERP="/lib/ld-linux-aarch64.so.1" ;;
  armv7l)   INTERP="/lib/ld-linux-armhf.so.3" ;;
  i686)     INTERP="/lib/ld-linux.so.2" ;;
  *)
    echo "patch-fhs-binary: unknown arch '$ARCH', skipping" >&2
    exit 0
    ;;
esac

# Check current interpreter — skip if already FHS (idempotent)
CURRENT="$(patchelf --print-interpreter "$BIN" 2>/dev/null || true)"
if [ "$CURRENT" = "$INTERP" ]; then
  echo "patch-fhs-binary: $BIN already has FHS interpreter, skipping"
  exit 0
fi

# Patch interpreter and remove RPATH
patchelf --set-interpreter "$INTERP" --remove-rpath "$BIN"
echo "patch-fhs-binary: patched $BIN"
echo "  interpreter: $CURRENT -> $INTERP"
echo "  rpath: removed"
