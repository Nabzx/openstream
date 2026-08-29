# Visual identity: terminal / phosphor

*Direction for the launch rebrand — landing page first, then the app, the icons, and the overlay.*

## The direction in one line

OpenStream is a dictation tool for people who live in a terminal, and its whole thesis is that **a spoken line break should never submit your command**. The identity is that context rendered honestly: a phosphor-green terminal on black, not "a dark site with a green accent".

## Why black + neon green needs care

This palette is on the list of looks that read as AI-generated — specifically *"near-black with a lone acid-green pop"*. That version fails because it's half-committed: a safe dark theme, one loud accent, everything else neutral, soft, rounded, floating. We avoid that by committing to a whole coherent world:

- **Green is the body text colour**, not an accent. Phosphor on black. Hierarchy comes from *shades of green*, not from green-vs-grey.
- **The surface has materiality** — a faint scanline, a slight bloom on headings, a barely-there vignette. AI-generated dark themes are dead flat; a CRT never is.
- **Monospace is the system**, not a code font. Box-drawing characters (`┌─┐ │ └─┘`) and ASCII rules as structure, not hairline `<div>` borders.
- **Hard geometry** — `border-radius: 0`, `1px` solid borders, no drop shadows (or one hard offset shadow, DOS-style). No gradients except the glow.
- **Terse, man-page copy.** `SYNOPSIS / SAFETY / INSTALL`. No marketing throat-clearing.

### Anti-references — do not do these

Falling-glyph "Matrix rain" background · full CRT screen-curvature filter · pure `#00FF00` (too harsh) · typing animations on every element · fake fisheye terminal chrome · a green-on-black theme that's still all rounded cards and soft shadows underneath.

## Tokens

