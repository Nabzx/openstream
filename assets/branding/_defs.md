# assets/branding/

SVG sources for the rebrand surfaces outside the app: the DMG installer
window background, the GitHub social-preview card, and the README banner.
Rasterised by `scripts/build-branding.sh` (needs `rsvg-convert` and Space
Mono on the system - `brew install librsvg`, and put SpaceMono-*.ttf in
`~/Library/Fonts`). Palette matches `docs/design/visual-identity.md`.

Outputs, committed alongside these sources:

| Source | Output | Size | Where it is used |
|---|---|---|---|
| `dmg-background.svg` | `../dmg-background.png` (+`@2x`) | 640x384 | electron-builder `dmg.background` |
| `social-preview.svg` | `../social-preview.png` | 1280x640 | repo Settings > Social preview (uploaded by hand) |
| `readme-banner.svg` | `../readme-banner.png` | 1280x360 | top of `README.md` |
