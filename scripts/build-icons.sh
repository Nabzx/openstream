#!/usr/bin/env bash
#
# Regenerates the app icon (assets/icon.icns) and the menu-bar icons
# (electron/icons/*.png) from assets/icon.svg and the inline glyph below.
#
# Needs rsvg-convert (brew install librsvg) and iconutil (Xcode CLT).
# Not part of any build - run it by hand when the mark changes, then
# commit the PNGs and .icns.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v rsvg-convert >/dev/null || { echo "need rsvg-convert (brew install librsvg)" >&2; exit 1; }
command -v iconutil >/dev/null || { echo "need iconutil (Xcode Command Line Tools)" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# --- app icon: assets/icon.icns -------------------------------------------
iconset="$work/icon.iconset"
mkdir -p "$iconset"
for pair in "16 16x16" "32 16x16@2x" "32 32x32" "64 32x32@2x" \
            "128 128x128" "256 128x128@2x" "256 256x256" "512 256x256@2x" \
            "512 512x512" "1024 512x512@2x"; do
  set -- $pair
  rsvg-convert -w "$1" -h "$1" assets/icon.svg -o "$iconset/icon_$2.png"
done
iconutil -c icns "$iconset" -o assets/icon.icns
echo "==> assets/icon.icns"

# --- menu-bar icons: the glyph, one colour per state ---------------------
# idle stays a macOS *template* glyph (black; the OS tints it to the menu-bar
# theme). recording and transcribing are non-template, coloured to match
# docs/design/visual-identity.md: primary blue while listening, aqua while
# it places the text.
glyph() {
  cat <<SVG
<svg width="44" height="44" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="$1" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="7.6"/>
    <path d="M8.7 13.4 12 10.1 15.3 13.4"/>
  </g>
</svg>
SVG
}

emit() { # name colour
  glyph "$2" > "$work/$1.svg"
  rsvg-convert -w 22 -h 22 "$work/$1.svg" -o "electron/icons/$1.png"
  rsvg-convert -w 44 -h 44 "$work/$1.svg" -o "electron/icons/$1@2x.png"
  echo "==> electron/icons/$1.png (+@2x)"
}

emit iconTemplate "#000000"
emit icon-recording "#5CB8FF"
emit icon-transcribing "#4FE0D4"
