#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #46.
#
# EXPERIMENT ARM 2: recompile the helpers with a changed build tag, so their
# content and therefore their CDHash really moves. The JavaScript is untouched.
#
# What to watch: if the helpers now fail their grant check while the app still
# passes, TCC keys the entry to the helper's own code identity. If they keep
# passing, the entry is not keyed to them.
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

if [ ! -d "$APP" ]; then echo "no build yet - run ./build.sh first" >&2; exit 1; fi

before_ax="$(cdhash_of "$HELPER_DIR/axhelper")"
TAG="$(date -u +%Y%m%d-%H%M%S)-helperrebuild"

compile_helper axhelper "$TAG"
compile_helper hotkeyhelper "$TAG"
sign_app

record "rebuild-helpers.sh (helpers recompiled, JavaScript untouched)"

after_ax="$(cdhash_of "$HELPER_DIR/axhelper")"
if [ "$before_ax" = "$after_ax" ]; then
  echo "WARN axhelper CDHash did NOT move - the arm is void, the rebuild changed nothing"
else
  echo "OK   axhelper CDHash moved ($before_ax -> $after_ax)"
fi
echo
echo "Now: quit and relaunch the app, click each helper button, record the result."
