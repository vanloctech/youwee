#!/usr/bin/env bash
# Make Tauri's default AppImage safe on hosts newer than the build image.
#
# linuxdeploy copies core Wayland/GLib/GStreamer libraries into the AppImage.
# Those libraries must stay in sync with the host Mesa and desktop stack; mixing
# the Ubuntu 22.04 copies with a newer host causes WebKitGTK to abort while
# creating its EGL display.  This script keeps application libraries (including
# WebKitGTK) bundled, but defers the desktop-stack libraries to the host.
#
# The optional third argument is AppImage update information (for example
# "gh-releases-zsync|owner|repo|latest|App.AppImage.zsync"). It is written to
# the runtime's .upd_info ELF section so AppImageUpdate-compatible tools can
# find delta updates.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <AppImage> <main-binary-name> [update-information]" >&2
  exit 64
fi

appimage=$1
main_binary=$2
update_information=${3:-}

if [ ! -f "$appimage" ]; then
  echo "AppImage does not exist: $appimage" >&2
  exit 1
fi

for required_command in dd mksquashfs mktemp; do
  command -v "$required_command" >/dev/null || {
    echo "Missing required command: $required_command" >&2
    exit 1
  }
done

workspace=$(mktemp -d)
trap 'rm -rf "$workspace"' EXIT

appimage_abs=$(cd "$(dirname "$appimage")" && pwd)/$(basename "$appimage")
cd "$workspace"

# --appimage-extract works without FUSE. APPIMAGE_EXTRACT_AND_RUN also makes
# extraction work on GitHub runners where FUSE is unavailable.
APPIMAGE_EXTRACT_AND_RUN=1 "$appimage_abs" --appimage-extract >/dev/null
appdir="$workspace/squashfs-root"

if [ ! -x "$appdir/usr/bin/$main_binary" ]; then
  echo "Expected executable is missing from AppImage: usr/bin/$main_binary" >&2
  exit 1
fi

# Keep these ABI-coupled libraries on the host. Do not broaden this list to
# application dependencies: the goal is to preserve AppImage portability while
# avoiding the Mesa/Wayland and GLib ABI mismatch that causes EGL_BAD_PARAMETER.
for pattern in \
  'libwayland-*.so*' \
  'libxkbcommon*.so*' \
  'libglib-2.0.so*' \
  'libgio-2.0.so*' \
  'libgobject-2.0.so*' \
  'libgmodule-2.0.so*' \
  'libgst*.so*' \
  'libmount.so*' \
  'libblkid.so*' \
  'libselinux.so*' \
  'libpcre2-8.so*' \
  'libzstd.so*' \
  'libelf.so*' \
  'libffi.so*'; do
  find "$appdir/usr/lib" -maxdepth 1 \( -type f -o -type l \) -name "$pattern" -delete
done

# Bypass linuxdeploy's AppRun.wrapped, which exports paths for bundled
# GStreamer/Python/Qt components that Youwee does not ship. In particular, an
# empty GST_PLUGIN_SYSTEM_PATH prevents WebKitGTK from finding host plugins.
cat > "$appdir/AppRun" <<APP_RUN
#!/usr/bin/env bash
set -euo pipefail
APPDIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export APPDIR

if [ -f "\$APPDIR/apprun-hooks/linuxdeploy-plugin-gtk.sh" ]; then
  # shellcheck disable=SC1091
  source "\$APPDIR/apprun-hooks/linuxdeploy-plugin-gtk.sh"
fi

unset PYTHONHOME PYTHONPATH PERLLIB QT_PLUGIN_PATH
unset GST_PLUGIN_SYSTEM_PATH GST_PLUGIN_SYSTEM_PATH_1_0 GST_PLUGIN_PATH_1_0
unset GST_PLUGIN_SCANNER_1_0 GST_PTP_HELPER_1_0
export LD_LIBRARY_PATH="\$APPDIR/usr/lib\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export PATH="\$APPDIR/usr/bin:\$PATH"

# WebKitGTK helper processes resolve bundled libraries relative to usr.
cd "\$APPDIR/usr"
exec "\$APPDIR/usr/bin/$main_binary" "\$@"
APP_RUN
chmod +x "$appdir/AppRun"

offset=$(APPIMAGE_EXTRACT_AND_RUN=1 "$appimage_abs" --appimage-offset)
runtime="$workspace/runtime"
payload="$workspace/payload.squashfs"
rebuilt="$workspace/$(basename "$appimage")"

dd if="$appimage_abs" of="$runtime" bs=1 count="$offset" status=none

if [ -n "$update_information" ]; then
  command -v readelf >/dev/null || {
    echo "Missing required command: readelf" >&2
    exit 1
  }

  # readelf -S -W columns after "[Nr]": Name Type Address Off Size ...
  read -r section_offset section_size < <(
    readelf -S -W "$runtime" | awk '{ sub(/^.*\]/, "") } $1 == ".upd_info" { print $4, $5 }'
  ) || true
  if [ -z "${section_offset:-}" ]; then
    echo "AppImage runtime has no .upd_info section" >&2
    exit 1
  fi
  section_offset=$((16#$section_offset))
  section_size=$((16#$section_size))
  if [ "${#update_information}" -ge "$section_size" ]; then
    echo "Update information is longer than the .upd_info section ($section_size bytes)" >&2
    exit 1
  fi

  dd if=/dev/zero of="$runtime" bs=1 seek="$section_offset" count="$section_size" conv=notrunc status=none
  printf '%s' "$update_information" |
    dd of="$runtime" bs=1 seek="$section_offset" conv=notrunc status=none
fi
mksquashfs "$appdir" "$payload" -noappend -all-root -comp zstd -no-progress >/dev/null
cat "$runtime" "$payload" > "$rebuilt"
chmod +x "$rebuilt"
mv "$rebuilt" "$appimage_abs"

echo "Rebuilt AppImage with host Wayland/GLib/GStreamer runtime libraries: $appimage_abs"
if [ -n "$update_information" ]; then
  echo "Embedded AppImage update information: $update_information"
fi
