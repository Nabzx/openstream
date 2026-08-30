#!/usr/bin/env bash
#
# Rasterises the rebrand surfaces outside the app - the DMG installer
# background, the GitHub social-preview card, the README banner - from
# assets/branding/*.svg.
#
# Needs rsvg-convert (brew install librsvg) and JetBrains Mono on the system
# (put JetBrainsMono-Regular.ttf / JetBrainsMono-Bold.ttf in ~/Library/Fonts).
# Not part of any build - run it by hand when the artwork changes, then
# commit the PNGs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v rsvg-convert >/dev/null || { echo "need rsvg-convert (brew install librsvg)" >&2; exit 1; }
fc-match "JetBrains Mono" | grep -qi "jetbrains mono" || echo "warning: JetBrains Mono not found by fontconfig - text will fall back" >&2

src=assets/branding

# DMG background: 640x384 window, plus a @2x for retina.
rsvg-convert -w 640  -h 384  "$src/dmg-background.svg" -o assets/dmg-background.png
rsvg-convert -w 1280 -h 768  "$src/dmg-background.svg" -o assets/dmg-background@2x.png
echo "==> assets/dmg-background.png (+@2x)"

# GitHub repo social preview: 1280x640, uploaded by hand in repo Settings.
rsvg-convert -w 1280 -h 640 "$src/social-preview.svg" -o assets/social-preview.png
echo "==> assets/social-preview.png"

# README banner: 1280x360.
rsvg-convert -w 1280 -h 360 "$src/readme-banner.svg" -o assets/readme-banner.png
echo "==> assets/readme-banner.png"
