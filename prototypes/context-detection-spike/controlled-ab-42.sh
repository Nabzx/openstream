#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #42. Re-run of controlled-ab.sh with the
# one defect that kept its result at "AXManualAccessibility appears required"
# rather than proven: the two arms did not get equal dwell. VS Code hosts the
# session driving the probe and kept reclaiming focus within a second or two, so
# in the no-poke arm Cursor and Obsidian each held focus for about one second
# against 13-25 seconds in the poke arm. A one-second window may simply be too
# short for a focused element to exist yet, which is a rival explanation for the
# no-poke arm's failures.
#
# The fix is not a longer sleep - a longer sleep loses focus just the same. It
# is to RE-ASSERT activation every two seconds across the dwell window, so any
# app that steals focus back holds it for at most two seconds and both arms get
# the same real exposure. The script prints the number of re-assertions so the
# dwell is auditable rather than assumed.
#
# Run from the Accessibility-trusted Terminal.
set -u
cd "$(dirname "$0")"
mkdir -p logs

DWELL="${DWELL:-24}"      # seconds of held focus per app per arm
PROBE_PID=""

start_probe() {  # $1 = arm label, $2... = probe flags
  local label="$1"; shift
  swift probe.swift "$@" > "logs/ab42-$label.log" 2>&1 &
  PROBE_PID=$!
  sleep 8   # swift compiles the script before it starts sampling
  echo "### probe started for arm: $label (flags: ${*:-none})"
}

stop_probe() {
  [ -n "$PROBE_PID" ] && kill "$PROBE_PID" 2>/dev/null
  pkill -f "probe.swift" 2>/dev/null
  sleep 2
  echo "### probe stopped"
}

hold() {  # $1 = app, $2 = shortcut key (empty for none), $3 = description
  local app="$1" key="$2" what="$3"
  local reasserts=$(( DWELL / 2 ))

  osascript >/dev/null 2>&1 <<EOF
tell application "$app" to activate
delay 4
EOF
  if [ -n "$key" ]; then
    osascript -e "tell application \"System Events\" to keystroke \"$key\" using {command down}" >/dev/null 2>&1
    sleep 3
  fi
  osascript -e 'tell application "System Events" to keystroke "hello world"' >/dev/null 2>&1

  # Hold focus for the whole dwell, re-asserting so nothing steals it for long.
  local i=0
  while [ "$i" -lt "$reasserts" ]; do
    osascript -e "tell application \"$app\" to activate" >/dev/null 2>&1
    sleep 2
    i=$(( i + 1 ))
  done
  echo "### $app: $what, typed 'hello world' (11 chars), held ~${DWELL}s over $reasserts re-assertions"
}

run_arm() {  # $1 = label, $2... = probe flags
  local label="$1"; shift
  start_probe "$label" "$@"
  hold "Cursor"   "n" "new untitled editor"
  hold "Obsidian" "o" "quick switcher input"
  stop_probe
}

echo "### controlled A/B (issue #42 re-run, equal dwell) starting"

# Remove the competing accessibility client and start the Electron apps cold.
# Chromium builds its tree when ANY AT client asks, so Wispr Flow being up would
# confound the no-poke arm exactly as it did the first time.
osascript -e 'tell application "Wispr Flow" to quit' >/dev/null 2>&1
osascript -e 'tell application "Cursor" to quit' >/dev/null 2>&1
osascript -e 'tell application "Obsidian" to quit' >/dev/null 2>&1
sleep 8
pkill -f "Wispr Flow" 2>/dev/null
sleep 2
pgrep -fl "Wispr Flow" && echo "### WARNING: Wispr Flow still running, arm A is confounded"
echo "### quit Wispr Flow, Cursor, Obsidian"

open -a "Cursor" >/dev/null 2>&1
open -a "Obsidian" >/dev/null 2>&1
sleep 25
echo "### relaunched Cursor and Obsidian cold (pids: $(pgrep -d, -f Cursor) / $(pgrep -d, -f Obsidian))"

run_arm "nopoke"
run_arm "poke" --poke

echo "### controlled A/B (issue #42) done"
echo "### compare: logs/ab42-nopoke.log vs logs/ab42-poke.log"
