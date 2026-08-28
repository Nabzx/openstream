# OpenStream — Engineering Deep Dive (Phase 3 checkpoint)

This document exists for one purpose: so that either of us can explain this project in depth, from memory, in an interview — what it is, how it works, why it's built this way, what it cost us to learn that, and what's still missing. It is not marketing copy. Where something is unfinished or fragile, it says so.

This is the third checkpoint in `docs/progress/` — written at the close of Phase 3 (`v0.3`, tagged). [phase-2-progress.md](phase-2-progress.md) is the previous one. Read this top to bottom once, then use it as a reference; where a section hasn't materially changed it says so and moves on.

**Contents**
1. [What OpenStream is](#1-what-openstream-is)
2. [Tech stack, and what changed](#2-tech-stack-and-what-changed)
3. [Process architecture](#3-process-architecture)
4. [Walking one dictation, and one voice edit, end to end](#4-walking-one-dictation-and-one-voice-edit-end-to-end)
5. [New architectural decisions and findings this phase](#5-new-architectural-decisions-and-findings-this-phase)
6. [Testing philosophy](#6-testing-philosophy)
7. [How we work: process and rigor](#7-how-we-work-process-and-rigor)
8. [Vocabulary](#8-vocabulary)
9. [War stories worth telling in an interview](#9-war-stories-worth-telling-in-an-interview)
10. [Where we actually are vs. the roadmap](#10-where-we-actually-are-vs-the-roadmap)
11. [What's unfinished, fragile, or deliberately deferred](#11-whats-unfinished-fragile-or-deliberately-deferred)
12. [File map](#12-file-map)

---

## 1. What OpenStream is

Unchanged from Phase 1 — a **local-first voice dictation app for Apple Silicon Macs**, aimed at developers, **deny-by-default on line breaks**. See [phase-1-progress.md §1](phase-1-progress.md#1-what-openstream-is).

What's different: **`v0.3` is tagged**, and one of the two "headline differentiator" features that didn't exist through Phases 1–2 now does — **voice editing** — though not in the form the roadmap first imagined. It ships as a *deterministic spoken-command transform layer*, not an LLM rewrite (see [§4](#4-walking-one-dictation-and-one-voice-edit-end-to-end) and [§5](#voice-editing-is-deterministic-because-the-model-couldnt-do-it-and-didnt-need-to)). The other differentiator, codebase vocabulary biasing, is built but deliberately shelved post-v1.0. The app also grew a real **desktop window** this phase (Home + Settings, navigable, styled), pulled forward from Phase 4.

## 2. Tech stack, and what changed

Full table in [phase-1-progress.md §2](phase-1-progress.md#2-tech-stack-and-why-each-piece); Phase 2's corrections still stand. This phase:

- **A renderer that's now more than one form.** `src/` was a single unstyled `HotkeySettings` component through Phase 2. It's now a two-page shell (`src/App.tsx` — Home / Settings toolbar tabs), a design-token stylesheet (`src/index.css`, light + dark off `prefers-color-scheme`), and a small component set (`src/components/`, `src/pages/`). Still React 18 + TS + Vite, still settings-window-only.
- **A new pure Electron-side module pair for voice editing** — `electron/voiceEditCommands.js` (the fixed command grammar + string transforms, zero I/O) and `electron/voiceEditCoordinator.js` (the intake pipeline, ports-and-adapters like `dictationCoordinator.js`). No new runtime dependency; the rewrite model server is *not* on this path.
- **A `prepare-commit-msg` git hook** (`.githooks/`, wired via `postinstall`) that strips the `Co-authored-by: Claude` trailer — see [§9](#9-war-stories-worth-telling-in-an-interview).
- **Testing grew from 165 to ~223 automated cases** — new pure-logic suites for the command grammar, the voice-edit coordinator, window geometry, and navigation state.

## 3. Process architecture

Unchanged — see [phase-1-progress.md §3](phase-1-progress.md#3-process-architecture--the-eight-things-running-at-once). The accessibility-helper gained one command, `selection` (a get-only read of `kAXSelectedTextAttribute`), used at push-to-talk key-down to tell a voice edit from a dictation. The `RealAppSwitchTracker` inside that helper changed how it works (poll, not notification) — see [§5](#173-the-notification-was-fine-the-run-loop-was-not).

## 4. Walking one dictation, and one voice edit, end to end

**Dictation** is unchanged from [phase-2-progress.md §4](phase-2-progress.md#4-walking-one-dictation-end-to-end).

**A voice edit** is the new path, and it deliberately reuses almost everything:

1. **Key-down.** `beginPushToTalk()` fires the accessibility-helper's `selection` command (async, not awaited — a slow or failed read must never delay recording) and starts audio capture as normal.
2. **Key-up, then `recording-complete`.** If the key-down read returned a non-empty selection under 5,000 chars, the recording is routed to `voiceEditIntake.complete(wav, { selection, focusContext })` instead of `dictationIntake`.
3. **Transcribe the command.** Same transcription adapter, no vocabulary prompt.
4. **Match the grammar** (`interpretVoiceEditCommand`). The transcript is normalised and matched against a fixed alias set — 8 case conversions (`snake_case`, `camelCase`, `SCREAMING_SNAKE`, …), 6 wraps (`"…"`, `` `…` ``, `(…)`, …), and bullet/numbered lists from comma-or-"and"-delimited items. No match → outcome `unrecognised`, selection untouched. A recognised command applied to the wrong shape of text (an identifier case on obvious prose, a list command on a paragraph) → `declined`.
5. **Transform** the captured selection with a pure `string -> string` function. Sub-millisecond.
6. **Break-safety still applies.** A result with newlines into a non-break-safe app or a one-line field is **held** for manual paste, not flattened — a flattened bullet list is useless.
7. **Deliver** through the existing injection engine — rung 1 (`kAXSelectedTextAttribute` set) already replaces a selection. The settle guard holds the result if focus moved during the ~300 ms transcribe.

The point of the shape: a voice edit is closer to `rules.js` than to an LLM feature. No model, no response contract to defend, no multi-second wait.

## 5. New architectural decisions and findings this phase

### Voice editing is deterministic because the model couldn't do it — and didn't need to

The roadmap's plan was: send the selection + a free-form command to the rewrite model server, have it rewrite in place. Before building that, a throwaway spike (`prototypes/voice-edit-fidelity-222/`, run against the real pinned `llama-server` + SmolLM2-1.7B on the target Mac) measured it:

- **Latency was fine** — warm median ~900 ms, well inside "multi-second is acceptable" for an explicitly-requested edit.
- **Fidelity was not.** Under a plain prompt, SmolLM2 returned the selection *unchanged* on 6 of 15 cases, including "make this a bullet list". A stricter prompt didn't help (7/15 unchanged). A one-shot example made it *worse* — it then over-generalised, sprayed stray `-` markers onto plain sentences, did the wrong transform, and flattened a 25-word sentence to "- Latency dropped by 43 milliseconds". Same shape as #67's break-placement finding: the example doesn't remove the bias, it *is* the bias.
- **The commands it did handle reliably** — `snake_case`, `camelCase` — are deterministic string transforms. Routing a *fixed* command set through a flaky 1.7 B model buys nothing over a lookup table and keeps every risk.

So v0.3's voice editing is a fixed deterministic set, no model call. Semantic commands ("shorter", "fix grammar", "rephrase") are out of scope until a more capable model fills the rewrite role — re-testing against Qwen3-1.7B / Granite-3.3-2B is #222, moved to Phase 4.

### #126: no fine-tune is justified for structural annotation

Direct answer to "should we fine-tune the model for dictation annotation", framed as a question the way this repo settles model decisions. **No.** Break placement: prompting the existing model already clears the bar (#67 — 12/12 format compliance, breaks judged good). List boundaries: the #125 spike's combined two-line contract (`BREAKS: / LIST:`) *regresses* break placement (matched 1/10 on a clean Metal re-run) and over-triggers lists (false-positive 5/10), and the two-line reply runs ~1.07 s — 3× over the 0.39 s warm headroom. But that's a "one small model, two structured jobs, one prompt" problem, and the cheaper fixes (a separate list call, a bigger model) aren't exhausted — fine-tuning stays a last resort with no demand, since list rendering is gated off and nobody's asked for it.

### #173: the notification was fine; the run loop was not

`RealAppSwitchTracker` observed `NSWorkspace.didActivateApplicationNotification` from a background thread that pumps its own run loop — and it went stale when the app was launched from an IDE-integrated terminal. Phase 2's working theory was a TCC / process-attribution quirk (#46). A minimal probe (`prototypes/ax-notification-terminal-173/`) **disproved it**: the notification is delivered fine from every launch context tested, VS Code included.

The real cause: `NSWorkspace` notifications are delivered on the **main thread's run loop**, which the helper never pumps — its main thread is parked in `readLine()` for the stdin command loop. The background observer never fired. The probe only "worked" because it *also* ran `RunLoop.main.run()`; remove that line and it reproduces the bug identically. Fixed (#226) by polling `NSWorkspace.shared.frontmostApplication` directly on a 250 ms timer on the observing thread — the exact read the probe's ground-truth poll did, accurate every time.

### The desktop app is a `regular` Dock application, not an accessory

Settled on the [#206](https://github.com/Nabzx/openstream/issues/206) map. A research pass (`docs/research/issue-208-electron-dock-focus.md`) established that a Dock-less "accessory" Electron app cannot reliably raise its own window, is absent from Cmd-Tab, and — having no menu bar — gives its own text fields no clipboard shortcuts. So `app.dock.hide()` is gone; OpenStream is a normal Dock app with a real application menu. The window (`titleBarStyle: 'hiddenInset'`, resizable, geometry persisted) is a two-tab shell. The "never take focus from the target app during a dictation" constraint is kept by discipline — the window is only ever opened from an explicit user action, never from the pipeline (written into `AGENTS.md`).

## 6. Testing philosophy

Unchanged core discipline — see [phase-1-progress.md §6](phase-1-progress.md#6-testing-philosophy). This phase leaned hard on **spikes before building**: three of the four significant decisions above (`voice-edit-fidelity-222`, `ax-notification-terminal-173`, the #125 Metal re-run) were settled by a throwaway measurement harness producing real numbers, not by argument. Two of those spikes *overturned* the plan they were testing — voice editing stopped being an LLM feature, and #173's root cause turned out to be the opposite of the standing theory.

**Manual verification was deliberately batched and deferred.** The voice-edit matrix, the IDE-terminal dictation path, and the end-to-end dictation pass all need a real Mac and real apps. Rather than gate the `v0.3` tag on them, they're collected into one pre-launch verification pass ([#228](https://github.com/Nabzx/openstream/issues/228)) to run against the near-final build. `v0.3` is tagged at the feature-complete point; the checks happen before `v1.0`.

## 7. How we work: process and rigor

Same foundation — [phase-1-progress.md §7](phase-1-progress.md#7-how-we-work-process-and-rigor). This phase:

- **`v0.3` is tagged.** The milestone closed with voice editing, the #173 fix, and the #126 decision — plus the desktop UI pulled forward from Phase 4.
- **A feature was re-scoped by its own spike, in the open.** #17 started as "send the selection to the LLM". The #222 spike's data reshaped it into a deterministic transform layer before any production code was written — the decision and the evidence are both on the issue.
- **Cross-contributor conflict handled by carving, not forcing.** #215 (a parallel shortcut-system rewrite) landed on `main` mid-phase and collided with the desktop-UI branch across five files. The UI work was re-cut to not touch the hotkey code at all — `HotkeySettings.tsx` stays exactly as #215 left it, its restyle deferred — rather than merging two people's divergent work under time pressure.
- **The commit-attribution problem got a permanent fix.** The `Co-authored-by: Claude` trailer had been rewritten out of history twice; a tracked `prepare-commit-msg` hook now strips it before every commit.

## 8. Vocabulary

Three additions to `CONTEXT.md` this phase, all for voice editing:

- **Voice edit** — reworded: a *transform* of already-selected text via a spoken command, deterministic and model-free in v0.3.
- **Voice-edit command** — the spoken phrase that selects a transform from the fixed grammar. Finite and explicit; an unrecognised phrase leaves the selection untouched.
- **Held edit** — a completed voice-edit result that couldn't be placed (focus moved, or the target can't take the newlines the transform needs). Lives in the overlay for manual copy, like a Held result.

Everything else is unchanged from [phase-1-progress.md §8](phase-1-progress.md#8-vocabulary--the-projects-own-glossary).

## 9. War stories worth telling in an interview

- **The spike that killed its own feature.** Voice editing was going to be the app's one real use of a local LLM. Measuring SmolLM2-1.7B on the actual command set showed it silently returns text unchanged half the time, and the commands it *can* do (`snake_case`, `camelCase`) don't need a model at all. The feature shipped smaller, simpler, deterministic, and more reliable than the original design — because the measurement came before the build, not after.
- **The bug whose fix was the opposite of the theory.** #173's app-switch tracking broke when launched from an IDE terminal. The standing theory (a TCC process-attribution quirk) was wrong: a probe showed `NSWorkspace` notifications arrive fine from every context. The real cause was that the helper observes them on a background run loop while macOS delivers them on the main thread's run loop — which the helper never pumps. The probe only *worked* because it happened to pump the main loop too; that one incidental line was the entire difference between "reproduces the bug" and "doesn't". Good material for "a time the obvious explanation was wrong".
- **A default that wouldn't stay removed.** The coding agent adds a `Co-authored-by: Claude` commit trailer by default; it had been rewritten out of `main`'s history twice and kept coming back every session because it's the harness default. The fix was a `prepare-commit-msg` git hook, tracked in the repo and wired via `postinstall` — the lesson being that a recurring process failure needs a mechanical guard, not a note to remember.
- **See also [phase-2-progress.md §9](phase-2-progress.md#9-war-stories-worth-telling-in-an-interview)** (the three-layer llama-server path bug, the methodology bug in the AX probe, the 5-second cold Chrome AX readiness) — all still good.

## 10. Where we actually are vs. the roadmap

- **Phases 0–2 — done, tagged.** Unchanged.
- **Phase 3 (v0.3: Deepen) — done, tagged.**
  - Voice editing (#17) shipped as a deterministic command layer. Semantic commands deferred behind a better model (#222 → Phase 4).
  - `llama-server` plumbing was already done (folded into break placement in Phase 2).
  - Codebase vocabulary scanner (#16) built and unit-tested but deprioritised post-v1.0; the Settings UI is unhooked, not deleted.
  - #173 (IDE-terminal app-switch tracking) fixed (#226).
  - #126 (fine-tune vs prompt) answered with measured evidence: no fine-tune.
  - **Pulled forward from Phase 4:** the desktop app UI — designed (#206) and built (#212/#220).
- **Phase 4 (v1.0: polish/launch) — not started; better scoped.** Now holds: the pre-launch verification pass (#228), #227 (dictation produces no visible text when launched from a VS Code terminal — needs diagnosis), the semantic voice-edit re-test (#222), restyling `HotkeySettings` once the shortcut work lands (#19), the AX-readiness fallback (#181), the real-dictation eval corpus (#171), and everything from Phase 2's list (signing/notarization/#11, permission-probing at launch).

The honest one-sentence summary: **both headline differentiators now have a real answer — voice editing ships (deterministic subset), vocabulary biasing is built and shelved — and v0.3 is feature-complete with its manual verification deliberately queued for launch prep rather than pretended-done.**

## 11. What's unfinished, fragile, or deliberately deferred

Carried forward from [phase-2-progress.md §11](phase-2-progress.md#11-whats-unfinished-fragile-or-deliberately-deferred), all still true: no code signing/notarization, permission identity across rebuilds unresolved, the break-safe app list tiny and hardcoded, cold start slow, the run-on splitter a known-imperfect heuristic, no automated latency regression test, no `.nvmrc`, nothing guarding against a second silent duplicate build path.

New or changed this phase:

- **Voice editing has no cancel.** Pressing the hotkey again during the ~300 ms transcribe window doesn't abort an in-flight edit — a partial cancel was judged worse than none. Deferred.
- **`HotkeySettings.tsx` renders unstyled inside the new Settings page.** The desktop-UI branch was cut to not touch the hotkey code (a parallel rewrite is in flight, #215), so that one component sits as a plain `.setting` section next to the carded rest until its restyle (#19).
- **#227: dictation produces no visible text when launched from a VS Code integrated terminal.** Observed while verifying the #173 fix. Unknown yet whether it's a lost Accessibility grant on rebuild (the #46/#88 issue), the #173 fix being incomplete, or an injection problem — needs a diagnostic pass. Filed Phase 4.
- **All of v0.3's manual verification is outstanding by design** — the voice-edit matrix, the IDE-terminal path, the end-to-end dictation check, latency measurement. Batched into #228, to run before the `v1.0` tag.

## 12. File map

Extends [phase-2-progress.md §12](phase-2-progress.md#12-file-map). Additions this phase:

```
electron/
  voiceEditCommands.js         — the fixed spoken-command grammar + pure string transforms (#17)
  voiceEditCoordinator.js      — voice-edit intake pipeline, adapter-based like dictationCoordinator
  windowState.js               — pure geometry: clamp a saved window rectangle to the display
  accessibilityHelper.js       — + getSelection() (the native `selection` command)

native/accessibility-helper/
  Sources/.../RealAdapters.swift — RealAppSwitchTracker now polls; + readSelectedText() on the target
  Sources/accessibility-helper/main.swift — + the `selection` command

src/
  App.tsx                       — the two-tab shell (Home | Settings)
  nav.ts                        — the page list, shared by the shell and its test
  index.css                     — the design-token layer (light + dark), replacing the 78-line stub
  components/                    — Icons, KeyCaps, StatusPill, Toggle
  pages/                         — Home.tsx (status + health), Settings.tsx

.githooks/prepare-commit-msg     — strips the Co-authored-by: Claude trailer; wired via postinstall

docs/
  research/issue-208-electron-dock-focus.md — Dock icon / activation policy / window focus for a menu-bar Electron app
  testing/voice-edit-manual-check.md         — the pre-launch voice-edit matrix
  progress/phase-3-progress.md               — this file

prototypes/
  voice-edit-fidelity-222/       — spike: can a prompted local model follow an edit command (answer: no)
  ax-notification-terminal-173/  — probe: does NSWorkspace notification delivery break from an IDE terminal (answer: no)
```

---

*This document should be kept current as the project moves past what it describes. When Phase 4 closes, add `phase-4-progress.md` alongside this one rather than overwriting it.*
