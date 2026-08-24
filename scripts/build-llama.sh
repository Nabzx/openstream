#!/usr/bin/env bash
#
# Compiles llama.cpp from source at a pinned tag and fetches a
# SmolLM2-1.7B-Instruct GGUF from a pinned Hugging Face revision, SHA-256
# verified. See issue #14, hardened by #92.
#
# Replaces downloading upstream's prebuilt macOS arm64 release: #90's settled
# spec wants both model servers compiled from pinned source, the same
# provenance guarantee build-whisper.sh already has, without adding a
# package-manager dependency.
#
# There is no LLM in the dictation path (#24) - this is plumbing only, for
# the voice-driven editing feature in #17, which is not built yet.
#
# Safe to re-run: skips the clone if vendor/llama.cpp is already at the
# pinned commit, skips the model fetch if it's already present and correct.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/lib/artifact.sh"

LLAMA_TAG="b10595"
LLAMA_COMMIT="e8eed4525aaca00a78d8f837dce90dd4d4708133"
LLAMA_REPO="https://github.com/ggml-org/llama.cpp.git"
LLAMA_SRC="$ROOT/vendor/llama.cpp"

# HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF - Apache 2.0, ungated (#32 rules
# out anything gated or non-permissive).
MODEL_REVISION="2d4a76a30b4af41ecd395c35725ac11688d4cfe4"
MODEL_URL="https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/$MODEL_REVISION/smollm2-1.7b-instruct-q4_k_m.gguf"
MODEL_SHA256="decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33"
MODEL_DIR="$ROOT/resources/models"
MODEL_PATH="$MODEL_DIR/smollm2-1.7b-instruct-q4_k_m.gguf"

BIN_DIR="$ROOT/resources/bin/llama"
SERVER_BIN="$BIN_DIR/llama-server"

echo "==> llama.cpp source ($LLAMA_TAG)"
clone_pinned "$LLAMA_REPO" "$LLAMA_TAG" "$LLAMA_COMMIT" "$LLAMA_SRC" "llama.cpp"

echo "==> compiling llama-server (Metal, Release)"
# LLAMA_BUILD_UI=OFF: the server's web UI defaults to fetching a prebuilt
# bundle from a HuggingFace bucket at configure time (LLAMA_USE_PREBUILT_UI).
# We only ever talk to the server's HTTP API, never open the UI, and that
# fetch is unpinned and unverified - turning it off keeps every artifact in
# this build going through fetch_verified/clone_pinned instead.
cmake -S "$LLAMA_SRC" -B "$LLAMA_SRC/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_METAL=ON \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_TOOLS=ON \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_OPENSSL=OFF
cmake --build "$LLAMA_SRC/build" -j --config Release --target llama-server

# LLAMA_OPENSSL=OFF matters beyond not needing HTTPS to talk to our own
# localhost-only server: left on, llama-server links Homebrew's openssl@3 by
# absolute path (/opt/homebrew/opt/openssl@3/...), which would only exist on
# a Mac with that exact Homebrew package installed - not a user's machine.
if otool -L "$LLAMA_SRC/build/bin/llama-server" | grep -q '/opt/homebrew'; then
  echo "error: llama-server links an absolute Homebrew path - would not run on another Mac" >&2
  otool -L "$LLAMA_SRC/build/bin/llama-server" | grep '/opt/homebrew' >&2
  exit 1
fi

# Start clean: resources/bin/llama/ used to hold upstream's whole release
# tarball (every CLI tool, not just the server). A scoped --target build
# only produces what llama-server actually needs, so wipe first rather than
# accumulate stale files a rebuild would never remove on its own.
rm -rf "$BIN_DIR"
mkdir -p "$BIN_DIR"
cp "$LLAMA_SRC/build/bin/llama-server" "$SERVER_BIN"
# A Release build here links ggml/llama as shared libraries alongside the
# binary (unlike whisper-server, which ends up fully static) - copy
# whatever .dylib the linker actually produced rather than hardcoding names
# that could drift with the pinned commit.
find "$LLAMA_SRC/build/bin" -maxdepth 1 -name '*.dylib' -exec cp -P {} "$BIN_DIR/" \;
echo "    built: $SERVER_BIN"

echo "==> smollm2-1.7b-instruct-q4_k_m.gguf (from pinned revision $MODEL_REVISION, 1.0 GiB)"
fetch_verified "$MODEL_URL" "$MODEL_PATH" "$MODEL_SHA256" "smollm2-1.7b-instruct-q4_k_m.gguf"

echo "==> done"
echo "    llama-server: $SERVER_BIN"
echo "    model:        $MODEL_PATH"
