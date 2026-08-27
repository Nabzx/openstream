#!/usr/bin/env bash
# PROTOTYPE — issue #178. Run from any working directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/../.."
exec python3 "$ROOT/bench.py" "$@"
