# Plan: dramatically reduce the app size

*Written August 2026, after [#249](https://github.com/Nabzx/openstream/issues/249) removed the ~1.15 GB of bundled model weights. Measured for real and Tier 0 landed in September 2026 (#269, #272) - the estimates below are now measurements.*

## Why

App size is OpenStream's most visible competitive weakness. OpenSuperWhisper's DMG is **11 MB**; ours, after #249 and Tier 0, is **128 MB**, and most of that is still the Electron runtime. To be the obvious choice for a local dictation tool, the download has to feel light.

**Hard guardrail:** transcription accuracy (Parakeet TDT 0.6b v3, since [ADR-0003](../adr/0003-parakeet-for-transcription.md)) and the deterministic cleanup must not regress. The only quality lever genuinely at risk is paragraph-break placement, which is the one thing the resident rewrite model does.

## Where the bytes are (measured, post-#326/#272, arm64 `.app` → DMG, `npm run dist` on real hardware)

| Component | Measured | Notes |
|---|---|---|
| **DMG (the actual download)** | **128 MB** | Was 142 MB before Tier 0. |
| **.app installed** | **274 MB** | Was 324 MB. |
| — Electron Framework.framework | ~276 MB | The whole ballgame. Locale packs already stripped to `en`/`en_GB` (#410) - was ~60 languages, 47 MB. |
| — `resources/bin/llama/` | 26 MB | `llama-server` + dylibs. Untouched by Tier 0 - see Tier 0 remainder below. |
| — `resources/bin/transcription-helper` | 16 MB | Swift, statically links FluidAudio. Parakeet's CoreML bundles (~460 MB, confirmed on disk in `~/Library/Application Support/FluidAudio`) download on first run, not bundled. |
| — Native helpers (`hotkey-helper`, `accessibility-helper`) | ~0.3 MB | Swift, tiny. |
| — `app.asar` (our JS) | 720 KB | Was 5.4 MB - `react`/`react-dom` were bundled unused; moved to devDependencies (#409). |

Confirmed arm64-only via `lipo -info` on the Electron binary - no accidental universal/x64 duplication. Resident RAM of `transcription-helper` + `llama-server` warm is still **not measured** - needs a human with Activity Monitor during a real dictation, not something safe to get from an automated session.

## The levers, by how far they get us

### Tier 0 — trim, keep Electron (142 MB → 128 MB DMG) — done

- ~~electron-builder pruning: drop unused locales~~ - done, #410 (47 MB).
- ~~Stop bundling react/react-dom unused~~ - done, #409 (4.7 MB in `app.asar`, mostly absorbed by DMG compression).
- Still open: drop `libmtmd` (multimodal) and the unused CLI binaries from the llama bundle if `llama-server` still links; strip symbols from `transcription-helper` and the llama dylibs.

Confirmed marginal against the Electron runtime, as expected - do the rest, but it doesn't change the story below.

### Tier 1 — replace the runtime (128 MB DMG → ~30–45 MB)

**Tauri** (Rust core + macOS `WKWebView`). The runtime is ~5–10 MB instead of the ~276 MB Electron Framework measured above. The React renderer serves as-is — Tauri loads the same `dist/`. The Swift helpers (`hotkey-helper`, `accessibility-helper`) are unchanged.

The work: port `electron/*.js` — the main process, the IPC surface, the dictation/voice-edit coordinators, the model supervisors — to Rust. The coordinators are already pure, tested modules; the orchestration logic is settled. Real work, bounded.

**The central decision this plan needs an answer to.** It's a big rewrite with a clear payoff; the alternative is staying at ~128 MB forever.

### Tier 2 — drop the resident rewrite model (~45 → ~18 MB)

SmolLM2 is ~1 GB on disk and ~1 GB RAM, resident, doing **only** paragraph-break placement for long (3+ sentence) dictations in break-safe apps. Dropping it removes `resources/bin/llama/` (~26 MB) entirely and halves resident RAM.

Options, in rising quality:
1. **Deterministic break placement** — a rule (topic-shift heuristic, sentence count). We already have `segmentSentences`. Lower quality; measure how much.
2. **A tiny purpose-built model** — a 5–30 MB classifier / Core ML model that only answers "which sentence starts a paragraph".
3. **Make it opt-in** — don't download it by default; the user turns on "smart paragraphs" and accepts the +1 GB.

This is a **quality-vs-size decision**. Needs the #67 / #126 break-placement evidence and a prototype.

### Tier 3 — native (~18 → ~5–8 MB)

A Swift/SwiftUI rewrite, no web view — OpenSuperWhisper's approach. Everything is rewritten. 6–12 months. Only on the table if Tier 1+2 aren't enough and the project has the runway.

## Recommended shape of the investigation

This is a decision tree that spans many sessions — a good fit for `/wayfinder`. The map's destination: **a decision on how far down the tiers to go, and a spec for the chosen tier.** The first tickets:

1. ~~**Measure the real breakdown**~~ — done, #269.
2. **Tauri feasibility** — can the React renderer + the Swift helpers + a Rust port of the coordinators actually work, and what does the port cost? (prototype)
3. **Break placement without SmolLM2** — how much quality is lost by a deterministic rule vs a tiny model? (prototype, needs #67/#126 data)
4. **Tier 0 quick wins** — electron-builder pruning ~~+ llama-bundle trim~~ done, #272 (#409 react/react-dom, #410 locales). Llama-bundle trim (`libmtmd`, unused CLI binaries, symbol stripping) is still open.
5. **The risk-appetite call** — Tier 1 only, Tier 1+2, or commit to native? (grilling — the user)
