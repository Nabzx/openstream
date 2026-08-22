#!/usr/bin/env bash
#
# Compiles whisper.cpp from source at a pinned tag and fetches ggml-base.en.bin
# from a pinned Hugging Face revision, SHA-256 verified. See issue #8.
#
# Upstream publishes no macOS arm64 CLI binary, so compiling is the only path
# (#26 also rules out the xcframework - it would need a native Node add-on).
# The model is fetched here, at build time: there is no first-run download
# and no in-app progress UI (#30).
#
# Safe to re-run: skips the clone if vendor/whisper.cpp is already at the
# pinned commit, skips the model fetch if it's already present and correct.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WHISPER_TAG="v1.9.3"
WHISPER_COMMIT="371b5a7561823ab2bb32142d2751e35e7534727b"
WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"
WHISPER_SRC="$ROOT/vendor/whisper.cpp"

MODEL_REVISION="5359861c739e955e79d9a303bcbc70fb988958b1"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/$MODEL_REVISION/ggml-base.en.bin"
MODEL_SHA256="a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002"
MODEL_DIR="$ROOT/resources/models"
MODEL_PATH="$MODEL_DIR/ggml-base.en.bin"

BIN_DIR="$ROOT/resources/bin"
SERVER_BIN="$BIN_DIR/whisper-server"

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

echo "==> whisper.cpp source ($WHISPER_TAG)"
if [ -d "$WHISPER_SRC" ] && [ "$(git -C "$WHISPER_SRC" rev-parse HEAD 2>/dev/null)" = "$WHISPER_COMMIT" ]; then
  echo "    already at $WHISPER_COMMIT, skipping clone"
else
  rm -rf "$WHISPER_SRC"
  mkdir -p "$(dirname "$WHISPER_SRC")"
  git clone --branch "$WHISPER_TAG" --depth 1 "$WHISPER_REPO" "$WHISPER_SRC"
  ACTUAL_COMMIT="$(git -C "$WHISPER_SRC" rev-parse HEAD)"
  if [ "$ACTUAL_COMMIT" != "$WHISPER_COMMIT" ]; then
    echo "error: $WHISPER_TAG resolved to $ACTUAL_COMMIT, expected $WHISPER_COMMIT" >&2
    echo "       the tag has moved since this script was pinned - stopping rather than building an unverified checkout." >&2
    exit 1
  fi
fi

echo "==> compiling whisper-server (Metal, Release)"
# WHISPER_BUILD_EXAMPLES must stay ON: examples/server is only added to the
# build when it's set, whisper.cpp's WHISPER_BUILD_SERVER option doesn't
# gate it. --target below still limits what actually gets compiled.
cmake -S "$WHISPER_SRC" -B "$WHISPER_SRC/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_METAL=ON \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DWHISPER_BUILD_TESTS=OFF
cmake --build "$WHISPER_SRC/build" -j --config Release --target whisper-server

mkdir -p "$BIN_DIR"
cp "$WHISPER_SRC/build/bin/whisper-server" "$SERVER_BIN"
echo "    built: $SERVER_BIN"

echo "==> ggml-base.en.bin"
mkdir -p "$MODEL_DIR"
if [ -f "$MODEL_PATH" ] && [ "$(sha256 "$MODEL_PATH")" = "$MODEL_SHA256" ]; then
  echo "    already present and verified, skipping fetch"
else
  rm -f "$MODEL_PATH"
  echo "    fetching from pinned revision $MODEL_REVISION (141 MiB)"
  curl -fL --progress-bar -o "$MODEL_PATH" "$MODEL_URL"
  ACTUAL_SHA256="$(sha256 "$MODEL_PATH")"
  if [ "$ACTUAL_SHA256" != "$MODEL_SHA256" ]; then
    rm -f "$MODEL_PATH"
    echo "error: ggml-base.en.bin checksum mismatch" >&2
    echo "       expected $MODEL_SHA256" >&2
    echo "       got      $ACTUAL_SHA256" >&2
    exit 1
  fi
  echo "    verified: $MODEL_PATH"
fi

echo "==> done"
echo "    whisper-server: $SERVER_BIN"
echo "    model:          $MODEL_PATH"
