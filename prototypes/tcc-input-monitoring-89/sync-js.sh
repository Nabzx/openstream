#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #89.
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

TAG="${JS_TAG:-$(date -u +%Y%m%d-%H%M%S)}"
DEST="$APP/Contents/Resources/app"

rm -rf "$DEST"
mkdir -p "$DEST"
cp "$ROOT/app/src/"* "$DEST/"
sed -i '' \
  -e "s/JS_BUILD_TAG_PLACEHOLDER/$TAG/g" \
  -e "s/BUNDLE_ID_PLACEHOLDER/$BUNDLE_ID/g" \
  "$DEST/main.js" "$DEST/index.html"

[ "${1:-}" = "--no-sign" ] || sign_app
echo "js synced (tag $TAG, bundle $BUNDLE_ID)"
