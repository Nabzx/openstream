# Visual identity: blue glass

*Direction for the app, the overlay, the icons, and the landing page.*

## History

This identity has moved twice. Phase 4's window pass (#242) gave the app a macOS-native look. The launch rebrand (#276, #278–#282) then committed to **terminal / phosphor** — Space Mono, phosphor green on near-black, hard edges, a scanline. Days later (#300, August 2026) the direction changed again to **blue glass**: the terminal structure stays, but the green rotates to blue, the geometry softens, the font changes, and the push-to-talk overlay becomes a real macOS glass panel. This doc describes the blue-glass identity as shipped; the earlier passes are in the git history.

## The direction in one line

OpenStream is a dictation tool whose whole thesis is that **a spoken line break should never submit your command**. The identity is calm and precise: white text, one soft blue accent, soft-cornered panels, and near-clear glass. Both the app window and the push-to-talk bar sit on a native macOS vibrancy material; in the app the panels are a bright low-opacity film with a low blur and a refracting rim, so the desktop reads through (the "Liquid" direction, [#350](https://github.com/Nabzx/openstream/issues/350)). The landing page is its own thing (see per-surface).

## Why navy + blue-glow needs care

This palette sits right next to a look that reads as generated: *the cyberpunk dashboard* — navy background, bright cyan accent, glow on everything, a grid or scanline. It's the same trap the phosphor green fell into (near-black + a lone acid pop). Blue glass avoids it the same way: by being a coherent, restrained world rather than a dark theme with a loud accent.

- **Glow is a highlight, not a coat of paint.** After [#341](https://github.com/Nabzx/openstream/issues/341) it belongs on the mark and nothing else. The first cut of the identity put a bloom on labels, headings, pills, the primary button, the focus ring and more, and the window read as generated. If everything glows, nothing reads.
- **Glass is a material, not a filter.** Both the window and the overlay use native `vibrancy`. The app panels (Liquid, [#350](https://github.com/Nabzx/openstream/issues/350)) are a bright film at `rgba(255,255,255,0.07)`, `blur(8px) saturate(1.7)`, with an inset rim so the light catches the edge. Low blur and low tint are what make it read as clear rather than frosted. Text carries one shadow pass for the bright-wallpaper case, never stacked. Reduce Transparency swaps the whole thing to a solid navy via `@media (prefers-reduced-transparency: reduce)`.
- **Hierarchy is shades of blue-grey**, not blue-vs-grey. `--fg` is a warm off-white; `--muted` and `--faint` step down through blue-greys; the two accents (`--acc`, `--acc-2`) are the only saturated colour.
- **Soft, not round.** `10px` radius, `7px` on small controls, pill on toggles and tags. Not pronounced, not pill-shaped buttons.
- **Terse, man-page copy.** `SYNOPSIS / SAFETY / INSTALL`. No marketing throat-clearing. The `> ` prompt prefix and `──` rule marks survive as quiet nods to where this tool lives.

### Anti-references — do not do these

Animated grid / "tron" lines · a full glow on every element · gradient-mesh backgrounds · pure `#00BFFF` cyan (too electric) · a dark blue *tint* on every panel (the frosted look the Liquid pass moved away from) · pronounced `border-radius: 16px+` everywhere · a second bright hue competing with the blue.

## Tokens

### Colour

The app window runs on `vibrancy: "hud"` ([#350](https://github.com/Nabzx/openstream/issues/350) swapped it from `"under-window"`, which is too dark and desaturated to read as clear glass), so its surfaces are `rgba` over the material, not solid. Values below are the Liquid set; the Reduce-Transparency fallback swaps `--screen*` and `--line*` to opaque navy in a media query at the end of `index.css`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A1420` | solid navy — the Reduce-Transparency fallback ground |
| `--screen` | `rgba(255,255,255,0.07)` | panels, cards — a bright near-clear film |
| `--screen-2` | `rgba(255,255,255,0.055)` | keycaps, fields, the select, buttons, insets |
| `--rim` | `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.06)` | the light catching a panel edge — on every glass surface |
| `--acc` | `#8FC4FF` | primary: prompts, the live state, links, primary button |
| `--acc-2` | `#52E6D6` | secondary: "starting" / pending state |
| `--err` | `#FF6B54` | genuine errors only: a missing permission, a dead server. Never decoration. |
| `--fg` | `#EAF2FF` | body text |
| `--fg-hi` | `#FFFFFF` | headings, active labels |
| `--muted` | `#C2D2E6` | captions, secondary text, disabled |
| `--faint` | `#93A6BF` | small labels, the beta tag, empty-state text |
| `--line` | `rgba(255,255,255,0.12)` | hairlines between rows |
| `--line-hi` | `rgba(255,255,255,0.22)` | visible borders |
| `--glow` | `rgba(143,196,255,0.5)` | the one tight halo on the mark, nowhere else |
| `--shadow-text` | `0 1px 3px rgba(0,0,0,0.42)` | one pass on text over near-clear glass, never stacked |

Cards and panels also carry `backdrop-filter: blur(8px) saturate(1.7)` plus `--rim`. The **overlay** uses a lighter set again (whiter text, a brighter rim) — see its section. The **landing page** has its own palette entirely and is not glass.

### Type

- **The app UI and prose run on the system sans** (`system-ui` / SF Pro), set in [#342](https://github.com/Nabzx/openstream/issues/342). A monospace chrome read as a terminal cosplay rather than a Mac app.
- **[JetBrains Mono](https://www.jetbrains.com/lp/mono/)** is kept, still bundled, for the places where the literal characters matter: the wordmark, the commands table, keycaps, and the hotkey readout. Ligatures off. Rounder letterforms than Space Mono, which is why it won over the earlier terminal direction.
- Bundled, not fetched: the app and overlay carry one variable `jetbrains-mono.woff2` (latin subset, ~56 KB) locally so an offline first run still renders; the landing page pulls it from Google Fonts. Fallbacks: `system-ui, -apple-system, sans-serif` for the UI, `ui-monospace, "SF Mono", Menlo, monospace` for the mono.
- The wordmark is JetBrains Mono bold: `~ openstream`.
- Scale: `13.5px` base in the app, `15–16px` on the landing page, `line-height` ~`1.6`. Headings step up modestly.
- Uppercase labels get `letter-spacing: 0.05–0.13em`.

### Geometry & motion

- `--r: 10px` (cards, panels, the mark), `--r-sm: 7px` (buttons, fields, keycaps, tabs), `999px` (pills, the toggle, tags).
- Borders `1px solid var(--line-hi)`, whiter since the Liquid pass. No box-drawing marks on labels any more ([#345](https://github.com/Nabzx/openstream/issues/345)).
- Shadows: no drop shadows. Every glass surface carries `--rim` (a bright inset top edge, a faint bottom one). The one glow shadow left is the mark's tight halo ([#343](https://github.com/Nabzx/openstream/issues/343)).
- **Motion budget: one orchestrated moment per surface.** The landing hero gets its boot-and-demo sequence. In the app: the blinking block cursor, the mark's pulse while recording, the waveform. The scanline does not move and is dialled almost to nothing. Respect `prefers-reduced-motion`.

### The wordmark

`~ openstream` lowercase in JetBrains Mono, shell-prompt prefix and a blinking block cursor:

```
~ openstream █
```

The **mark** in the app is a small glass tile (32px, `--screen` fill, `--rim`, one tight `--glow` halo) with the stream glyph in `--acc` ([#352](https://github.com/Nabzx/openstream/issues/352)) — the old glowing ring suited the frosted look, not the clear one. The app icon still carries the full two-line stream; the Home hero and the menu-bar icon, at ~18px, carry a single wave, since two lines tangle into a blob that small. `src/components/Mark.tsx`, `assets/icon.svg` and `scripts/build-icons.sh` hold the three, kept in step.

## Per-surface

### 1. App window — `src/index.css` + `electron/main.js` — **done** ([#300](https://github.com/Nabzx/openstream/issues/300), glass in [#301](https://github.com/Nabzx/openstream/issues/301)), refined in [#341](https://github.com/Nabzx/openstream/issues/341), Liquid in [#350](https://github.com/Nabzx/openstream/issues/350)

`createWindow` runs on `vibrancy: "hud"` + `visualEffectState: "active"` + `backgroundColor: "#00000000"` (transparent, so the material shows; the CSS carries the fallback). `index.css` keeps `body` near-transparent and every card/panel a bright film with `blur(8px) saturate(1.7)` + `--rim`, so the desktop reads through as clear glass. `--r` / `--r-sm` radius across cards, buttons, fields, keycaps, the mark; pills and the toggle full-round. The macOS chrome (traffic lights, hidden-inset title bar) stays. An in-app gradient behind the glass was tried and dropped: the maintainer preferred the plain clear glass showing the real desktop.

**#341** was the first follow-up, once the identity was live and reading as generated: system sans for the UI (mono only for literal characters, see Type); glow cut back to the mark; flat de-saturated panels; the `──` and `>` decoration off the labels and links; tinted sentence-case pills; bigger controls; the wordmark-plus-segmented-control toolbar. Before/after: [claude.ai/code/artifact/9aea174f](https://claude.ai/code/artifact/9aea174f-3d78-4db2-b08c-35f734025d4c).

**#350 (Liquid)** took the still-generic cyan-on-navy to a near-clear material: bright film panels, low blur, a refracting rim, the accent softened to `#8FC4FF`, the mark redrawn as a glass tile, and a `@media (prefers-reduced-transparency: reduce)` block that swaps the whole window to a solid navy. It also rebuilt the Settings page as one repeated block (name, context, control) instead of three competing treatments. Five blue-glass options were mocked first: [claude.ai/code/artifact/91d4610a](https://claude.ai/code/artifact/91d4610a-0c35-4c5f-934a-8b3403fb51d3).

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
- **Colour** *(current, #350)*: `#8FC4FF` soft blue accent, white text, navy `#0A1420` fallback ground. `#52E6D6` aqua for pending state only. One red `#FF6B54` for genuine errors. No second bright hue. **Dark-only** — no light variant. (Was `#7FCBFF` on `#14335F` before Liquid.)
- **Glass window** *(#301, pre-launch)*: the app window runs on `vibrancy: "under-window"`, panels translucent, text shadowed, solid-navy fallback. The overlay is the same idea at a lighter setting. True Liquid Glass (`NSGlassEffectView`, macOS 26) is still a native rewrite and still out of scope.
- **Window refinement** *(#341, post-launch)*: the first cut of blue glass read as generated. The fix, a skin pass with no layout change: system sans for the UI, glow on the mark only, flat de-saturated panels, no terminal decoration, tinted pills, bigger controls, a proper toolbar.
- **Liquid** *(#350, post-launch)*: #341 was cleaner but still generic. Moved to a near-clear material (bright film panels, low blur, refracting rim, softer `#8FC4FF`), redrew the mark as a glass tile, added the reduced-transparency fallback, and rebuilt Settings as one repeated block. Chosen from five blue-glass mocks. Follow-up: the window vibrancy went `"under-window"` to `"hud"` because the dark background material read as flat blue-grey under the clear film; a painted in-app gradient behind the glass was tried and dropped in favour of the real desktop showing through. The overlay and landing page still to follow.
- **Font**: JetBrains Mono, bundled locally for the app and overlay (one variable woff2), Google Fonts on the landing page. No separate display face.
- **Geometry**: `10px` / `7px` / pill radius. Soft, not round.
- **Overlay**: native `vibrancy: "hud"` + rounded + shadow; CSS glass on top at the "level 2" translucency point. True Liquid Glass is a post-launch native rewrite ([#301](https://github.com/Nabzx/openstream/issues/301)), not blocking v1.0.
- **Name**: stays *OpenStream*. A rename ([#299](https://github.com/Nabzx/openstream/issues/299)) is parked — not coupled to this and not for v1.0.
- **App window**: keep the macOS structure (traffic lights, hidden-inset title bar). No custom chrome. Keep every layout, flow, and the Permissions gate — swap the skin only.
- **Scope**: this pivot is a pre-launch pass — token recolour, geometry, font, overlay glass, icons, brand art, landing. It does not move layout or behaviour, so [#228](https://github.com/Nabzx/openstream/issues/228)'s functional checks are unaffected; the overlay `vibrancy` change gets one manual-verification line.
