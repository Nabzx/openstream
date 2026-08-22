#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #42. Drives the whole second pass in one
# go, so it can run unattended on a quiet machine.
#
# MUST be launched from Terminal.app, because every keystroke here goes through
# System Events and the process that needs Accessibility trust is the one making
# the call. Terminal.app was granted during issue #28 and still holds it.
#
#   osascript -e 'tell app "Terminal" to do script "<abs path>/run-all-42.sh"'
set -u
cd "$(dirname "$0")"
mkdir -p logs

STAMP=$(date +%Y%m%d-%H%M%S)
MAIN="logs/probe-42-$STAMP.log"
TRACE="logs/run-all-42-$STAMP.trace"

exec > >(tee -a "$TRACE") 2>&1

echo "### run-all-42 starting at $(date)"
swift probe.swift --once | head -3

# One long-lived probe covers the sweep, the field pass and the focus retry.
# controlled-ab-42.sh and jetbrains-knob-ab.sh start their own probes, so this
# one is stopped before they run.
swift probe.swift --poke > "$MAIN" 2>&1 &
PROBE=$!
sleep 10
echo "### probe running -> $MAIN"

./sweep-42.sh
./field-pass-42.sh
./focus-retry-42.sh

kill "$PROBE" 2>/dev/null
pkill -f "probe.swift" 2>/dev/null
sleep 3
echo "### main probe stopped"

./controlled-ab-42.sh

echo "### run-all-42 done at $(date)"
echo "### logs: $MAIN, logs/ab42-nopoke.log, logs/ab42-poke.log"
echo "### jetbrains-knob-ab.sh is NOT run here - IntelliJ needs one manual first launch"
