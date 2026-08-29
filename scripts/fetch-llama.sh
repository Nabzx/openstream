#!/usr/bin/env bash
#
# Fetches the prebuilt llama-server (macOS arm64) release and a
# SmolLM2-1.7B-Instruct GGUF, SHA-256 verified. See issue #14.
#
# Unlike whisper.cpp (#8), upstream publishes a macOS arm64 CLI binary, so
# this is a download rather than a compile. There is no LLM in the
# dictation path (#24) - this is plumbing only, for the voice-driven
# editing feature in #17, which is not built yet.
#
# Safe to re-run: skips the download if the binary or model is already
# present and correct.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# b10625 is the last macOS arm64 release before upstream added an
# unconditional librdma.dylib dependency to the RPC library. That system
# library is not available on the macOS versions OpenStream supports.
LLAMA_TAG="b10625"
LLAMA_ASSET="llama-$LLAMA_TAG-bin-macos-arm64.tar.gz"
LLAMA_URL="https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_TAG/$LLAMA_ASSET"
LLAMA_SHA256="f13c74d104c1ff2e37a14ecb2025afe5c9c4c148064badfd8116376018dd5159"
LLAMA_SERVER_SHA256="c32a2010dec561243448447599b7c13789022052ed59a336005758fbacf03639"
LLAMA_RPC_LIBRARY="libggml-rpc.0.22.0.dylib"
LLAMA_RPC_SHA256="18ab240ea5456c8c9a4aeb6e30ff77dc4e7d31944659fb10b22393e397568238"

# HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF - Apache 2.0, ungated (#32 rules
# out anything gated or non-permissive).
MODEL_REVISION="2d4a76a30b4af41ecd395c35725ac11688d4cfe4"
MODEL_URL="https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/$MODEL_REVISION/smollm2-1.7b-instruct-q4_k_m.gguf"
MODEL_SHA256="decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33"
MODEL_DIR="$ROOT/resources/models"
MODEL_PATH="$MODEL_DIR/smollm2-1.7b-instruct-q4_k_m.gguf"

BIN_DIR="$ROOT/resources/bin/llama"
SERVER_BIN="$BIN_DIR/llama-server"
RPC_LIBRARY="$BIN_DIR/$LLAMA_RPC_LIBRARY"

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

echo "==> llama-server ($LLAMA_TAG, macos-arm64)"
# The server executable is unchanged between b10625 and b10639, while the
# RPC dylib changed to link librdma. Verify both so an old incompatible bundle
# cannot survive a release-pin change.
if [ -x "$SERVER_BIN" ] \
  && [ "$(sha256 "$SERVER_BIN")" = "$LLAMA_SERVER_SHA256" ] \
  && [ -f "$RPC_LIBRARY" ] \
  && [ "$(sha256 "$RPC_LIBRARY")" = "$LLAMA_RPC_SHA256" ]; then
  echo "    already present and verified, skipping fetch"
else
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  TMP_TAR="$TMP_DIR/$LLAMA_ASSET"

  echo "    fetching $LLAMA_ASSET"
  curl -fL --http1.1 --retry 3 --retry-delay 2 --progress-bar -o "$TMP_TAR" "$LLAMA_URL"
  ACTUAL_SHA256="$(sha256 "$TMP_TAR")"
  if [ "$ACTUAL_SHA256" != "$LLAMA_SHA256" ]; then
    echo "error: $LLAMA_ASSET checksum mismatch" >&2
    echo "       expected $LLAMA_SHA256" >&2
    echo "       got      $ACTUAL_SHA256" >&2
    exit 1
  fi

  # llama-server links its dylibs with an @loader_path rpath, so the whole
  # extracted directory has to ship together, not just the binary.
  rm -rf "$BIN_DIR"
  mkdir -p "$BIN_DIR"
  tar -xzf "$TMP_TAR" -C "$TMP_DIR"
  EXTRACTED_DIR="$TMP_DIR/llama-$LLAMA_TAG"
  cp -R "$EXTRACTED_DIR/." "$BIN_DIR/"
  echo "    verified and installed: $SERVER_BIN"
fi

echo "==> smollm2-1.7b-instruct-q4_k_m.gguf"
mkdir -p "$MODEL_DIR"
if [ -f "$MODEL_PATH" ] && [ "$(sha256 "$MODEL_PATH")" = "$MODEL_SHA256" ]; then
  echo "    already present and verified, skipping fetch"
else
  rm -f "$MODEL_PATH"
  echo "    fetching from pinned revision $MODEL_REVISION (1.0 GiB)"
  curl -fL --http1.1 --retry 3 --retry-delay 2 --progress-bar -o "$MODEL_PATH" "$MODEL_URL"
  ACTUAL_SHA256="$(sha256 "$MODEL_PATH")"
  if [ "$ACTUAL_SHA256" != "$MODEL_SHA256" ]; then
    rm -f "$MODEL_PATH"
    echo "error: smollm2-1.7b-instruct-q4_k_m.gguf checksum mismatch" >&2
    echo "       expected $MODEL_SHA256" >&2
    echo "       got      $ACTUAL_SHA256" >&2
    exit 1
  fi
  echo "    verified: $MODEL_PATH"
fi

echo "==> done"
echo "    llama-server: $SERVER_BIN"
echo "    model:        $MODEL_PATH"
