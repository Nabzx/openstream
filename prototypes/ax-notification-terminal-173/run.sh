#!/usr/bin/env bash
# PROTOTYPE — build and run the issue #173 notification-delivery probe.
#
# Usage: type this in the terminal you're testing (plain Terminal.app, or
# VS Code's integrated terminal panel), then switch between 2-3 real apps
# a few times over the next 30 seconds while it runs.
#
#   ./run.sh plain-terminal   # run from a normal Terminal.app window
#   ./run.sh vscode-terminal  # run from VS Code's integrated terminal panel
set -euo pipefail
cd "$(dirname "$0")"

LABEL="${1:-}"
if [[ -z "$LABEL" ]]; then
  echo "usage: ./run.sh <label, e.g. plain-terminal or vscode-terminal>"
  exit 2
fi

mkdir -p logs
OUTPUT="logs/${LABEL}-$(date +%Y%m%d-%H%M%S).jsonl"

swiftc probe.swift -o .probe
trap 'rm -f .probe' EXIT

./.probe "$OUTPUT"
echo
echo "Wrote $OUTPUT"
echo "Analyze with: ./analyze.py logs/*.jsonl"
