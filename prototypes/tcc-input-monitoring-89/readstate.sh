#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #89.
# Launch through `open`, so the probe's responsible process is the app, not
# the terminal that started this script.
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/lib.sh"
export BUNDLE_ID

LABEL="${1:-unlabelled}"
OPERATION="${2:-check}"
case "$OPERATION" in
  check|accessibility-only|request-only|tap-only|request-and-tap) ;;
  *) echo "unknown operation: $OPERATION" >&2; exit 2 ;;
esac

STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$LOGS/state-$STAMP-$LABEL.json"

open -W -n "$APP" --args --selftest "--operation=$OPERATION" "--out=$OUT"

if [ ! -s "$OUT" ]; then
  echo "no report written - the app may have failed to start" >&2
  exit 1
fi
echo "wrote $OUT"

/usr/bin/python3 - "$OUT" <<'PY'
import json, sys

data = json.load(open(sys.argv[1]))
ax = data["axhelper"]["result"]
hotkey = data["hotkeyhelper"]["result"]
print(f'operation     {data["operation"]}')
print(f'bundle        {data["bundleIdentifier"]}')
print(f'axhelper      reported={ax["reportedTrusted"]!s:<5} '
      f'functional={ax["functionallyTrusted"]!s:<5}')
print(f'hotkeyhelper  access={hotkey["reportedAccess"]:<20} '
      f'functional={hotkey["functionallyGranted"]!s:<5}')
print(f'              requested={hotkey.get("requestAttempted", False)!s:<5} '
      f'tapAttempted={hotkey.get("tapAttempted", False)!s:<5} '
      f'tapCreated={hotkey.get("tapCreated", False)!s:<5}')
PY
