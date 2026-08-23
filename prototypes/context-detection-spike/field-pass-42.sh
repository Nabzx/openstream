#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #42. Field-focus pass for the three app
# slots issue #28 could not test because the apps were not installed:
#
#   Slack                 the one genuine Electron chat app (WhatsApp turned out
#                         to be native and never stood in for it)
#   IntelliJ IDEA CE      a JetBrains IDE, Swing editor behind an in-app knob
#   Hyper                 a standalone Electron terminal
#
# Run from the Accessibility-trusted Terminal, with the probe already running in
# another window (./run.sh --poke). This script only drives focus.
#
# Every app gets a long dwell. Issue #28's inconclusive cells were caused by one
# second of dwell, not by the apps.
set -u
cd "$(dirname "$0")"

DWELL="${DWELL:-12}"

have() { [ -d "/Applications/$1.app" ]; }

drive() {  # $1 = app name, $2 = human description, $3 = osascript body
  local app="$1" what="$2" body="$3"
  if ! have "$app"; then
    echo "### NOT INSTALLED: $app - cell stays untested"
    return
  fi
  echo "### $app -> $what"
  osascript >/dev/null 2>&1 <<EOF
tell application "$app" to activate
delay 5
$body
EOF
  sleep "$DWELL"
}

echo "### field pass for issue #42 starting (dwell ${DWELL}s per app)"

# Slack. Signed in, plain typing lands in the message composer. Signed out, it
# lands in the workspace-URL field, which is still an Electron text field and
# still a valid role/AXValue reading - the log records which screen was up.
drive "Slack" "composer (or sign-in field if signed out), typed 'hello world'" \
  'tell application "System Events" to keystroke "hello world"'

# Hyper. Electron terminal. The question is whether AXValue returns the input
# line or the whole scrollback, the way native Terminal.app did.
drive "Hyper" "shell prompt, typed 'hello world' (NOT executed)" \
  'tell application "System Events" to keystroke "hello world"'

# IntelliJ. Swing editor. Whether this cell reads at all is the third-category
# question; jetbrains-knob-ab.sh runs it with the knob off and on.
drive "IntelliJ IDEA CE" "editor, typed 'hello world'" \
  'tell application "System Events" to keystroke "hello world"'

echo "### field pass for issue #42 done"
