#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #46.
# Copies app/src into the bundle and stamps it with a JS build tag. Used by
# build.sh (with --no-sign) and by rebuild-js.sh (which signs).
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

TAG="${JS_TAG:-$(date -u +%Y%m%d-%H%M%S)}"
DEST="$APP/Contents/Resources/app"

rm -rf "$DEST"
mkdir -p "$DEST"
cp "$ROOT/app/src/"* "$DEST/"
sed -i '' "s/JS_BUILD_TAG_PLACEHOLDER/$TAG/g" "$DEST/main.js" "$DEST/index.html"

[ "${1:-}" = "--no-sign" ] || sign_app
echo "js synced (tag $TAG)"
