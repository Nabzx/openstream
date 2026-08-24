#!/usr/bin/env bash
# PROTOTYPE — build and run the issue #74 timing harness.
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-}"
CONDITION="${2:-idle}"
REPETITIONS="${REPETITIONS:-20}"
DWELL_MS="${DWELL_MS:-4000}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p logs

if [[ "$MODE" != "automated" && "$MODE" != "manual" ]]; then
  echo "usage: ./run.sh automated [idle|stressed]"
  echo "       ./run.sh manual [idle|stressed]"
  exit 2
fi

swiftc probe.swift -o .probe
OUTPUT="logs/${MODE}-${CONDITION}-${STAMP}.jsonl"
STRESS_PIDS=()

cleanup() {
  for pid in "${STRESS_PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  rm -f .probe
}
trap cleanup EXIT INT TERM

if [[ "$CONDITION" == "stressed" ]]; then
  echo "Starting a conservative stress proxy: four CPU workers and 2 GiB touched memory."
  echo "This is not an 8 GB Mac and the results must not be described as one."
  for _ in 1 2 3 4; do yes >/dev/null & STRESS_PIDS+=("$!"); done
  python3 - <<'PY' &
import time
blocks = [bytearray(64 * 1024 * 1024) for _ in range(32)]
for block in blocks:
    for i in range(0, len(block), 4096):
        block[i] = 1
while True:
    time.sleep(1)
PY
  STRESS_PIDS+=("$!")
  sleep 2
elif [[ "$CONDITION" != "idle" ]]; then
  echo "condition must be idle or stressed" >&2
  exit 2
fi

echo "Writing $OUTPUT"
./.probe \
  --mode "$MODE" \
  --condition "$CONDITION" \
  --repetitions "$REPETITIONS" \
  --dwell-ms "$DWELL_MS" \
  --output "$OUTPUT"

echo
if [[ "$MODE" == "automated" ]]; then
  echo "Pass complete. Analyze all completed passes with:"
  echo "  ./analyze.py logs/*.jsonl > RESULTS.md"
else
  echo "Manual log captured. Analyze it together with the automated logs."
fi
