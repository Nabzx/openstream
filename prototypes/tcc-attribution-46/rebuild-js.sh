#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #46.
#
# EXPERIMENT ARM 1: change only the Electron JavaScript, then re-sign the app.
# The helper binaries are not recompiled and not touched.
#
# What to watch: the app's CDHash moves, the helpers' CDHashes must not. Then
# relaunch the app and click the helper buttons. If the helpers still pass and
# the app does not, grants attach per-helper; if all three drop, the Electron
# bundle holds them.
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

if [ ! -d "$APP" ]; then echo "no build yet - run ./build.sh first" >&2; exit 1; fi

before_ax="$(cdhash_of "$HELPER_DIR/axhelper")"
before_hk="$(cdhash_of "$HELPER_DIR/hotkeyhelper")"

JS_TAG="$(date -u +%Y%m%d-%H%M%S)-jsrebuild" "$ROOT/sync-js.sh"

after_ax="$(cdhash_of "$HELPER_DIR/axhelper")"
after_hk="$(cdhash_of "$HELPER_DIR/hotkeyhelper")"

record "rebuild-js.sh (JavaScript changed, helpers untouched)"

for pair in "axhelper:$before_ax:$after_ax" "hotkeyhelper:$before_hk:$after_hk"; do
  IFS=: read -r n b a <<< "$pair"
  if [ "$b" = "$a" ]; then
    echo "OK   $n CDHash unchanged across the JS rebuild ($a)"
  else
    echo "WARN $n CDHash MOVED ($b -> $a) - the JS-only rebuild was not helper-neutral"
  fi
done
echo
echo "Now: quit and relaunch the app, click each helper button, record the result."
