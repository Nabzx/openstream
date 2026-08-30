# Plan: dramatically reduce the app size

*Written August 2026, after [#249](https://github.com/Nabzx/openstream/issues/249) removed the ~1.15 GB of bundled model weights.*

## Why

App size is OpenStream's most visible competitive weakness. OpenSuperWhisper's DMG is **11 MB**; ours — even after #249 — is an estimated **~150 MB**, and ~120–150 MB of that is the Electron runtime alone. To be the obvious choice for a local dictation tool, the download has to feel light.

**Hard guardrail:** transcription accuracy (whisper `large-v3-turbo` since #308) and the deterministic cleanup must not regress. The only quality lever genuinely at risk is paragraph-break placement, which is the one thing the resident rewrite model does.

## Where the bytes are (post-#249, arm64 `.app` → DMG estimate)

| Component | Approx. | Notes |
|---|---|---|
| **Electron runtime** (Chromium + Node) | **~120–150 MB** | The whole ballgame. `node_modules/electron/dist` is 295 MB unpacked; the packaged arm64 slice is smaller but dominant. |
| `resources/bin/llama/` | ~26 MB | `llama-server` + ~50 dylibs. The dylibs (`libllama`, `libggml-metal`, `libmtmd`, …) are the bulk, not the extra CLI binaries. |
| `resources/bin/whisper-server` + 6 dylibs | ~4 MB | Not worth optimising. |
| Native helpers (`hotkey-helper`, `accessibility-helper`) | ~0.25 MB | Swift, tiny. |
| Renderer (`dist/`) | ~0.2 MB | React build. |

Runtime dependencies are just `react` + `react-dom` — no bloat there.

## The levers, by how far they get us

### Tier 0 — trim, keep Electron (~150 → ~120 MB)

- electron-builder pruning: drop unused locales, `inspector`, other-arch bits.
- Drop `libmtmd` (multimodal) and the unused CLI binaries from the llama bundle if `llama-server` still links.
- Strip symbols from `whisper-server` and its dylibs.

Marginal. Do it, but it doesn't change the story.

### Tier 1 — replace the runtime (~120 → ~30–45 MB)

**Tauri** (Rust core + macOS `WKWebView`). The runtime is ~5–10 MB instead of ~140. The React renderer serves as-is — Tauri loads the same `dist/`. The Swift helpers (`hotkey-helper`, `accessibility-helper`) are unchanged.

The work: port `electron/*.js` — the main process, the IPC surface, the dictation/voice-edit coordinators, the model supervisors — to Rust. The coordinators are already pure, tested modules; the orchestration logic is settled. Real work, bounded.

**The central decision this plan needs an answer to.** It's a big rewrite with a clear payoff; the alternative is staying at ~120 MB forever.

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

1. **Measure the real breakdown** — build the post-#249 DMG, get exact numbers per component (research/task).
2. **Tauri feasibility** — can the React renderer + the Swift helpers + a Rust port of the coordinators actually work, and what does the port cost? (prototype)
3. **Break placement without SmolLM2** — how much quality is lost by a deterministic rule vs a tiny model? (prototype, needs #67/#126 data)
4. **Tier 0 quick wins** — electron-builder pruning + llama-bundle trim (task; independent of the big decision).
5. **The risk-appetite call** — Tier 1 only, Tier 1+2, or commit to native? (grilling — the user)
