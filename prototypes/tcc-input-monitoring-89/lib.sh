#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #89. Shared build helpers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$ROOT/build"
APP="$BUILD/TCCProbe.app"
HELPER_DIR="$APP/Contents/Resources/helpers"
LOGS="$ROOT/logs"
BUNDLE_ID="${BUNDLE_ID:-dev.openstream.prototype.tccim89}"

mkdir -p "$BUILD" "$LOGS"

compile_helper() {
  local name="$1" tag="$2"
  local tmp
  tmp="$(mktemp -d)"
  cp "$ROOT/helpers/identity.swift" "$tmp/identity.swift"
  sed "s/BUILD_TAG_PLACEHOLDER/$tag/" "$ROOT/helpers/$name.swift" > "$tmp/main.swift"
  mkdir -p "$HELPER_DIR"
  swiftc -O -o "$HELPER_DIR/$name" "$tmp/identity.swift" "$tmp/main.swift"
  rm -rf "$tmp"
  codesign --force --sign - --timestamp=none "$HELPER_DIR/$name"
}

sign_app() {
  codesign --force --deep --sign - --timestamp=none "$APP"
}

cdhash_of() {
  codesign -dvvv "$1" 2>&1 | awk -F'=' '/^CDHash=/{print $2}'
}

ident_of() {
  codesign -dvvv "$1" 2>&1 | awk -F'=' '/^Identifier=/{print $2}'
}

record() {
  local label="$1"
  {
    echo "=== $label  ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
    printf '%-28s %-46s %s\n' "TARGET" "CDHASH" "SIGNING IDENTIFIER"
    printf '%-28s %-46s %s\n' "TCCProbe.app" "$(cdhash_of "$APP")" "$(ident_of "$APP")"
    for helper in axhelper hotkeyhelper; do
      [ -f "$HELPER_DIR/$helper" ] || continue
      printf '%-28s %-46s %s\n' "$helper" "$(cdhash_of "$HELPER_DIR/$helper")" "$(ident_of "$HELPER_DIR/$helper")"
    done
    echo
  } | tee -a "$LOGS/state.log"
}
