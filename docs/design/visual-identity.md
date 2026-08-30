# Visual identity: blue glass

*Direction for the app, the overlay, the icons, and the landing page.*

## History

This identity has moved twice. Phase 4's window pass (#242) gave the app a macOS-native look. The launch rebrand (#276, #278–#282) then committed to **terminal / phosphor** — Space Mono, phosphor green on near-black, hard edges, a scanline. Days later (#300, August 2026) the direction changed again to **blue glass**: the terminal structure stays, but the green rotates to blue, the geometry softens, the font changes, and the push-to-talk overlay becomes a real macOS glass panel. This doc describes the blue-glass identity as shipped; the earlier passes are in the git history.

## The direction in one line

OpenStream is a dictation tool whose whole thesis is that **a spoken line break should never submit your command**. The identity is calm, precise, and a little bit luminous: white text on a deep navy ground, blue and aqua accents that glow, soft-cornered panels, and one genuinely translucent surface — the push-to-talk bar.

## Why navy + blue-glow needs care

This palette sits right next to a look that reads as generated: *the cyberpunk dashboard* — navy background, bright cyan accent, glow on everything, a grid or scanline. It's the same trap the phosphor green fell into (near-black + a lone acid pop). Blue glass avoids it the same way: by being a coherent, restrained world rather than a dark theme with a loud accent.

- **Glow is a highlight, not a coat of paint.** It belongs on the live state (the mark, the listening text), the primary action, and headings — not on every border and every label. If everything glows, nothing reads.
- **One translucent surface.** The overlay is glass because it floats over the desktop and wants to feel light. The window is opaque navy. Do not glass the window.
- **Hierarchy is shades of blue-grey**, not blue-vs-grey. `--fg` is a warm off-white; `--muted` and `--faint` step down through blue-greys; the two accents (`--acc`, `--acc-2`) are the only saturated colour.
- **Soft, not round.** `10px` radius, `7px` on small controls, pill on toggles and tags. Not pronounced, not pill-shaped buttons.
- **Terse, man-page copy.** `SYNOPSIS / SAFETY / INSTALL`. No marketing throat-clearing. The `> ` prompt prefix and `──` rule marks survive as quiet nods to where this tool lives.

### Anti-references — do not do these

Animated grid / "tron" lines · a full glow on every element · gradient-mesh backgrounds · pure `#00BFFF` cyan (too electric) · glassmorphism on the window itself · pronounced `border-radius: 16px+` everywhere · a second bright hue competing with the blue.

## Tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0B1D3A` | navy ground; the window paints a soft top glow over it (`--bg-hi` `#163A6B` → `--bg` → `#0A1730`) |
| `--screen` | `#12294A` | panels, cards, fields (the app renders cards as a faint gradient over this) |
| `--screen-2` | `#17335A` | keycaps, icon tiles, insets |
| `--acc` | `#5CB8FF` | primary: headings' glow, prompts, the live state, primary button |
| `--acc-2` | `#4FE0D4` | secondary: "starting" / pending state, small tags, the DMG arrow |
| `--err` | `#F0503C` | genuine errors only: a missing permission, a dead server. Never decoration. |
| `--fg` | `#DCE8FA` | body text — warm off-white |
| `--fg-hi` | `#FFFFFF` | headings, active labels |
| `--muted` | `#8AA3C4` | captions, secondary text, disabled |
| `--faint` | `#5B76A0` | rule marks, prompt glyphs, empty-state text |
| `--line` | `#1E3A5F` | hairlines between rows |
| `--line-hi` | `#2E4E7A` | visible borders |
| `--glow` | `rgba(92, 184, 255, 0.40)` | box-shadow / text-shadow bloom on the accent |

**Overlay tokens differ** — the glass panel works against a native vibrancy material, so its surface is `rgba` and its text is white with a strong shadow for legibility over any wallpaper. See the overlay section.

### Type