*Landing page shipped first ([#278](https://github.com/Nabzx/openstream/issues/278)) and settled the real values; the app window ([#279](https://github.com/Nabzx/openstream/issues/279)) ports the same set. The table below is what actually shipped — it supersedes the earlier `#4AF626` + amber + JetBrains Mono sketch.*

### Colour

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#020402` | ground — near-black with a faint green cast, never pure `#000` |
| `--screen` | `#050805` | panels, cards, fields |
| `--screen-2` | `#0A100A` | icon tiles, insets |
| `--acc` | `#3DF65A` | primary green — headings, prompts, the live state, primary buttons |
| `--acc-2` | `#1ED89A` | secondary green — pending / "starting" state, small tags |
| `--fg` | `#9FB89F` | body text — dim phosphor |
| `--fg-hi` | `#D2E6D2` | headings, active labels |
| `--muted` | `#56704F` | captions, secondary text, disabled |
| `--faint` | `#3C4E3B` | rule marks, bracket glyphs, empty-state text |
| `--line` | `#16241A` | hairlines between rows |
| `--line-hi` | `#24382A` | visible borders |
| `--glow` | `rgba(61, 246, 90, 0.16)` | text-shadow / box-shadow bloom on bright green |

Two greens carry the whole hierarchy — primary and secondary state, no amber. **No blue.** Deliberately **dark-only** — a hacker theme is dark by definition.

**App-only deviation — `--err` `#F0503C`.** The landing page has no error state; the window does (a missing permission, a dead model server). An ANSI-terminal red, used only for genuine blocking failures — never as decoration and never on the landing page.

### Type

- **[Space Mono](https://fonts.google.com/specimen/Space+Mono)**, everywhere — regular `400` and bold `700`. Distinctive without tipping into kitsch; ligatures off. Fallback: `ui-monospace, "SF Mono", Menlo, monospace`.
- Bundled, not fetched: the landing page pulls it from Google Fonts, the **app and overlay carry `space-mono-400.woff2` + `space-mono-700.woff2` locally** (`src/fonts/`, ~37 KB total) so a first-run offline machine still renders correctly. The size fight is models + Electron, not a 37 KB font.
- No separate display face — the wordmark is Space Mono bold at a larger size. One family keeps the terminal illusion intact.
- Scale: tight. `13px` base in the app, `15–16px` on the landing page. Headings step up modestly — this look doesn't do giant heroes.
- Uppercase labels get `letter-spacing: 0.08–0.14em`. Body copy stays short enough that full-mono never tires.

### Structure & motion

- `border-radius: 0` (or `2px` max on interactive controls only).
- Borders: `1px solid var(--line)`. Box-drawing characters for framed content where it reads well.
- Shadows: none, or a single hard `2px 2px 0 var(--line)`.
- **Motion budget: one orchestrated moment per page.** The landing hero gets a boot-and-demo sequence. Everywhere else: a blinking block cursor `█`, a scanline that doesn't move, and nothing else. Respect `prefers-reduced-motion`.

### The wordmark

`openstream` lowercase in mono, shell-prompt prefix and a block cursor:

```
~ openstream █
```

Or the mark alone: a filled block `▮` / a `>` caret. The current caret-in-a-ring mark can stay as the *glyph* (icon, tray) recoloured to phosphor green; the wordmark is the text treatment above.

## Per-surface plan

### 1. Landing page — `site/index.html` — **done** ([#278](https://github.com/Nabzx/openstream/issues/278))

The page **is** a terminal. What shipped, after iteration:

- **Hero** is 100vh: the wordmark bar, an eyebrow, a two-line H1, and a framed terminal running a looping boot-and-dictation demo (`$ openstream` → `● listening` → a Star Wars line typed out → an on-device note). Space Mono, two greens, `#020402` ground, a static scanline.
- **Sections** as rule-headed blocks (`── UPPERCASE ────`): the 40-vs-150 wpm hook with ASCII bars, `$ openstream --what` positioning against Wispr Flow, the safe-target vs everywhere-else grid, the local `0`, the commands list, the `git clone` install block, a status list. A tmux/vim-style fixed status bar at the foot.
- British English, no em- or en-dashes, "two students who just graduated" voice.
- Google Fonts for Space Mono — the landing page has no CSP restriction.
- Keep the demo-GIF slot ([#21](https://github.com/Nabzx/openstream/issues/21)).

### 2. App window — `src/index.css` — **done** ([#279](https://github.com/Nabzx/openstream/issues/279))

`src/index.css` rewritten to the shipped token set. Class names all kept, so no `.tsx` churn. **macOS window structure kept** (traffic lights, `titleBarStyle: "hiddenInset"`, the toolbar) — recoloured, not replaced. `prefers-color-scheme` light path dropped entirely. Space Mono bundled locally (`src/fonts/`, `@font-face` in `index.css`).

- Toolbar tabs → `[ home ]` `[ commands ]` `[ settings ]` bracket style (icons hidden, lowercase), active tab in `--acc` with a glow.
- Cards → `--screen` with a `1px --line-hi` border, no radius, no shadow. `.card-label` prefixed `──`.
- `StatusPill` → hard-edged `1px` bracket tags coloured per tone (`--acc` / `--acc-2` / `--err` / `--muted`), not rounded pills.
- `Toggle` → hard-edged block switch, green when on.
- `Mark` → the glyph in `--acc` with a `--glow` drop-shadow; red in the attention state.
- `KeyCaps` → square mono keycaps, `--line-hi` border.
- `.linkbtn` → prefixed `>`.
- Copy is untouched this pass — the Commands `man openstream` voice and `> listening █` states are a later copy pass.
- Disclosure chevron stays the SVG, rotated on expand.

### 3. App icon — `assets/icon.svg` → `assets/icon.icns` — **done** ([#280](https://github.com/Nabzx/openstream/issues/280))

Near-black terminal tile (radial `#0B1A0E` → `#020402`), the caret-in-ring mark in `--acc` with a Gaussian glow and a smooth radial bloom behind it, a faint scanline pattern, a `--line-hi` hairline frame. Same glyph geometry as before, recoloured. Regenerate via `scripts/build-icons.sh`.

### 4. Menu-bar (tray) icon — `electron/icons/` — **done** ([#280](https://github.com/Nabzx/openstream/issues/280))

**Settled:** idle stays a macOS *template* glyph (black; the OS tints it to the menu-bar theme, so it adapts to light/dark). **recording** is a non-template `--acc` glyph, **transcribing** a non-template `--acc-2` glyph. Amber is gone — the second green is the "working" signal. Wiring in `electron/main.js` (`TRAY_ICON_FILES`) is unchanged; only the PNGs were recoloured.

### 5. Push-to-talk overlay — `electron/overlay/` — **done** ([#281](https://github.com/Nabzx/openstream/issues/281))

- `vibrancy: "hud"` dropped in `createOverlayWindow`; the window stays frameless + transparent and `overlay.css` paints a solid `--bg` panel with a `1px --acc` border, a faint scanline and a soft outer glow. Hard edges.
- Recording strip → `> listening` with a blinking block cursor (`.cur`), the waveform bars in `--acc` (no gradient). "Editing…" → `> editing`. Status text lowercased in `overlay.js`.
- Held-result panel → an error block: an `--err` `──`-prefixed heading (`couldn't place text`), the text in a `<pre>` on `--screen`, `[copy]` / `[dismiss]` bracket buttons.
- CSP is `default-src 'self'; style-src 'self'`, so Space Mono is bundled directly in `electron/overlay/` (`space-mono-{400,700}.woff2`) with a `@font-face` using a relative URL.
- Clipping colour not wired — there's no clipping signal on the IPC boundary today; the level is just clamped. Left for later if a real clip flag lands.

### 6. Tray menu / notification wording

Can't theme the OS chrome, but the copy matches the voice: tray tooltip `openstream — idle` / `openstream — listening`, menu items lowercase.

## Sequence

1. **Landing page** — isolated, no risk to the shipping app, fastest feedback. This is also the launch page ([#21](https://github.com/Nabzx/openstream/issues/21) / [#22](https://github.com/Nabzx/openstream/issues/22)).
2. **App token layer + pages** — one PR for `index.css` + the component/page restyles.
3. **Icons** — SVG + `build-icons.sh` + the tray PNGs.
4. **Overlay** — its own CSS, its own CSP.

Can run in parallel with the [#228](https://github.com/Nabzx/openstream/issues/228) verification pass — only step 2+ touches app code.

## Decisions (settled August 2026, via grilling)

- **Reference direction**: 90s phosphor CRT with modern-minimal discipline — committed colour, real CRT texture, hard-edged and dense. **Not** glitch / RGB-split / synthwave.
- **Tone**: serious infrastructure tooling with dry wit. The copy earns trust by being precise, never by being a bit.
- **Colour**: `#3DF65A` primary green + `#1ED89A` secondary green (state), locked by the landing page. No amber — the second green does the "pending" work. No blue. **Dark-only** — no light variant. The app window adds one ANSI red `#F0503C` for genuine blocking errors only; it never appears on the landing page.
- **Name**: stays *OpenStream*. Brand/marketing surfaces and the wordmark render it lowercase `openstream`; the macOS `.app` bundle name stays `OpenStream`.
- **App window**: keep the macOS structure (traffic lights, `titleBarStyle: "hiddenInset"`, the toolbar) and recolour it. No custom chrome. Keep every layout, flow, and the Permissions gate — swap the skin only.
- **Landing page**: a static page that reads as a terminal, with **one** animated hero (a boot + demo sequence). Not an interactive shell.
- **Hero demo**: a CSS/JS recreation of the terminal session is the primary hero; the real screen-recording GIF ([#21](https://github.com/Nabzx/openstream/issues/21)) drops into a lower "see it for real" section once recorded.
- **Fonts**: Space Mono (`400` + `700`). The landing page pulls it from Google Fonts; the app and overlay bundle the two woff2 files locally (~37 KB total, `src/fonts/`) so an offline first run still renders. No separate display face — the wordmark is Space Mono bold, larger. The size fight is models + Electron, not a font.
- **Tray icon**: idle stays a macOS *template* glyph (adapts to the menu-bar theme); the recording state is bright green (`--acc`), transcribing is the second green (`--acc-2`).
- **Scope, staged**: pass 1 = landing page + app window + app icon + menu-bar icons + overlay. Pass 2 = DMG installer background + the GitHub repo social-preview image + README styling. Later = `[dictation]` console formatting and the held-result / error copy in the terminal voice.
