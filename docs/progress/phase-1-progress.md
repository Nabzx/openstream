# OpenStream — Engineering Deep Dive

This document exists for one purpose: so that either of us can explain this project in depth, from memory, in an interview — what it is, how it works, why it's built this way, what it cost us to learn that, and what's still missing. It is not marketing copy. Where something is unfinished or fragile, it says so.

It's written to be read top to bottom once, then used as a reference. Skip to whatever section you need.

**Contents**
1. [What OpenStream is](#1-what-openstream-is)
2. [Tech stack, and why each piece](#2-tech-stack-and-why-each-piece)
3. [Process architecture — the eight things running at once](#3-process-architecture--the-eight-things-running-at-once)
4. [Walking one dictation end to end](#4-walking-one-dictation-end-to-end)
5. [The architectural decisions that mattered, and their trade-offs](#5-the-architectural-decisions-that-mattered-and-their-trade-offs)
6. [Testing philosophy](#6-testing-philosophy)
7. [How we work: process and rigor](#7-how-we-work-process-and-rigor)
8. [Vocabulary — the project's own glossary](#8-vocabulary--the-projects-own-glossary)
9. [War stories worth telling in an interview](#9-war-stories-worth-telling-in-an-interview)
10. [Where we actually are vs. the roadmap](#10-where-we-actually-are-vs-the-roadmap)
11. [What's unfinished, fragile, or deliberately deferred](#11-whats-unfinished-fragile-or-deliberately-deferred)
12. [File map](#12-file-map)

---

## 1. What OpenStream is

OpenStream is a **local-first voice dictation app for Apple Silicon Macs**, aimed at developers. You hold a global hotkey (`Control+Option+D` by default), speak, release the key, and the transcribed text lands wherever your cursor was — a code comment, a terminal, a chat window, a document. No audio and no text ever leaves the machine: every model that touches your voice or your words runs as a local subprocess.

The pitch that differentiates it from "just use macOS dictation" or a cloud STT wrapper is a specific, narrow one: **most dictation tools treat every target application the same, and that's actually dangerous.** If you dictate a multi-sentence thought into a terminal and the tool decides to insert a paragraph break, that newline can *execute a half-typed shell command*. If it happens in a chat box, it can *send an unfinished message*. So OpenStream's core design stance is **deny-by-default on line breaks**: it looks at what app and what kind of field is focused before it will ever emit a literal newline, and unless that app is explicitly known to be safe, it won't.

Two more features are *planned but not built*: biasing transcription toward a codebase's own identifiers/vocabulary, and "voice edits" (select text, say "make this a bullet list", have it rewritten in place). Neither exists in the app yet — worth knowing so you don't over-claim in conversation.

The project is pre-alpha: it runs from source, has a working DMG build, but has no code signing, no auto-update, and several parts of the permission/onboarding story are still being worked out.

## 2. Tech stack, and why each piece

| Layer | Choice | Why |
|---|---|---|
| App shell | **Electron 43** | Only realistic way to get a menu-bar app, a settings window, and a transparent always-on-top overlay window, all sharing one process model, on a two-person timeline. |
| Renderer UI | **React 18 + TypeScript + Vite** | Settings window only (`src/`). Small surface area today (one component, `HotkeySettings.tsx`) but typed and testable. |
| Transcription | **whisper.cpp**, compiled from source (pinned tag `v1.9.3`), Metal-accelerated, model `ggml-base.en` (141 MiB) | Local, fast on Apple Silicon via Metal, MIT-licensed end to end (code and weights) — see [§5](#licensing-drove-a-real-model-choice). Run via its own bundled `whisper-server` HTTP server, not the CLI. |
| Rewrite / break-placement | **llama.cpp's `llama-server`**, model `SmolLM2-1.7B-Instruct` (Apache 2.0, Q4_K_M quantization, ~1 GiB) | Decides *only* where paragraph breaks go in long dictation, and (design intent) will drive voice edits later. Deliberately **not** used for general cleanup — see the ADR below. |
| Cleanup | **Hand-written deterministic rules engine**, pure JS (`electron/cleanup/rules.js`) | No model in the hot path. Filler stripping, spoken punctuation, repeat collapsing, technical vocab fixes, run-on segmentation. Costs under 1ms. |
| Global hotkey | **Swift** binary using `CGEvent.tapCreate` (a Quartz event tap) | Only way to observe a key combo system-wide on macOS regardless of which app is focused. Native, separate process, own permission (Input Monitoring). |
| Text injection + context detection | **Swift** binary using the Accessibility (AX) API, `NSWorkspace`, and `CGEvent` for synthetic keystrokes | Same reasoning — inserting text into an arbitrary foreign app and asking "what app/field is focused" both require AX, which requires its own separate permission (Accessibility). |
| Packaging | **electron-builder**, unsigned arm64 DMG | No Apple Developer Program enrollment yet, so no notarization. |
| Testing | **Vitest** (JS unit tests), **Node's built-in `node:test`** (Electron-side `.test.js` files), **Swift Testing** (`@Test`, for the injection engine) | Split because the JS side has two different runtimes in play (Vite-bundled renderer code vs. plain CommonJS Electron main-process code) and the Swift side needed real unit tests for logic that must not regress. |
| CI | **GitHub Actions**, `macos-latest` runner, one job: `npm ci && npm run build` on every PR/push to `main` | Deliberately thin — see [§6](#6-testing-philosophy) for what CI *can't* check and how we cover that gap. |

Two engines are compiled from a **pinned git commit** (not just a tag — the build script re-verifies the resolved commit hash matches and refuses to build otherwise), and every downloaded model/binary is **SHA-256 verified**. This is a security and reproducibility decision, not a nicety: it means "works on my machine" can't silently drift into "works on a different whisper.cpp than the one we tested," and a compromised upstream release can't be pulled in silently.

## 3. Process architecture — the eight things running at once

When OpenStream is fully running, this is what's alive:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Electron main process (electron/main.js)                            │
│  - owns the tray icon, all windows, all IPC, app lifecycle           │
└───────┬───────────────┬───────────────┬──────────────┬──────────────┘
        │ spawns          │ spawns         │ spawns       │ creates (BrowserWindows)
        ▼               ▼               ▼              ▼
┌───────────────┐ ┌───────────────┐ ┌──────────┐ ┌─────────────────────┐
│ hotkey-helper │ │ accessibility-│ │ whisper- │ │ capture window       │
│ (Swift)       │ │ helper (Swift)│ │ server   │ │ (hidden, mic capture)│
│ Input         │ │ Accessibility │ │ (C++)    │ │                      │
│ Monitoring    │ │ permission    │ │ port 8178│ │ overlay window       │
│ permission    │ │               │ │          │ │ (glass HUD)          │
│               │ │               │ │ llama-   │ │                      │
│ stdout: JSON  │ │ stdin/stdout: │ │ server   │ │ settings window      │
│ "down"/"up"   │ │ JSON RPC over │ │ (C++)    │ │ (React, on demand)   │
│ events        │ │ stdio, one    │ │ port 8179│ │                      │
│               │ │ line per req  │ │          │ │                      │
└───────────────┘ └───────────────┘ └──────────┘ └─────────────────────┘
```

Every one of the four spawned child processes (hotkey-helper, accessibility-helper, whisper-server, llama-server) is wrapped by the same small abstraction: `createModelSupervisor` (`electron/modelSupervisor.js`) for the two model servers, and a hand-rolled equivalent for each Swift helper. The pattern is identical everywhere: **spawn it, pipe its stdout/stderr with a role-name prefix so logs are attributable, and if it ever exits unexpectedly, wait a fixed delay and restart it.** This is what "resident, supervised for the life of the app" means in the README — nothing here is a per-dictation subprocess; everything is started once at `app.whenReady()` and kept alive.

**Why two Swift helpers and not one.** This was a deliberate split (documented in the hotkey-helper's own header comment): the hotkey tap only ever needs **Input Monitoring**, and text injection/context-reading only ever needs **Accessibility**. If they were one process holding both permissions, a slow or blocked Accessibility call (which happens — some apps' AX trees are slow or absent) could stall the process and silently kill the global hotkey tap along with it. Splitting them means a hung AX call can never take down your ability to even *start* a dictation.

**Two different IPC shapes, on purpose.** The hotkey-helper is fire-and-forget: it emits `{"event":"down"}` / `{"event":"up"}` and never receives anything back — there's nothing to ask it. The accessibility-helper is a request/response protocol: `main.js` sends a JSON object with an `id` field, gets back a JSON object tagged with the same `id`. That `id` tagging exists specifically so that a slow request (e.g. text injection, which can involve up to a 1200ms "settle guard," see below) can never **head-of-line block** a request sent after it — replies can come back out of order relative to requests and still resolve the right JS Promise.

## 4. Walking one dictation end to end

This is the sequence worth being able to narrate from memory.

1. **Key down.** `hotkey-helper` (Swift, holding Input Monitoring) sees the exact keycode+modifier combo via a Quartz event tap and emits `{"event":"down"}` over stdout. `electron/hotkeyHelper.js` parses the line and calls the registered `onKeyDown` callback.
2. **`pushToTalkCoordinator.keyDown()`** fires. It's a tiny state machine (`electron/pushToTalkCoordinator.js`) that just guards against double-starts, tells the hidden capture window to start recording, and tells the UI to show "recording."
3. **Audio capture** happens in `electron/capture/capture.js`, running inside a permanently-hidden `BrowserWindow`. The mic stream and `AudioContext` are acquired **once, at app start**, and kept open for the app's whole life — push-to-talk only flips a boolean (`isRecording`) that gates whether audio frames get buffered. This was a deliberate choice, not a default: per-press `getUserMedia()` calls would put an unbounded, undocumented CoreAudio device-acquisition delay on the critical path of "user pressed the key and started talking" (see the research note in `docs/research/issue-33-electron-mic-capture.md` — Chromium can defer stream starts by up to 5 seconds around sleep/wake). While recording, it also computes an RMS sound level per audio-frame and streams that number back to the main process purely for the live waveform — the *actual transcript* is never available, or shown, until after key-up.
4. **Key up.** Same path in reverse: `hotkey-helper` emits `"up"`, `pushToTalkCoordinator.keyUp()` fires, records a `performance.now()` timestamp (this becomes the start of the latency budget), and tells the capture window to stop.
5. **The capture window encodes a WAV file** in-memory (`encodeWav()` — hand-written RIFF/WAVE header, 16kHz mono 16-bit PCM) and sends the raw bytes plus the timing object back to the main process over IPC.
6. **`dictationIntake.complete(wavBuffer)`** is where the actual pipeline logic lives (`electron/dictationCoordinator.js`). This function is queued — `queue = queue.then(() => processCompletedDictation(...))` — so if you somehow trigger two completed recordings before the first one finishes, they process **strictly FIFO**, and a bug in one can't corrupt or block the ones behind it (its rejection is swallowed by `.catch(() => {})` on the queue itself, not on the caller's promise). Inside, in order:
   - **Transcribe**: HTTP POST to `whisper-server`'s `/inference` endpoint (`transcriptionHttpAdapter.js`), as `multipart/form-data`. If the returned text is empty after trimming, the pipeline stops here and reports "no speech."
   - **Detect context**: ask the accessibility-helper (over stdio) "what app and what kind of field is focused right now?" It replies with a bundle id (e.g. `com.apple.Terminal`) and whether the focused element is a one-line field (`AXTextField`/`AXComboBox`).
   - **Rules cleanup** (`electron/cleanup/rules.js`): strip filler words, collapse repeated words, convert spoken punctuation ("period" → `.`, "new paragraph" → `\n\n`, but only if the app is break-safe), convert explicit spoken-emoji phrases, segment run-on sentences, fix capitalization, apply a small hardcoded technical-vocabulary correction list, and add terminal punctuation. All regex-based, all under a millisecond, described as "faithful port of a throwaway spike, `spike/llm-cleanup-latency/rules.py`" in the code's own comment — i.e. this file's behavior is empirically validated, not guessed.
   - **Decide break-safety**: is the frontmost app's bundle id on a hardcoded allow-list (`electron/breakSafety.js` — currently TextEdit, Notes, Obsidian, VS Code)? Everything not on that list is unsafe by default.
   - **Maybe ask the rewrite model where paragraph breaks go**: only if the app is break-safe, the field isn't a one-liner, the user didn't say an explicit "new line/paragraph," and the cleaned text has at least 3 sentences. If eligible, the sentences are numbered and sent to `llama-server`'s chat-completions endpoint with a system prompt asking for a comma-separated list of sentence numbers that should start a new paragraph. The reply is defensively **repaired**, not trusted: `repairBreakIndices()` extracts any digits it can find even from a malformed reply, filters out-of-range or duplicate values, and reports whether the model's raw reply matched the expected strict format at all (this diagnostic is logged but never blocks the dictation).
   - **Deliver**: hand the finished text to the accessibility-helper's `insert` command.
7. **Delivery, on the Swift side** (`InjectionEngine.swift`), runs a three-rung fallback ladder, described fully in [§5](#the-injection-fallback-ladder). It returns one of: delivered (with a method and whether it was verified), or held (with a human-readable reason).
8. **Back in `dictationCoordinator`**, the result becomes one of five outcomes: `delivered`, `held`, `failed` (with a stage — transcription/context — attached), `no-speech`, or `empty`. `main.js`'s `transcribeAndPrint()` turns that into: a console log, a tray icon state, and — for `held` results specifically — the text is kept in the overlay (via `heldResultController.js`) so the user can copy it manually, because it correctly transcribed but genuinely could not be placed anywhere.
9. **Latency is measured and logged**, not just claimed: `performance.now()` at key-up vs. at delivery, logged as `release-to-insertion: 742.3ms (within 1000ms budget)`. The product's committed latency budget is **under 1 second**, and this line is how that's checked on a real machine, since CI can't drive a real mic or a real focused app.

## 5. The architectural decisions that mattered, and their trade-offs

### No LLM in the dictation path (ADR-0001)

This is the single most important decision in the codebase, and it's the one most likely to come up as "tell me about a technical decision you made and why." The original plan (still described in old README language and roadmap text) was: every dictation runs through a local LLM pass for filler removal and punctuation. Before building that, we ran a throwaway measurement spike (`spike/llm-cleanup-latency/`) rather than trusting intuition. The result overturned the assumption in a more interesting way than "it's too slow":

- The feared "3-4 seconds per dictation" was an artifact of assuming the model gets *loaded* on every call. Warm (resident), a 3B model only added 0.31s to a short command.
- But **whisper already self-cleans short clips** — it produces fillers-removed, capitalized, punctuated text on its own for short utterances — so an LLM pass on short input adds cost for almost no value.
- On **long** dictation, whisper does *not* self-clean (`"the the"`, `"it it"` survive, punctuation gets sparse) — exactly where an LLM pass would earn its keep — but that's also exactly where it's slowest: 4.58 seconds end-to-end on a 130-word paragraph, well over the 1-second budget.
- So value and cost move together in the wrong direction: **there is no length band where the LLM pass is both fast enough and worth having.** Gating it by length (the obvious compromise) doesn't rescue it — it routes the LLM to precisely the bucket where it's too slow. This is a forced conclusion from the data, not a judgment call.
- A second, independent finding reinforced it: at temperature 0, both models tested still **silently changed meaning** on clean input (dropping a hedge like "I think" from a sentence) — a correctness risk on top of the latency one. Neither model could repair mis-transcriptions either, which is the dominant real-world quality problem anyway — that's an STT problem, not something a rewrite pass fixes.

The decision: **cleanup is a deterministic rules engine (0.1–1.0ms), full stop.** The LLM is not removed from the app — it's *repositioned* to the one place its cost is acceptable: explicitly-requested voice edits (not yet built) and, per a later partial-supersession of this same ADR, deciding *where* paragraph breaks go by returning sentence numbers (never text) rather than rewriting anything.

**The trade-off this accepts:** rules-based cleanup will never be as adaptive as a model — it has a fixed, small vocabulary-correction list and a conjunction-based run-on splitter that can land a boundary mid-clause on long paragraphs (documented as a known limitation directly in the code's comments, not hidden). That's judged an acceptable, bounded cost against a decision that would otherwise blow the latency budget or occasionally corrupt meaning.

### Deny-by-default on line breaks (the break-safety allow-list)

A spoken "new paragraph" only becomes a literal `\n` if the frontmost app's bundle id is on a small, hardcoded allow-list (`electron/breakSafety.js`). Everything else — every app not explicitly vetted — gets the word converted to a plain space instead. This is a safety-over-convenience trade-off, made explicit in the domain glossary (`CONTEXT.md`): *"Every application is treated as unsafe until it is listed."* The cost is real: dictating into an app that would have handled a newline fine, but isn't on the list yet, silently loses that formatting. The alternative — guessing that an unknown app is safe — risks submitting a half-finished terminal command or sending an incomplete chat message, which is a far worse failure mode than losing a line break. This same allow-list also gates whether the rewrite model is even asked to place paragraph breaks at all, and a one-line field (`AXTextField`/`AXComboBox`) overrides everything and forbids newlines outright regardless of the app.

### The injection fallback ladder

Getting text into an arbitrary, unknown foreign application reliably is one of the hardest problems in the whole app, and it went through a documented research/prototype phase (`prototypes/injection-62/`, `prototypes/injection-thresholds-74/`) before the real Swift implementation (`InjectionEngine.swift`). The engine tries, in order, and stops at the first one that works:

1. **Rung 1 — write directly at the caret** via `kAXSelectedTextAttribute`. Atomic, instant, no clipboard involved. But only attempted if the field reports itself as settable *and* its existing content is small enough to plausibly be a real field rather than, say, a terminal's entire scrollback (a max-chars guard, because some terminals report huge AX values that would make this "insert at caret" op actually mean "read then write back megabytes of scrollback").
2. **Rung 2 — clipboard + synthesized ⌘V**, with a careful restore: the user's previous clipboard contents are saved, ours is pasted, then restored — but only if the clipboard's `changeCount` hasn't moved in the meantime (if the user copied something else mid-paste, we leave their copy alone rather than clobbering it with a stale restore). If the target field is readable, the paste is **verified** by reading the field back afterward and checking the text landed.
3. **Rung 3 — type it character by character** via synthesized `CGEvent` keystrokes. Works anywhere a keyboard works, including surfaces with no usable AX tree at all, but it's slow, and long text typed this way can be mangled by autocomplete or a modal editor (a warning note is attached to the result when this happens on long text).

Rung 3 is deliberately gated to only fire after rung 2 was **verifiable and demonstrably failed** — never for fields we couldn't verify in the first place, because typing blind into an unconfirmed field is a much less bounded mistake than one atomic paste we can at least attempt to check.

**The settle guard**, run before any of this: the engine tracks how long ago the frontmost app last changed (via an `NSWorkspace` notification observer) and refuses to trust a target until it's been stable for `settleMs` (400ms), up to a `settleBudgetMs` (1200ms) ceiling — because a user who just alt-tabbed while a dictation was finishing shouldn't have text injected into whatever they happened to be flicking past. If focus is still churning past that budget, the dictation is **held**, not delivered somewhere wrong. There's one narrow, deliberate exception: if the frontmost app has sat still well past the settle guard but the AX tree genuinely won't answer at all, a blind paste (unverified) is allowed — because "which app" is a much smaller unknown than "focus is still moving," and the user is demonstrably looking at a known, stable app.

This whole engine is built against **protocols, not concrete macOS calls** (`Protocols.swift` defines `AccessibilityTarget`, `FocusResolving`, `ClipboardPasting`, `KeyTyping`, `AppSwitchTracking`), with the only file that touches real AX/CGEvent/NSPasteboard APIs being `RealAdapters.swift`. That split is what makes the 12 Swift Testing (`@Test`) unit tests in `InjectionEngineTests.swift` possible without a live accessibility tree — they drive the decision logic with fakes.

### The dictation coordinator is a hexagonal core with injected adapters

`createDictationIntake()` doesn't know what "transcription" or "delivery" concretely *are* — it's handed four adapters (`transcription`, `contextDetection`, `breakPlacement`, `delivery`), asserts each one exposes the method it needs at construction time (`assertAdapter`), and the entire pipeline logic in [§4](#4-walking-one-dictation-end-to-end) is written purely against those interfaces. `main.js` is what wires the real HTTP/stdio adapters in. This is a ports-and-adapters (hexagonal) shape, done specifically so that `dictationCoordinator.test.js` (408 lines — the single largest test file in the repo) can drive every branch of the pipeline logic — every combination of held/failed/delivered/no-speech, every branch of break-placement eligibility — against fakes, with zero real subprocesses, zero real network calls, and zero flakiness from timing.

<a id="licensing-drove-a-real-model-choice"></a>
### Model licensing drove an actual model choice, not just a footnote

Before committing to a rewrite model, we did primary-source licensing research (`docs/research/model-licensing.md`) rather than assuming "open weights = fine to ship." The finding: **Llama 3.2's Community License is not OSI open source** (it fails the Open Source Definition's "no field-of-use restriction" clause via its Acceptable Use Policy, which bans things like professional/medical advice use and — critically for a *tool* rather than a fixed product — includes an "or allow others to use it for [prohibited purposes]" clause that a fully local, offline app has no technical way to enforce). It also requires shipping the license text, a "Built with Llama" display, a `Notice` file, and an indemnity obligation to Meta — none of which are compatible with a simple MIT installer story. That research is *why* the actual shipped model is **SmolLM2-1.7B-Instruct under Apache 2.0** — permissive, ungated, no acceptable-use restriction, no display requirement. This is a good example, if asked, of doing due diligence on a dependency before it's load-bearing rather than after.

### Build-time model acquisition, not first-run download

`npm install` compiles whisper.cpp and llama.cpp from **pinned commits** (verified against the resolved git hash, not just a tag that could move) and downloads both models from **pinned Hugging Face revisions**, each SHA-256 checked (`scripts/model-artifacts.mjs`, `scripts/fetch-llama.sh`). This means: no first-run "downloading models..." UX to design yet, no first-launch network dependency, and a build that either fully succeeds or fails loudly — never a partially-working install with a silently wrong model file. The cost is a long, network- and compile-time-heavy `npm install` (compiling two C++ projects with Metal support, downloading ~1.15 GiB of weights) — acceptable for a dev-focused pre-alpha, revisited before a public release.

### Single-instance lock

`app.requestSingleInstanceLock()` is the very first thing that runs, before any window, tray, or subprocess exists. Without it, a second accidental `npm start` (or a forgotten already-running instance) would spawn a second tray icon, a second overlay stacked on the first, a second hotkey helper racing the first for the same global combo, and duplicate model servers. This is the kind of bug that's invisible in isolated testing and infuriating in practice — worth mentioning as an example of thinking about the *running system*, not just the code path.

## 6. Testing philosophy

The project draws a hard, explicit line between what's automatable and what needs a human on a real Mac, and treats both as first-class rather than letting the untestable half go unexamined.

**Automated (CI + `npm test`):**
- Unit tests for every pure-logic module: `rules.js` (filler stripping, spoken punctuation, run-on segmentation — tested against specific input/output pairs, not snapshots), `breakPlacementHttpAdapter.js` and `repairBreakIndices()` (malformed-reply repair logic), `dictationCoordinator.js` (the full state-machine of outcomes, using fake adapters), `modelSupervisor.js` (spawn/crash/restart behavior, using an injected fake `spawn`), `settingsStore.js` (hotkey validation, persistence), `overlayPosition.js` (pure geometry).
- 82 JS test cases (Vitest + `node:test`) plus 12 Swift Testing cases for `InjectionEngine`.
- `tsc --noEmit` type checking and a full Vite production build on every PR (`.github/workflows/build.yml`, `macos-latest`).
- Every supervisor/adapter is built to accept **injected fakes** for its side effects (`spawn`, `fetch`, timers, `now()`) specifically so timing-dependent and process-dependent logic can be tested deterministically and instantly, with no real subprocess or real clock involved.

**Explicitly not automatable, and covered by a documented manual procedure instead** (`docs/testing/hotkey-transcribe-manual-check.md`, driven by `scripts/verify-dictation-pipeline.sh`): the real global hotkey and its OS permission dance, real microphone capture, macOS's permission prompts themselves, whether the overlay's frosted-glass vibrancy actually renders (vs. just not crashing), whether the waveform feels responsive, and — the big one — **cross-application text injection**, because a terminal's scrollback, an Electron app's AX tree, and a native Cocoa text field all behave differently and none of that can be driven headlessly. The manual-check doc is explicit about *why*: "this real cross-app testing... exercises the decision logic against fakes but cannot confirm how a real app handles paste or synthesized keystrokes." That's an honest acknowledgment that unit-testing `InjectionEngine`'s decision logic and *actually verifying it works in Slack* are two different claims, and only the first one is currently backed by CI.

**Spikes and prototypes as a methodology, not just scratch code.** Before several hard decisions, we built small, disposable, heavily-instrumented experiments and kept the data:
- `spike/llm-cleanup-latency/` — the ADR-0001 measurement (latency + quality of LLM cleanup vs. rules).
- `spike/break-position-67/` — measuring paragraph break placement quality/consistency.
- `prototypes/injection-62/` and `prototypes/injection-thresholds-74/` — a browser-based simulation of the injection fallback ladder's decision logic, and a Swift probe for measuring real settle-guard thresholds, *before* those thresholds were hardcoded into `Config.swift`.
- `prototypes/context-detection-spike/` — an extensive series of shell-driven probes (`focus-retry`, `controlled-ab`, `jetbrains-knob-ab`) measuring how reliably the AX API resolves focus across different apps and timing conditions.
- `prototypes/tcc-attribution-46/` — an isolated experiment into which macOS process a given TCC permission grant (Microphone/Accessibility/Input Monitoring) actually attaches to when launched from Terminal vs. `open` vs. a packaged app — directly informing the "permission identity across rebuilds is still being worked out" caveat in the README.

Each of these has its own `README.md` and, in most cases, a `RESULTS.md` or `FINDINGS.md` — the discipline is: **measure before committing to a design, and keep the evidence next to the decision**, rather than trusting intuition or shipping a guess.

## 7. How we work: process and rigor

- Two contributors, working in parallel per `ROADMAP.md`: one shared foundation built together (Phase 0/1), then split into two independent tracks designed to rarely touch the same files (Track A: input/delivery/packaging; Track B: context awareness/cleanup/break-safety), specifically so neither person blocks the other.
- **Every PR reviewed by the other person before merge — no self-merges.** This is the project's stated definition of "held accountable," and it shows in the commit history (`Merge pull request #N from ...` on almost every feature).
- **Every phase ends in a tagged, runnable build**, not just merged code — `v0.1` exists as an actual git tag ("It types" — the Phase 1 milestone: global hotkey, text injection, tray states, live sound level, all working with no context-awareness or LLM cleanup yet). Since that tag, 214 further commits have landed (as of this writing), moving into Phase 2 territory: the settings UI and hotkey remapping, the context-detection/break-safety/rules-cleanup work, and — ahead of the roadmap's original Phase 3 placement — the `llama-server` plumbing, now used for break placement.
- **Issues are the spec.** GitHub Issues carry design discussion and decisions (`docs/agents/issue-tracker.md` documents the conventions); ADRs (`docs/adr/`) capture decisions that need to survive independent of any one issue thread, including tracking when a later issue *partially supersedes* an earlier ADR rather than silently contradicting it (see ADR-0001's own superseded-by-#45 header).
- **A living project glossary** (`CONTEXT.md`) defines the exact vocabulary the codebase and its docs commit to using, and — just as importantly — lists terms to *avoid* for each concept (e.g., prefer "Dictation" over "utterance/recording/session"), so that naming drift doesn't quietly diverge from the model in people's heads. See [§8](#8-vocabulary--the-projects-own-glossary).
- **Model roles are named by the role they fill, never by the model that fills it** (from `CONTEXT.md`: "Transcription model server," "Rewrite model server" — not "whisper" or "llama-server" — because *which* model occupies a role is treated as a separate, still-open question). This is why the codebase's function/variable names read as role-based rather than vendor-based.

## 8. Vocabulary — the project's own glossary

Worth knowing cold, since these are the exact words the codebase and its docs use (full definitions in `CONTEXT.md`):

- **Dictation** — one complete act of speaking and having the resulting text land at the cursor. Begins at push-to-talk key-down, ends when text lands.
- **Dictation latency budget** — end-of-speech to text-landing, committed under 1 second. Ends where the *user* can see it end, so delivery cost is inside the budget, not outside it.
- **Provisional text** — text the transcription server has produced *before* key-up. Never shown, never placed — more audio can still change it.
- **Held result** — finished, correctly-transcribed text that could not be placed at the cursor. Lives in the overlay for manual copy. Explicitly *not* called a "failed dictation," because the transcription succeeded — only placement didn't.
- **Voice edit** — a rewrite of already-selected text, explicitly requested by a spoken command. Distinct from dictation: the user asks for it and expects to wait. Not built yet.
- **Resident** — a model server that's already loaded, so a request pays inference cost only, never load cost.
- **Rules cleanup** — the deterministic, non-model tidying applied to every dictation. Does everything except break placement, which it defers to the rewrite model server.
- **Context detection** — resolving frontmost app + focused field via AX. An input to break-safety, not the decision itself.
- **Break-safe application** — an app where a literal line break can't submit/send something. Deny-by-default.
- **Break placement** — *where* paragraph breaks go, decided by the rewrite model server, answered as sentence numbers, never as rewritten text.

## 9. War stories worth telling in an interview

These are the kind of specific, slightly weird bugs/decisions that make a technical conversation feel real rather than rehearsed:

- **Why the hotkey is `Control+Option+D` and not `Cmd+Shift+D`.** The original combo made AppKit play the system alert beep in any app without a matching menu item, because a Cmd-combo that doesn't resolve to a menu equivalent triggers that beep — and the beep got captured at the start of the recording, which whisper then confidently hallucinated as the text `"[Music]"`. Control+Option isn't treated as a menu-equivalent shortcut, so nothing beeps. A one-line-sounding config change with a genuinely funny root cause.
- **An `AudioWorkletNode` doesn't need a fake destination connection to keep running, and adding one is actively dangerous.** Early instinct was to route the capture worklet through a zero-gain `GainNode` into `context.destination` as "insurance" against the browser not pulling an unconnected node. Primary-source research into the Web Audio spec and Chromium's own source showed the opposite is true: an `AudioWorkletNode` fed by a live capture track registers itself on an explicit "automatic pull" list *at construction*, specifically for the unconnected case — and the moment you connect its output to anything, Chromium **removes it from that list** and assumes the thing you connected it to will pull it instead. If that chain doesn't itself reach the real destination, the worklet silently stops being pulled at all. The "safety net" would have converted a working design into one that quietly breaks the moment a future refactor touches the connection graph. (`electron/capture/capture.js`'s worklet is deliberately left unconnected — see `docs/research/issue-33-electron-mic-capture.md`.)
- **`NSWorkspace.shared.frontmostApplication` goes stale on the thread that needs it.** The accessibility-helper's main thread spends its life blocked in `readLine()` (waiting for the next command) and making AX calls — it never pumps a run loop. `NSWorkspace`'s frontmost-app property is notification-driven internally, so reading it directly from that thread returns a frozen, possibly-ancient value. The fix: a dedicated background thread that does nothing but pump a run loop and cache the current frontmost app under a lock, so the main thread always reads a live value instead of whatever was true the last time it happened to check.
- **The overlay briefly regressed to the wrong size after a merge**, resizing back to a pre-redesign `180x52` instead of the new `220x56` resting size — caught and fixed by pulling the resting size into one named constant (`OVERLAY_RESTING_SIZE`) that both the window-creation code and the hide-after-recording code read from, specifically so the two can't drift apart again.
- **Vibrancy on a frameless, transparent, always-on-top window needed to be set twice.** Passing `vibrancy: "hud"` to the `BrowserWindow` constructor wasn't reliably enough on some Electron/macOS combinations for a frameless+transparent window; calling `setVibrancy("hud")` again *after* the native window actually exists is the documented workaround, and it's called explicitly in `main.js` rather than trusted to the constructor alone.
- **Why the capture window keeps the mic stream open for the app's whole life rather than per key-press.** Not a guess — see [§4](#4-walking-one-dictation-end-to-end) and the dedicated research note `docs/research/issue-33-electron-mic-capture.md`, which found a documented macOS/Chromium behavior of deferring audio stream starts by up to 5 seconds around sleep/wake, which would land directly on a user's very first dictation after opening their laptop lid if capture were acquired per press.

## 10. Where we actually are vs. the roadmap

The roadmap (`ROADMAP.md`) defines five phases. Where the code actually stands:

- **Phase 0 (Bootstrap) — done.** Electron+React+Vite scaffold, whisper.cpp compiled from a pinned tag with a resident supervised server, one hotkey wired end to end, CI build check, branch protection.
- **Phase 1 (v0.1: "It types") — done, tagged.** Global push-to-talk via the native hotkey helper, text injection via the native accessibility helper, tray icon states, a live sound-level waveform overlay, and audio capture wired through the hidden renderer.
- **Phase 2 (v0.2: two tracks) — substantially in progress, not yet tagged.** Track A items (build hardening, cross-app injection hardening, code signing, auto-update) are mostly still open — the injection fallback ladder and its settle-guard thresholds are built and unit-tested, but real cross-app verification (terminals, Electron apps) is still a manual-check item, and there's no signing/notarization/auto-update yet. Track B items are largely *shipped*, ahead of where the roadmap doc's own text expected: context detection via AX, a break-safe allow-list (small, hardcoded, not yet user-editable), the rules-cleanup profile with its two modifiers (one-line field, break-safe app), and — notably — break placement via the rewrite model server, which the roadmap doc itself flagged as a possible ordering conflict ("either this moves up into Phase 2, or ships in v0.3"). It shipped in Phase 2.
- **Phase 3 (v0.3: deepen) — llama-server plumbing done early** (folded into the break-placement work above, rather than arriving separately as originally planned); codebase vocabulary biasing and voice-driven editing are both **not built**.
- **Phase 4 (v1.0: polish/launch) — not started.** No functional permission-probing at launch, no user-editable break-safe list, no release automation, no public launch materials.

The honest one-sentence summary: **the core loop is real and it works, safety-conscious design is genuinely built in rather than bolted on, and everything left is either "harden what exists across more apps" or "add the two headline differentiator features that don't exist yet."**

## 11. What's unfinished, fragile, or deliberately deferred

Good answers to "what would you improve/what's the biggest risk right now":

- **No code signing or notarization.** The DMG is unsigned; macOS Gatekeeper will warn on it, and a revoked/blocked Electron build has already bitten this project once (see the commit history around "bump Electron off a notarization-revoked major").
- **Permission identity across rebuilds is unresolved.** Whether macOS attributes a given permission grant to "Terminal," "Electron," or "OpenStream" can shift between runs and builds — actively researched (`prototypes/tcc-attribution-46/`) but not yet resolved into a shipped fix.
- **The break-safe app allow-list is tiny and hardcoded** (4 apps) and not yet user-editable — a real usability gap for anyone dictating into an app not on that list, even though the *reason* for the restriction (safety) is sound.
- **Cross-app injection is verified manually, not in CI**, and known-hard cases (terminal scrollback, Electron/Chromium AX trees needing `AXManualAccessibility` forced on) are called out explicitly as needing more real-world testing, not just more unit tests.
- **Cold start is slow**: 15-20 seconds for `whisper-server` to load its Metal shaders on first launch, with no progress UI for it yet.
- **The two headline differentiators — vocabulary biasing and voice edits — don't exist yet.** Everything shipped so far is the "safe, fast, correct baseline"; the features that would make this meaningfully different from macOS's built-in dictation for a developer are still ahead.
- **Rules cleanup's run-on sentence splitter is a known-imperfect heuristic** (conjunction-based, can split mid-clause on long paragraphs) — an accepted, documented trade-off rather than an oversight, but still a real limit on output quality for long dictation.
- **No automated latency regression test** — the sub-1-second budget is checked by a human running the manual-check wizard and reading a console log, not by CI.

## 12. File map

A guide to where things live, for quickly orienting in the codebase:

```
electron/
  main.js                      — app lifecycle, window/tray creation, IPC wiring, glue
  dictationCoordinator.js      — the pipeline core (transcribe → context → cleanup → breaks → deliver), adapter-based
  modelSupervisor.js           — generic spawn/restart-on-crash wrapper, used by both model servers
  whisperServer.js             — whisper-server supervisor config (port 8178)
  rewriteModelServer.js        — llama-server supervisor config (port 8179)
  transcriptionHttpAdapter.js  — HTTP client for whisper-server's /inference
  breakPlacementHttpAdapter.js — HTTP client for llama-server's chat-completions, + reply parsing
  cleanup/rules.js             — the deterministic text-cleanup engine
  breakSafety.js               — the break-safe app allow-list
  paragraphBreaks.js           — sentence splitting + applying break decisions to text
  hotkeyHelper.js              — supervises the Swift hotkey-helper, parses its stdout events
  accessibilityHelper.js       — supervises the Swift accessibility-helper, request/response over stdio
  pushToTalkCoordinator.js     — key-down/key-up state machine
  heldResultController.js      — manages the "held result" overlay state
  settingsStore.js             — hotkey persistence + validation, JSON file on disk
  overlayPosition.js           — pure geometry for bottom-centering the overlay
  capture/                     — hidden BrowserWindow: mic capture, WAV encoding, sound level
  overlay/                     — the glass HUD window: waveform, held-result UI
  *.test.js                    — one test file per module above, using node:test

native/
  hotkey-helper/                       — Swift, Quartz event tap, Input Monitoring only
  accessibility-helper/                — Swift, AX API + injection engine, Accessibility only
    Sources/AccessibilityInjection/    — the injection engine as a library, protocol-driven
      InjectionEngine.swift            — the 3-rung fallback decision logic
      Protocols.swift                  — the seams that make it testable
      RealAdapters.swift               — the only file that touches real macOS APIs
      Config.swift                     — timing thresholds (settle guard, deadlines)
    Tests/AccessibilityInjectionTests/ — Swift Testing (@Test) unit tests against fakes

src/                            — the React settings window (Vite-built)
  HotkeySettings.tsx             — the one real UI feature so far: hotkey remapping
  hotkey/captureHotkey.ts        — pure logic for validating a captured key combo
  hotkey/keycodeMap.ts           — DOM KeyboardEvent.code ↔ macOS virtual keycode tables

scripts/
  model-artifacts.mjs            — pinned-source clone + build + weight download/verify, for both model roles
  fetch-llama.sh                 — llama-server prebuilt binary + SmolLM2 weight fetch/verify
  build-hotkey-helper.sh / build-accessibility-helper.sh — swift build wrappers
  verify-dictation-pipeline.sh   — the manual end-to-end check wizard

docs/
  adr/                           — architecture decision records (start here for "why")
  research/                      — deep primary-source investigations backing specific decisions
  testing/                       — manual-check procedures for what CI can't cover
  agents/                        — how AI coding agents should navigate this repo's own docs

spike/, prototypes/              — throwaway, heavily-instrumented experiments run before committing
                                   to a design; each has its own README and RESULTS/FINDINGS file

CONTEXT.md                       — the project's own glossary; ROADMAP.md — the phased plan
```

---

*This document should be kept current as the project moves past what it describes. If a section starts describing something that's no longer true, fix it there rather than leaving it stale — the same standard the project holds its ADRs to.*
