#!/usr/bin/env bash
# PROTOTYPE - throwaway spike for issue #46. Shared build/record helpers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$ROOT/build"
APP="$BUILD/TCCProbe.app"
HELPER_DIR="$APP/Contents/Resources/helpers"
LOGS="$ROOT/logs"
BUNDLE_ID="dev.openstream.prototype.tccprobe"

mkdir -p "$BUILD" "$LOGS"

# Compile one helper. Swift only allows top-level statements in main.swift, so
# the entry source is copied under that name into a scratch dir.
#   compile_helper <name> <build-tag>
compile_helper() {
  local name="$1" tag="$2"
  local tmp; tmp="$(mktemp -d)"
  cp "$ROOT/helpers/identity.swift" "$tmp/identity.swift"
  sed "s/BUILD_TAG_PLACEHOLDER/$tag/" "$ROOT/helpers/$name.swift" > "$tmp/main.swift"
  mkdir -p "$HELPER_DIR"
  swiftc -O -o "$HELPER_DIR/$name" "$tmp/identity.swift" "$tmp/main.swift"
  rm -rf "$tmp"
  # Ad-hoc sign the helper on its own. This is the identity the question is
  # about: if TCC keys entries per-helper, this CDHash is the key.
  codesign --force --sign - --timestamp=none "$HELPER_DIR/$name"
}

# Ad-hoc sign the Electron bundle. Inner code first, outer bundle last, which is
# what --deep does; the helpers are re-signed by it but ad-hoc signing is
# deterministic over identical content, so their CDHash must not move. record()
# checks that rather than assuming it.
sign_app() {
  codesign --force --deep --sign - --timestamp=none "$APP"
}

cdhash_of() {
  codesign -dvvv "$1" 2>&1 | awk -F'=' '/^CDHash=/{print $2}'
}

ident_of() {
  codesign -dvvv "$1" 2>&1 | awk -F'=' '/^Identifier=/{print $2}'
}

# Append one full snapshot of every code identity to logs/state.log and echo it.
#   record <label>
record() {
  local label="$1"
  local out="$LOGS/state.log"
  {
    echo "=== $label  ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
    printf '%-28s %-46s %s\n' "TARGET" "CDHASH" "SIGNING IDENTIFIER"
    printf '%-28s %-46s %s\n' "TCCProbe.app" "$(cdhash_of "$APP")" "$(ident_of "$APP")"
    for h in axhelper hotkeyhelper; do
      [ -f "$HELPER_DIR/$h" ] || continue
      printf '%-28s %-46s %s\n' "$h" "$(cdhash_of "$HELPER_DIR/$h")" "$(ident_of "$HELPER_DIR/$h")"
    done
    echo
  } | tee -a "$out"
}
