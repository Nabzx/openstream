#!/usr/bin/env bash
# PROTOTYPE — build and run one trial of the issue #10 tree-richness probe.
#
# Usage: run the command FIRST, then switch to and click into the target
# app - the probe gives a 3s countdown before it reads what's frontmost, so
# Terminal (necessarily frontmost when you hit Enter) doesn't get measured
# instead of the app you meant to test.
#   ./run.sh manual   "<free text note, e.g. 'VS Code, clicked into probe.swift'>"
#   ./run.sh enhanced "<note>"
#   ./run.sh both     "<note>"
#   ./run.sh none     "<note>"   # baseline, no poke at all
#
# Every run appends to the same logs/session.jsonl - run it once per app per
# mechanism you want data on, switching focus by hand between runs.
set -euo pipefail
cd "$(dirname "$0")"

MECHANISM="${1:-}"
NOTE="${2:-}"
mkdir -p logs

case "$MECHANISM" in
  manual|enhanced|both|none) ;;
  *)
    echo "usage: ./run.sh manual|enhanced|both|none \"<note>\""
    exit 2
    ;;
esac

swiftc probe.swift -o .probe
trap 'rm -f .probe' EXIT

./.probe --mechanism "$MECHANISM" --note "$NOTE" --output logs/session.jsonl
