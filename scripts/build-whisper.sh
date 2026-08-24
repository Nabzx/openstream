#!/usr/bin/env bash
# Backwards-compatible wrapper. The build now prepares both model roles from
# pinned source and weight artifacts; see scripts/model-artifacts.mjs.
set -euo pipefail
node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prepare-model-artifacts.mjs"
