# Visual identity: blue glass

*Direction for the app, the overlay, the icons, and the landing page.*

## History

This identity has moved twice. Phase 4's window pass (#242) gave the app a macOS-native look. The launch rebrand (#276, #278–#282) then committed to **terminal / phosphor** — Space Mono, phosphor green on near-black, hard edges, a scanline. Days later (#300, August 2026) the direction changed again to **blue glass**: the terminal structure stays, but the green rotates to blue, the geometry softens, the font changes, and the push-to-talk overlay becomes a real macOS glass panel. This doc describes the blue-glass identity as shipped; the earlier passes are in the git history.

## The direction in one line

OpenStream is a dictation tool whose whole thesis is that **a spoken line break should never submit your command**. The identity is calm, precise, and a little bit luminous: white text, blue and aqua accents that glow, soft-cornered panels, and glass — both the app window and the push-to-talk bar sit on a native macOS vibrancy material, so the desktop tints through translucent panels. The landing page is its own thing (see per-surface).

## Why navy + blue-glow needs care

This palette sits right next to a look that reads as generated: *the cyberpunk dashboard* — navy background, bright cyan accent, glow on everything, a grid or scanline. It's the same trap the phosphor green fell into (near-black + a lone acid pop). Blue glass avoids it the same way: by being a coherent, restrained world rather than a dark theme with a loud accent.

- **Glow is a highlight, not a coat of paint.** It belongs on the live state (the mark, the listening text), the primary action, and headings — not on every border and every label. If everything glows, nothing reads.
- **Glass is a material, not a filter.** Both the window and the overlay use native `vibrancy`; panels are translucent so the desktop reads through, but every panel keeps a `backdrop-filter` and enough tint that text sits on frost, never on bare wallpaper. Text carries a hairline shadow for the bright-wallpaper case. Reduce Transparency falls back to a solid navy.
- **Hierarchy is shades of blue-grey**, not blue-vs-grey. `--fg` is a warm off-white; `--muted` and `--faint` step down through blue-greys; the two accents (`--acc`, `--acc-2`) are the only saturated colour.
- **Soft, not round.** `10px` radius, `7px` on small controls, pill on toggles and tags. Not pronounced, not pill-shaped buttons.
- **Terse, man-page copy.** `SYNOPSIS / SAFETY / INSTALL`. No marketing throat-clearing. The `> ` prompt prefix and `──` rule marks survive as quiet nods to where this tool lives.

### Anti-references — do not do these

Animated grid / "tron" lines · a full glow on every element · gradient-mesh backgrounds · pure `#00BFFF` cyan (too electric) · glassmorphism on the window itself · pronounced `border-radius: 16px+` everywhere · a second bright hue competing with the blue.

## Tokens

### Colour

The app window runs on `vibrancy: "under-window"`, so its surfaces are `rgba` over the material, not solid.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#14335F` | solid navy — the Reduce-Transparency fallback; `body` is a translucent wash over the vibrancy |
| `--screen` | `rgba(30,62,112,0.5)` | panels, cards |
| `--screen-2` | `rgba(20,45,85,0.55)` | keycaps, fields, icon tiles, insets |
| `--acc` | `#7FCBFF` | primary: headings' glow, prompts, the live state, primary button |
| `--acc-2` | `#52E6D6` | secondary: "starting" / pending state, small tags, the DMG arrow |
| `--err` | `#FF6B54` | genuine errors only: a missing permission, a dead server. Never decoration. |
| `--fg` | `#EAF2FF` | body text |
| `--fg-hi` | `#FFFFFF` | headings, active labels |
| `--muted` | `#AEC5E2` | captions, secondary text, disabled |
| `--faint` | `#7C97BE` | rule marks, prompt glyphs, empty-state text |
| `--line` | `rgba(150,195,245,0.16)` | hairlines between rows |
| `--line-hi` | `rgba(165,205,250,0.34)` | visible borders |
| `--glow` | `rgba(127,203,255,0.45)` | box-shadow / text-shadow bloom on the accent |
| `--shadow-text` | `0 1px 3px rgba(0,0,0,0.35)` | on every text run — legibility over a bright wallpaper |

Cards and panels also carry `backdrop-filter: blur(20px) saturate(1.4)`. The **overlay** uses a lighter set again (whiter text, a brighter rim) — see its section. The **landing page** has its own palette entirely and is not glass.

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

The **mark** is a stream through a listening ring, a play on the name, recoloured to `--acc` blue with a `--glow` bloom. The app icon carries the full two-line stream; the Home hero and the menu-bar icon, which render at ~18px, carry a single wave, since two lines tangle into a blob that small. `src/components/Mark.tsx`, `assets/icon.svg` and `scripts/build-icons.sh` hold the three, kept in step.

## Per-surface

### 1. App window — `src/index.css` + `electron/main.js` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300), glass in [#301](https://github.com/Nabzx/openstream/issues/301))