- **[JetBrains Mono](https://www.jetbrains.com/lp/mono/)**, everywhere — rounder letterforms than Space Mono and far easier on paragraphs, which is why the switch happened. Ligatures off.
- Bundled, not fetched: the app and overlay carry one variable `jetbrains-mono.woff2` (latin subset, ~56 KB) locally so an offline first run still renders; the landing page pulls it from Google Fonts. Fallback: `ui-monospace, "SF Mono", Menlo, monospace`.
- No separate display face — the wordmark is JetBrains Mono bold, larger.
- Scale: `13px` base in the app, `15–16px` on the landing page, `line-height` ~`1.65`. Headings step up modestly.
- Uppercase labels get `letter-spacing: 0.05–0.13em`.

### Geometry & motion

- `--r: 10px` (cards, panels, the mark), `--r-sm: 7px` (buttons, fields, keycaps, tabs), `999px` (pills, the toggle, tags).
- Borders `1px solid var(--line-hi)`. `──` box-drawing marks on card labels and the held-result heading.
- Shadows: a soft downward drop on cards (`0 8px 24px -14px rgba(0,0,0,0.55)`) plus a hairline inner top highlight. Glow shadows on the accent elements only.
- **Motion budget: one orchestrated moment per surface.** The landing hero gets its boot-and-demo sequence. In the app: the blinking block cursor, the mark's pulse while recording, the waveform. The scanline does not move and is dialled almost to nothing. Respect `prefers-reduced-motion`.

### The wordmark

`~ openstream` lowercase in JetBrains Mono, shell-prompt prefix and a blinking block cursor:

```
~ openstream █
```

The caret-in-a-ring **mark** is the glyph (icon, tray, the app's Home hero), recoloured to `--acc` blue with a `--glow` bloom.

## Per-surface

### 1. App window — `src/index.css` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300))

The token ramp recoloured to white-on-navy with blue/aqua accents and glow; `--r` / `--r-sm` radius added across cards, buttons, fields, keycaps, the mark; pills, the toggle and tags go full-round. Cards get a faint gradient fill and a soft drop shadow. The navtab bracket glyphs give way to a tinted rounded pill on the active tab. The scanline is dialled to `rgba(0,0,0,0.05)`. Every class name kept — no `.tsx` churn. The macOS window structure (traffic lights, hidden-inset title bar) stays.

### 2. Push-to-talk overlay — `electron/overlay/` + `electron/main.js` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300) / [#301](https://github.com/Nabzx/openstream/issues/301))

The overlay window gets its vibrancy back: `vibrancy: "hud"`, `visualEffectState: "active"` (it's only ever shown `showInactive()`), `roundedCorners: true`, `hasShadow: true` — reverting the #295 hard edge. `overlay.css` paints the glass on top: a translucent blue wash (`rgba(120,180,255,0.18)` → `rgba(30,60,110,0.16)`), `backdrop-filter: blur(14px) saturate(1.7) brightness(1.08)`, a bright rim light, an inner glow, `13px` radius to match the rounded window. Status text and the waveform are white with a strong glow + shadow so they read over any wallpaper. Reduce-Transparency and bright-wallpaper users fall back to the wash, which is already fairly opaque. This is the **"level 2 / glass"** point on the frost→clear range, not the more opaque frosted look and not fully clear.

**Not shipped: true Liquid Glass.** The macOS 26 material (`NSGlassEffectView`) is not exposed to Electron. A native Swift overlay ([#301](https://github.com/Nabzx/openstream/issues/301), post-launch) is the only way to get it, and carries real upside (drops a Chromium view, sharper waveform) — but it's a 1–2 week project with a `NSVisualEffectView` fallback for macOS 13–25.

### 3. App icon + menu-bar icons — `assets/icon.svg`, `electron/icons/` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300))

Navy tile with a soft radial, the caret-in-ring mark in `--acc` with a Gaussian glow. Menu bar: idle stays a black macOS *template* glyph; recording is `#5CB8FF`, transcribing `#4FE0D4`. Regenerate via `scripts/build-icons.sh`.

### 4. Launch surfaces — DMG background, social image, README banner — **done** ([#300](https://github.com/Nabzx/openstream/issues/300))

Sources in `assets/branding/*.svg`, rasterised by `scripts/build-branding.sh` (rsvg-convert + JetBrains Mono). Navy gradient grounds, blue wordmark and mark. The social preview PNG is uploaded by hand in repo Settings.

### 5. Landing page — `site/index.html` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300))

`:root` recoloured to the blue ramp with a fixed top-glow gradient; the scanline dialled down; JetBrains Mono from Google Fonts. Structure (100vh hero, the looping demo terminal, the rule-headed sections, the tmux status bar, the "beta release" markers) is unchanged from #278.

### 6. Tray menu / notification wording

Can't theme the OS chrome. Copy matches the voice: tray tooltip `openstream — idle` / `openstream — listening`, menu items lowercase.

## Decisions

- **Reference direction**: *(Aug 30 2026)* blue glass — calm, luminous, soft-cornered. Supersedes the terminal / phosphor direction settled two weeks earlier, which itself superseded the macOS-native look. Each pivot was the maintainer's call, made against prototypes.
- **Colour**: `#5CB8FF` primary blue + `#4FE0D4` aqua secondary on a `#0B1D3A` navy ground, white text. One ANSI red `#F0503C` for genuine errors. No second bright hue. **Dark-only** — no light variant.
- **Font**: JetBrains Mono, bundled locally for the app and overlay (one variable woff2), Google Fonts on the landing page. No separate display face.
- **Geometry**: `10px` / `7px` / pill radius. Soft, not round.
- **Overlay**: native `vibrancy: "hud"` + rounded + shadow; CSS glass on top at the "level 2" translucency point. True Liquid Glass is a post-launch native rewrite ([#301](https://github.com/Nabzx/openstream/issues/301)), not blocking v1.0.
- **Name**: stays *OpenStream*. A rename ([#299](https://github.com/Nabzx/openstream/issues/299)) is parked — not coupled to this and not for v1.0.
- **App window**: keep the macOS structure (traffic lights, hidden-inset title bar). No custom chrome. Keep every layout, flow, and the Permissions gate — swap the skin only.
- **Scope**: this pivot is a pre-launch pass — token recolour, geometry, font, overlay glass, icons, brand art, landing. It does not move layout or behaviour, so [#228](https://github.com/Nabzx/openstream/issues/228)'s functional checks are unaffected; the overlay `vibrancy` change gets one manual-verification line.
