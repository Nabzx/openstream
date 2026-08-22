#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #28. Starts the probe and tees everything
# into a timestamped log so the run can be read back later.
#
#   ./run.sh            poll and log
#   ./run.sh --poke     poll with AXManualAccessibility set on each frontmost app
#   ./run.sh --prompt   trigger the macOS Accessibility permission prompt first
#
# Whatever terminal or editor you launch this from is the process that needs
# Accessibility trust (System Settings > Privacy & Security > Accessibility).
set -u
cd "$(dirname "$0")"
mkdir -p logs
LOG="logs/probe-$(date +%Y%m%d-%H%M%S).log"
echo "logging to $LOG"
swift probe.swift "$@" 2>&1 | tee "$LOG"
