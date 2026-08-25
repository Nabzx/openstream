#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #89.
# Build a fresh ad-hoc-signed Electron app and two native probe helpers.
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
export BUNDLE_ID

TAG="$(date -u +%Y%m%d-%H%M%S)-initial"
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

echo "==> assembling $APP ($BUNDLE_ID)"
rm -rf "$APP"
cp -R "$ELECTRON_SRC" "$APP"
rm -rf "$APP/Contents/Resources/default_app.asar"

/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName TCCProbe" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName TCCProbe" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable TCCProbe" "$APP/Contents/Info.plist"
mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/TCCProbe"
/usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string 'PROTOTYPE: Input Monitoring attribution spike (issue #89)'" "$APP/Contents/Info.plist" 2>/dev/null || true

"$ROOT/sync-js.sh" --no-sign
compile_helper axhelper "$TAG"
compile_helper hotkeyhelper "$TAG"
sign_app
record "build.sh (fresh arm)"

echo "built: $APP"
echo "open it with: open '$APP'"
