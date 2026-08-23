#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #46.
#
# Full build from scratch: compile both stub helpers, assemble a real Electron
# .app around them, ad-hoc sign everything, record every CDHash.
#
#   ./build.sh                 full build (fetches Electron on first run)
#   ./build.sh --helpers-only  recompile the helpers only, no Electron
#
# Run ./rebuild-js.sh and ./rebuild-helpers.sh afterwards; those are the two
# experiment arms.
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

HELPERS_ONLY=0
[ "${1:-}" = "--helpers-only" ] && HELPERS_ONLY=1

TAG="$(date -u +%Y%m%d-%H%M%S)-initial"

if [ "$HELPERS_ONLY" = 1 ]; then
  mkdir -p "$HELPER_DIR"
  compile_helper axhelper "$TAG"
  compile_helper hotkeyhelper "$TAG"
  echo "helpers built at $HELPER_DIR"
  exit 0
fi

# 1. Electron runtime. Fetched once from the pinned release into vendor/ and
#    reused. Deliberately not npm: the `electron` package's postinstall does the
#    same download behind a hook that gives no progress and hangs silently on a
#    restricted network. A pinned curl is the direct path and is reproducible.
ELECTRON_VERSION="32.3.3"
ELECTRON_DIR="$ROOT/vendor/electron-$ELECTRON_VERSION"
ELECTRON_SRC="$ELECTRON_DIR/Electron.app"
if [ ! -d "$ELECTRON_SRC" ]; then
  echo "==> fetching Electron $ELECTRON_VERSION (one time, ~100MB)"
  zip="$ROOT/vendor/electron-$ELECTRON_VERSION.zip"
  mkdir -p "$ROOT/vendor"
  curl -fL --progress-bar -o "$zip" \
    "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-darwin-arm64.zip"
  mkdir -p "$ELECTRON_DIR"
  ditto -x -k "$zip" "$ELECTRON_DIR"
  rm -f "$zip"
fi

# 2. Assemble the bundle from a pristine copy of the Electron runtime.
echo "==> assembling $APP"
rm -rf "$APP"
mkdir -p "$BUILD"
cp -R "$ELECTRON_SRC" "$APP"
rm -rf "$APP/Contents/Resources/default_app.asar"

# Give the bundle its own identity. The bundle id is what `tccutil reset` would
# need if the grants attach to the .app rather than to the helpers.
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName TCCProbe" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName TCCProbe" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable TCCProbe" "$APP/Contents/Info.plist"
mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/TCCProbe"
# Usage strings, so a prompt from the host is attributable to this app.
/usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string 'PROTOTYPE: TCC attribution spike (issue #46)'" "$APP/Contents/Info.plist" 2>/dev/null || true

# 3. App JS.
"$ROOT/sync-js.sh" --no-sign

# 4. Helpers.
compile_helper axhelper "$TAG"
compile_helper hotkeyhelper "$TAG"

# 5. Sign. Helpers were signed individually inside compile_helper; --deep
#    re-signs them as part of the bundle, and record() shows whether that moved
#    their CDHash.
echo "==> signing"
sign_app

record "build.sh (initial full build)"
echo "built: $APP"
echo "open it with:  open '$APP'"
