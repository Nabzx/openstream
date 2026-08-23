#!/usr/bin/env bash
#
# Compiles the push-to-talk hotkey helper (native/hotkey-helper) and stages
# the binary at resources/bin/hotkey-helper. See issue #5.
#
# Swift-only, no external deps - `swift build` is enough. Safe to re-run:
# swift build is itself incremental, and this script just re-copies the
# freshly built binary each time.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PKG_DIR="$ROOT/native/hotkey-helper"
BIN_DIR="$ROOT/resources/bin"
OUT_PATH="$BIN_DIR/hotkey-helper"

echo "==> hotkey-helper"
swift build --package-path "$PKG_DIR" -c release

BUILT_BIN_DIR="$(swift build --package-path "$PKG_DIR" -c release --show-bin-path)"

mkdir -p "$BIN_DIR"
cp "$BUILT_BIN_DIR/hotkey-helper" "$OUT_PATH"
chmod +x "$OUT_PATH"

echo "==> done: $OUT_PATH"
