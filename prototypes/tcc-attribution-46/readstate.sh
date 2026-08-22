#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #46.
#
# Reads all three subjects with no UI and no clicking, and appends the JSON to
# logs/. Use it right after each rebuild arm to capture that arm's state.
#
#   ./readstate.sh <label>
#
# It launches through `open`, not by running the binary directly. That matters:
# starting the app from a shell makes the terminal's GUI app (Terminal, iTerm,
# VS Code) the *responsible process*, and responsible-process attribution is
# exactly what the experiment is trying to measure. Launched via `open`, the app
# is its own responsible process, which is what a real user's launch looks like.
#
# It cannot replace the human steps: prompting for a grant, and reading what
# System Settings names. Those are steps 3 and 7 in README.md.
source "$(cd "$(dirname "$0")" && pwd)/lib.sh"

LABEL="${1:-unlabelled}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$LOGS/state-$STAMP-$LABEL.json"

open -W -n "$APP" --args --selftest "--out=$OUT"

if [ ! -s "$OUT" ]; then
  echo "no report written - the app may have failed to start" >&2
  exit 1
fi
echo "wrote $OUT"

# The lines that matter, pulled out of the JSON.
/usr/bin/python3 - "$OUT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
h, ax, hk = d["host"], d["axhelper"]["result"], d["hotkeyhelper"]["result"]
print(f'host          reported={h["accessibility"]["reportedTrusted"]!s:<5} '
      f'mic={h["microphone"]:<16} cdhash={h["code"]["cdhash"]}')
print(f'axhelper      reported={ax["reportedTrusted"]!s:<5} '
      f'functional={ax["functionallyTrusted"]!s:<5} cdhash={ax["cdhash"]}')
print(f'              responsible={ax["responsibleExecutable"]}')
print(f'hotkeyhelper  reported={hk["reportedGranted"]!s:<5} '
      f'functional={hk["functionallyGranted"]!s:<5} cdhash={hk["cdhash"]}')
print(f'              responsible={hk["responsibleExecutable"]}')
PY
