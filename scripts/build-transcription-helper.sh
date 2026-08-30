#!/usr/bin/env bash
#
# Compiles the transcription model server (native/transcription-helper) and
# stages the binary at resources/bin/transcription-helper. See issue #204.
#
# Unlike whisper.cpp there is no C++ build and no ggml weight to download here:
# FluidAudio is a pure-Swift SPM dependency and pulls the Parakeet CoreML
# bundles from Hugging Face on the helper's first run. `swift build` resolves
# and compiles FluidAudio, so the first run of this script is slow (a few
# minutes); after that it is incremental. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PKG_DIR="$ROOT/native/transcription-helper"
BIN_DIR="$ROOT/resources/bin"
OUT_PATH="$BIN_DIR/transcription-helper"

echo "==> transcription-helper"
swift build --package-path "$PKG_DIR" -c release

BUILT_BIN_DIR="$(swift build --package-path "$PKG_DIR" -c release --show-bin-path)"

mkdir -p "$BIN_DIR"
cp "$BUILT_BIN_DIR/transcription-helper" "$OUT_PATH"
chmod +x "$OUT_PATH"

echo "==> done: $OUT_PATH"