`createWindow` runs on `vibrancy: "under-window"` + `visualEffectState: "active"` + `backgroundColor: "#14335F"` (the Reduce-Transparency fallback). `index.css` keeps `body` a translucent wash and every card/panel `rgba` + `backdrop-filter` so the desktop tints through frost. White-on-blue with blue/aqua accents and glow; `--r` / `--r-sm` radius across cards, buttons, fields, keycaps, the mark; pills, the toggle and tags full-round; the navtab active tab is a tinted rounded pill (brackets dropped). Every text run gets `--shadow-text`. The scanline is gone. Every class name kept — no `.tsx` churn. The macOS chrome (traffic lights, hidden-inset title bar) stays.

### 2. Push-to-talk overlay — `electron/overlay/` + `electron/main.js` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300) / [#301](https://github.com/Nabzx/openstream/issues/301))

The overlay window gets its vibrancy back: `vibrancy: "hud"`, `visualEffectState: "active"` (it's only ever shown `showInactive()`), `roundedCorners: true`, `hasShadow: true` — reverting the #295 hard edge. `overlay.css` paints the glass on top: a translucent blue wash (`rgba(120,180,255,0.18)` → `rgba(30,60,110,0.16)`), `backdrop-filter: blur(14px) saturate(1.7) brightness(1.08)`, a bright rim light, an inner glow, `13px` radius to match the rounded window. Status text and the waveform are white with a strong glow + shadow so they read over any wallpaper. Reduce-Transparency and bright-wallpaper users fall back to the wash, which is already fairly opaque. This is the **"level 2 / glass"** point on the frost→clear range, not the more opaque frosted look and not fully clear.

**Not shipped: true Liquid Glass.** The macOS 26 material (`NSGlassEffectView`) is not exposed to Electron. A native Swift overlay ([#301](https://github.com/Nabzx/openstream/issues/301), post-launch) is the only way to get it, and carries real upside (drops a Chromium view, sharper waveform) — but it's a 1–2 week project with a `NSVisualEffectView` fallback for macOS 13–25.

### 3. App icon + menu-bar icons — `assets/icon.svg`, `electron/icons/` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300))

Navy tile with a soft radial, the stream-in-ring mark in `--acc` with a Gaussian glow (two-line stream on the tile, single wave in the menu bar). Menu bar: idle stays a black macOS *template* glyph; recording is `#5CB8FF`, transcribing `#4FE0D4`. Regenerate via `scripts/build-icons.sh`.

### 4. Launch surfaces — DMG background, social image, README banner — **done** ([#300](https://github.com/Nabzx/openstream/issues/300))

Sources in `assets/branding/*.svg`, rasterised by `scripts/build-branding.sh` (rsvg-convert + JetBrains Mono). Navy gradient grounds, blue wordmark and mark. The social preview PNG is uploaded by hand in repo Settings.

### 5. Landing page — `site/index.html` — **done**

Near-black ground (`#05070C`), a lighter blue accent (`#7EC8FF`), a faint top glow, JetBrains Mono from Google Fonts. Structure: a 100vh hero with the looping demo terminal, then `why` (the 40-vs-150 wpm bars), `what` (two short British-English sentences covering local + the line-break rule), `install`, `status`. Rule-headed sections, the fixed tmux status bar, the "beta release" markers. The `safety` and `local` sections and the footer link row were cut to keep it terse.

### 6. Tray menu / notification wording

Can't theme the OS chrome. Copy matches the voice: tray tooltip `openstream — idle` / `openstream — listening`, menu items lowercase.

## Decisions

- **Reference direction**: *(Aug 30 2026)* blue glass — calm, luminous, soft-cornered. Supersedes the terminal / phosphor direction settled two weeks earlier, which itself superseded the macOS-native look. Each pivot was the maintainer's call, made against prototypes.
- **Colour**: `#7FCBFF` primary blue + `#52E6D6` aqua secondary, white text, navy `#14335F` fallback ground. One red `#FF6B54` for genuine errors. No second bright hue. **Dark-only** — no light variant.
- **Glass window** *(#301, pre-launch)*: the app window runs on `vibrancy: "under-window"`, panels translucent, text shadowed, solid-navy fallback. The overlay is the same idea at a lighter setting. True Liquid Glass (`NSGlassEffectView`, macOS 26) is still a native rewrite and still out of scope.
- **Font**: JetBrains Mono, bundled locally for the app and overlay (one variable woff2), Google Fonts on the landing page. No separate display face.
- **Geometry**: `10px` / `7px` / pill radius. Soft, not round.
- **Overlay**: native `vibrancy: "hud"` + rounded + shadow; CSS glass on top at the "level 2" translucency point. True Liquid Glass is a post-launch native rewrite ([#301](https://github.com/Nabzx/openstream/issues/301)), not blocking v1.0.
- **Name**: stays *OpenStream*. A rename ([#299](https://github.com/Nabzx/openstream/issues/299)) is parked — not coupled to this and not for v1.0.
- **App window**: keep the macOS structure (traffic lights, hidden-inset title bar). No custom chrome. Keep every layout, flow, and the Permissions gate — swap the skin only.
- **Scope**: this pivot is a pre-launch pass — token recolour, geometry, font, overlay glass, icons, brand art, landing. It does not move layout or behaviour, so [#228](https://github.com/Nabzx/openstream/issues/228)'s functional checks are unaffected; the overlay `vibrancy` change gets one manual-verification line.
