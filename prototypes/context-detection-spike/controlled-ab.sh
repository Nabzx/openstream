#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #28. Controlled A/B for the one claim
# the earlier runs could not support.
#
# The problem with those runs: Wispr Flow (a context-aware dictation app, and
# therefore an active accessibility client) was running the whole time, and
# Chromium builds its accessibility tree when ANY AT client asks, not only when
# this probe sets AXManualAccessibility. So "VS Code exposed a tree without my
# poke" may have meant "something else already enabled it". On top of that, both
# the poke and no-poke runs hit the same long-lived Cursor and Obsidian
# processes, so the second arm was never actually un-poked.
#
# This script quits the other AT client, restarts the two Electron apps so they
# start cold, and runs two arms against fresh processes. It also types known
# text into each field, because "AXValue is non-nil" is not the same claim as
# "we can read what the user typed".
#
# Run from the Accessibility-trusted Terminal. VS Code is deliberately left
# alone: it hosts the session that drives this, so it cannot be restarted cold
# and its cell keeps a stated caveat instead.
set -u
cd "$(dirname "$0")"

PROBE_PID=""

start_probe() {  # $1 = arm label, $2... = probe flags
  local label="$1"; shift
  swift probe.swift "$@" > "logs/ab-$label.log" 2>&1 &
  PROBE_PID=$!
  sleep 8   # swift compiles the script before it starts sampling
  echo "### probe started for arm: $label (flags: $*)"
}

stop_probe() {
  [ -n "$PROBE_PID" ] && kill "$PROBE_PID" 2>/dev/null
  pkill -f "probe.swift" 2>/dev/null
  sleep 2
  echo "### probe stopped"
}

type_into() {  # $1 = app, $2 = shortcut key, $3 = what it opens
  osascript >/dev/null 2>&1 <<EOF
tell application "$1" to activate
delay 4
tell application "System Events" to keystroke "$2" using {command down}
delay 3
tell application "System Events" to keystroke "hello world"
EOF
  echo "### $1: $3, typed 'hello world' (11 chars)"
  sleep 5
}

run_arm() {  # $1 = label, $2... = probe flags
  local label="$1"; shift
  start_probe "$label" "$@"
  type_into "Cursor" "n" "new untitled editor"
  type_into "Obsidian" "o" "quick switcher input"
  type_into "Visual Studio Code" "n" "new untitled editor"
  stop_probe
}

echo "### controlled A/B starting"

# Remove the competing accessibility client and start the Electron apps cold.
osascript -e 'tell application "Wispr Flow" to quit' >/dev/null 2>&1
osascript -e 'tell application "Cursor" to quit' >/dev/null 2>&1
osascript -e 'tell application "Obsidian" to quit' >/dev/null 2>&1
sleep 8
pkill -f "Wispr Flow" 2>/dev/null
sleep 2
echo "### quit Wispr Flow, Cursor, Obsidian"

open -a "Cursor" >/dev/null 2>&1
open -a "Obsidian" >/dev/null 2>&1
sleep 25
echo "### relaunched Cursor and Obsidian cold"

run_arm "nopoke"
run_arm "poke" --poke

echo "### controlled A/B done"
