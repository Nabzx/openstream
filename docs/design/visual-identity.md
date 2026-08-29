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

### Colour

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0E0A` | ground — near-black, faint green cast, never pure `#000` |
| `--bg-raised` | `#0F150F` | panels, cards |
| `--fg` | `#C8FFC8` | body text — dim phosphor |
| `--fg-bright` | `#4AF626` | primary green — headings, prompts, the live state |
| `--fg-dim` | `#5C7A5C` | secondary text, captions, disabled |
| `--line` | `#1E3A1E` | borders, rules, box-drawing |
| `--glow` | `rgba(74, 246, 38, 0.35)` | text-shadow bloom on bright green |
| `--amber` | `#FFB000` | attention / warning / "break dropped" — replaces red |
| `--amber-dim` | `#5A4400` | amber borders/tints |

One accent hue (green), one warm signal (amber). No blue, no red, no third colour. Deliberately **dark-only** — a hacker theme is dark by definition.

### Type

- **Mono, everywhere.** [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (Google Fonts) as the workhorse — has real character, ligatures off. Fallback: `ui-monospace, "SF Mono", Menlo, monospace`.
- **Wordmark / big headings**: a bitmap/pixel face for one distinctive note — [Departure Mono](https://departuremono.com/) or a chunky mono at heavy weight. Used sparingly (the logo, the hero H1).
- Scale: tight. `13px` base in the app, `15–16px` on the landing page. Headings step up modestly — this look doesn't do giant heroes.
- Uppercase labels get `letter-spacing: 0.08em`. Body copy stays short enough that full-mono never tires.

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

### 1. Landing page — `site/index.html` *(do first)*

The page **is** a terminal. Full rewrite of the current file's styling; keep the content, reframe it.

- **Hero**: a terminal window (black, green border, three-dot chrome in green/dim/amber). A short boot sequence — `$ openstream` → a waveform → the demo. The existing two-window demo (line break kept in a notes app, dropped in a terminal) recoloured as two terminal panes, the "break dropped" verdict in amber.
- **Sections** as man-page blocks: `SYNOPSIS` (the pitch), `SAFETY` (deny-by-default), `LOCAL` (nothing leaves the machine), `COMMANDS` (what you can say), `INSTALL` (the `git clone` block, already real), `STATUS`.
- ASCII / box-drawing for the one diagram (the app → break-decision table).
- Google Fonts (JetBrains Mono + the pixel face) — the landing page has no CSP restriction.
- Keep the demo-GIF slot ([#21](https://github.com/Nabzx/openstream/issues/21)).

### 2. App window — `src/index.css` + all pages

Port the token layer to the palette above. **Keep the macOS window structure** (traffic lights, `titleBarStyle: "hiddenInset"`, the toolbar) — recoloured, not replaced. Drop the `prefers-color-scheme` light path entirely.

- Toolbar tabs → mono, `[ home ]` `[ commands ]` `[ settings ]` bracket style, active tab in bright green.
- Cards → `--bg-raised` with a `1px` green border, no radius, no shadow.
- `StatusPill` → `[OK]` / `[!!]` bracket tags, not rounded pills.
- `Toggle` → `[x]` / `[ ]` or an on/off block switch, hard-edged.
- `Mark` → the glyph recoloured phosphor green with a `--glow` text-shadow.
- `KeyCaps` → mono keycaps, green border.
- The Commands tab leans all the way in — it's already a reference list; make it read like `man openstream`.
- The disclosure chevron → `▸` / `▾`.

### 3. App icon — `assets/icon.svg` → `assets/icon.icns`

Black squircle tile, phosphor-green mark, a subtle scanline and a soft outer glow. Regenerate via `scripts/build-icons.sh`.

### 4. Menu-bar (tray) icon — `electron/icons/`

`iconTemplate.png` is currently a macOS *template* image (monochrome, OS-tinted — green can't show). **Decision needed:** switch it to a non-template coloured icon so the phosphor green reads in the menu bar, or keep it template (safe, adapts to light/dark menu bars) and let colour show only in the recording/transcribing states. Recommend: keep idle as a template glyph; make **recording** a bright-green glyph and **transcribing** amber (they're already non-template).

### 5. Push-to-talk overlay — `electron/overlay/`

- Drop the macOS `vibrancy: "hud"` glass (or tint it heavily green) for a solid `--bg` panel, `1px` green border, faint scanline.
- Waveform bars → phosphor green (`--fg-bright`), amber when clipping.
- "Listening" → `> listening █` in mono. "Editing…" → `> editing █`.
- Held-result panel → a terminal error block: `┌─ couldn't place text ─┐`, the text in a `<pre>`, `[copy]` `[dismiss]` bracket buttons.
- CSP allows only `'self'` — bundle the mono font or fall back to `ui-monospace`.

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
- **Colour**: `#4AF626` primary green, locked. Amber `#FFB000` **only** as the warning/attention signal. No red, no blue, no third colour. **Dark-only** — no light variant.
- **Name**: stays *OpenStream*. Brand/marketing surfaces and the wordmark render it lowercase `openstream`; the macOS `.app` bundle name stays `OpenStream`.
- **App window**: keep the macOS structure (traffic lights, `titleBarStyle: "hiddenInset"`, the toolbar) and recolour it. No custom chrome. Keep every layout, flow, and the Permissions gate — swap the skin only.
- **Landing page**: a static page that reads as a terminal, with **one** animated hero (a boot + demo sequence). Not an interactive shell.
- **Hero demo**: a CSS/JS recreation of the terminal session is the primary hero; the real screen-recording GIF ([#21](https://github.com/Nabzx/openstream/issues/21)) drops into a lower "see it for real" section once recorded.
- **Fonts**: bundle JetBrains Mono (~200 KB woff2) for the app and the overlay (both CSP `'self'`) as well as the landing page. The size fight is models + Electron, not a font.
- **Tray icon**: idle stays a macOS *template* glyph (adapts to the menu-bar theme); the recording state is bright green, transcribing is amber.
- **Scope, staged**: pass 1 = landing page + app window + app icon + menu-bar icons + overlay. Pass 2 = DMG installer background + the GitHub repo social-preview image + README styling. Later = `[dictation]` console formatting and the held-result / error copy in the terminal voice.
