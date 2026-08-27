# OpenStream — Engineering Deep Dive (Phase 2 checkpoint)

This document exists for one purpose: so that either of us can explain this project in depth, from memory, in an interview — what it is, how it works, why it's built this way, what it cost us to learn that, and what's still missing. It is not marketing copy. Where something is unfinished or fragile, it says so.

This is the second checkpoint in `docs/progress/` — written at the close of Phase 2 (`v0.2`, tagged). [phase-1-progress.md](phase-1-progress.md) is the first, written at the close of Phase 1. Read this one top to bottom once, then use it as a reference; where a section hasn't materially changed since Phase 1 it says so and moves on rather than repeating itself.

**Contents**
1. [What OpenStream is](#1-what-openstream-is)
2. [Tech stack, and what changed](#2-tech-stack-and-what-changed)
3. [Process architecture](#3-process-architecture)
4. [Walking one dictation end to end](#4-walking-one-dictation-end-to-end)
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

Unchanged from Phase 1: a **local-first voice dictation app for Apple Silicon Macs**, aimed at developers, with a core design stance of **deny-by-default on line breaks** — see [phase-1-progress.md §1](phase-1-progress.md#1-what-openstream-is) for the full pitch.

What's different: the project is no longer just "runs from source, has a DMG." **`v0.2` is tagged.** Track A (input/delivery) and Track B (intelligence) both shipped their Phase 2 scope. The two headline differentiators — codebase vocabulary biasing and voice edits — are still *planned but not built*, unchanged from Phase 1, and still worth not over-claiming in conversation. Code signing, notarization, and auto-update were explicitly *moved out* of this phase into Phase 4 (issue #11) — a deliberate call to keep distribution decisions open for as long as possible rather than lock them in before the app itself is ready.

## 2. Tech stack, and what changed

Full table in [phase-1-progress.md §2](phase-1-progress.md#2-tech-stack-and-why-each-piece). Two corrections and one addition:

**`llama-server` was never actually compiled from source, despite what the Phase 1 doc said.** It's fetched as a **prebuilt macOS arm64 binary** from `ggml-org/llama.cpp`'s GitHub releases (`scripts/fetch-llama.sh`), SHA-256 verified, currently pinned to release `b10639`. The Phase 1 doc's "two engines are compiled from a pinned git commit" was already inaccurate when it was written — `scripts/model-artifacts.mjs` had a leftover role compiling `llama.cpp` from an old tag (`b4331`) that silently overwrote the correct prebuilt binary on every `npm install`, and nobody had traced far enough to notice the two build systems disagreed. Removed in #172 — see [§5](#the-app-had-two-competing-build-systems-for-the-same-binary) and [§9](#9-war-stories-worth-telling-in-an-interview). Only `whisper.cpp` is genuinely compiled from source now.

**Testing grew from 94 to 165 automated cases**: 121 `node:test` + 32 Vitest = 153 JS cases (up from 82), plus the same 12 Swift Testing cases for `InjectionEngine` (unchanged this phase). New: `electron/cleanup/realDictation.test.js`, an eval harness for the rules-cleanup engine against real (non-synthetic) dictation samples — see [§6](#6-testing-philosophy).

**A new prototype**: `prototypes/electron-ax-tree-10/`, a Swift measurement harness for accessibility-tree-readiness timing on Chromium/Electron targets — see [§5](#chrome-and-vs-code-have-very-different-ax-readiness-latency-and-neither-poke-mechanism-actually-works) and [§9](#9-war-stories-worth-telling-in-an-interview).

## 3. Process architecture

Unchanged from Phase 1 — see [phase-1-progress.md §3](phase-1-progress.md#3-process-architecture--the-eight-things-running-at-once) for the full diagram and the two-Swift-helpers/two-IPC-shapes reasoning, both still accurate. One correction worth knowing: `llama-server` runs from `resources/bin/llama/llama-server`, a **subdirectory**, not flat under `resources/bin/` — its dylibs are `@loader_path`-relative and have to ship alongside the binary. `electron/rewriteModelServer.js` pointed at the wrong (flat) path from the day it was written until #172 fixed it this phase; see [§9](#9-war-stories-worth-telling-in-an-interview) for the full story of why that bug was so hard to see.

## 4. Walking one dictation end to end

The pipeline shape from [phase-1-progress.md §4](phase-1-progress.md#4-walking-one-dictation-end-to-end) is unchanged — transcribe, detect context, rules cleanup, maybe ask the rewrite model for break placement, deliver. What grew this phase is **what rules cleanup actually does** to the transcript before it's judged "finished" (`electron/cleanup/rules.js`, all still under the 0.1–1.0ms budget):

- **Self-correction** — "scratch that" / "delete that" discards the clause it corrects, including reaching back across a full sentence boundary as of #174 (a real bug: it used to only cross a comma, so "X. Scratch that." left the mistake X in place and just silently dropped the trigger words — worse than doing nothing, since the output looked clean). Deliberately still doesn't fire on an unpunctuated "X scratch that Y" — that shape is structurally identical to real dictated content like "delete that file," and there's no way to tell them apart without a pause.
- **Spoken numeric entities** — phone numbers, dates, times, currency, measurements converted to digit form (#130).
- **Spoken code-structure symbols** — braces, brackets, tab/indent, for dictating into an editor (#128, #129).
- **Spoken list cues** — an explicit "bullet point"/"new bullet" trigger formats a markdown list; deliberately not the ordinal-word heuristic ("first, second, third"), which risks misfiring on ordinary prose (#124).
- **Spoken emoji and casual punctuation** — explicit trigger phrases only, e.g. "smiley face emoji" (#131).
- **"Spell that out" mode** and currency handling for names/confirmation codes (#132).

Same design principle throughout: every one of these requires an **explicit trigger phrase**, never a heuristic guess at intent, because a false positive silently corrupts dictated content rather than just failing to help.

## 5. New architectural decisions and findings this phase

### The app had two competing build systems for the same binary

`scripts/model-artifacts.mjs` had a `"rewrite"` role — predating #14, which replaced source-compiling `llama.cpp` with `fetch-llama.sh` downloading a prebuilt release — that was never removed. It compiled `llama.cpp` from an old pinned tag (`b4331`) on *every single* `npm install` and copied the result to `resources/bin/llama-server` (flat). Meanwhile `electron/rewriteModelServer.js` had *always* read from that same flat path. `fetch-llama.sh` was correctly fetching and verifying a modern release the whole time — into a subdirectory nothing ever consumed. Bumping the pinned release tag to fix a Metal-shader-compile crash therefore did nothing, twice, before the real cause was found: a stale, silently-rebuilt binary from a completely different, dead code path was winning every time. Fixed in #172 by pointing the consumer at the right path and deleting the dead role outright, not by reconciling the two.

The lesson worth stating plainly: neither build system was individually broken. The bug was that two independent, both-technically-correct-in-isolation acquisition paths existed for the same artifact, and nothing checked they agreed.

### An IDE-integrated terminal can silently break app-switch tracking

`RealAppSwitchTracker` observes `NSWorkspace.didActivateApplicationNotification` to know what app is genuinely frontmost. Launching `npm start` from VS Code's integrated terminal instead of a plain Terminal window reproducibly left it stuck on whatever was frontmost at launch, no matter what real app was switched to or clicked into afterward — confirmed via a diagnostic log showing context detection permission was fine (`trusted=true`) but the tracked app was simply wrong. Working theory, not yet confirmed: this project's own earlier TCC research (`prototypes/tcc-attribution-46/`) already found that launching from an IDE-integrated terminal changes how macOS attributes the spawned process tree for permission purposes; the same attribution quirk may mean the distributed notification never reaches the observer. Filed as #173 for Phase 3 — a real gap given the target audience runs plenty of things from IDE terminals.

### Chrome and VS Code have very different AX-readiness latency, and neither poke mechanism actually works

`enableManualAccessibility()` sets `AXManualAccessibility` on the target's AX element before querying its focused element, intended to force Chromium/Electron to build a full accessibility tree instead of exposing a bare stub. A controlled measurement harness (`prototypes/electron-ax-tree-10/`) found that call has essentially never worked — every set call errored in every trial but one, and even that one success didn't correlate with whether the subsequent query then succeeded. `AXEnhancedUserInterface` (a private alternative used by VoiceOver, per [electron/electron#37465](https://github.com/electron/electron/issues/37465)) fared no better in these trials. What actually determines success is elapsed real time since the target gained genuine focus: a cold click into a Chrome page took over 5 seconds in one measured trial before its AX tree became queryable; the same tab warm was instant. VS Code was consistently near-instant in controlled trials, though the original production bug (`AXError -25212` on live VS Code) proves it isn't reliably under the current 150ms deadline either. A native Cocoa app needed no poke at all.

The consequence: a bigger retry-loop timeout isn't the fix, because 5+ seconds is fundamentally incompatible with the sub-1-second dictation latency budget no matter how generous the window. The right shape — not yet implemented, scoped in #181 — is the same pattern already used for the injection engine's `settleBudgetMs` guard: wait up to a short, deliberately chosen budget, and fall back to a different rung rather than hold up delivery. Remaining unknowns (does this generalize past Chrome to other Electron apps; how tight is VS Code's real number) are tracked as a research ticket, #182, rather than blocking the fix.

## 6. Testing philosophy

The core discipline — automate what's automatable, document a manual procedure for what genuinely needs a human on real hardware, spike before committing to a design — is unchanged from [phase-1-progress.md §6](phase-1-progress.md#6-testing-philosophy). Two additions this phase:

**A real-dictation eval harness for the rules engine** (`electron/cleanup/realDictation.test.js`, `electron/cleanup/fixtures/`, #15). Deliberately separate from the existing TTS-based spike samples in `spike/llm-cleanup-latency/samples.json`, which stay fine for the coarse-invariant and latency-budget checks they were built for but are explicitly unsuitable as an accuracy eval: `say`-generated audio renders a filler like "um" as a crisp lexical word whisper mis-transcribes into a real word, where a genuine human "um" is non-lexical and whisper usually just drops it. The harness fails loudly (not silently passing with zero coverage) while its fixture set is empty — populating it with real recordings is deliberately deferred to Phase 4 (#171), since it needs deliberate, unhurried real-world recording across genuine speech patterns to be worth anything.

**A new prototype methodology entry**: `prototypes/electron-ax-tree-10/` (see [§5](#chrome-and-vs-code-have-very-different-ax-readiness-latency-and-neither-poke-mechanism-actually-works)), built specifically because an earlier, ad hoc round of live probing risked conflating "one AX query happened to succeed" with "a real navigable tree exists" — the harness measures actual tree richness (a capped breadth-first walk), not just query success, and had its own methodology bug caught and fixed before the data could be trusted: its first design measured whatever was frontmost the instant the probe ran, which is necessarily the terminal it was launched from, not the app the operator meant to test. A grace-period countdown fixed it. Worth remembering as a general lesson for building any live-system measurement tool: the human operator's own action of starting the tool is itself an event the tool needs to account for.

## 7. How we work: process and rigor

Same foundation as [phase-1-progress.md §7](phase-1-progress.md#7-how-we-work-process-and-rigor) — issues as the spec, ADRs for durable decisions, a living glossary, role-based naming. What's concretely different this phase:

- **`v0.2` is tagged**, on top of 298 further commits since the `v0.1` tag (as of this writing). The milestone closed with 7 issues resolved.
- **Issues get split and re-scoped mid-investigation, not just closed.** #10 ("harden text injection across app types") was closed as superseded once its investigation produced two more precisely-scoped children: #181 (a concrete Phase 4 fix, once the evidence existed to write one) and #182 (a wayfinder research ticket for what the evidence didn't settle). #174 similarly narrowed mid-fix: the original report treated an unpunctuated self-correction case as equally fixable to the punctuated one, and a deeper look found it genuinely isn't — safely fixing it would reopen a false-positive risk an existing test (`does not treat 'delete that <noun>' as a correction command`) exists specifically to prevent. Recording the correction in the issue thread rather than quietly narrowing the fix mattered more than looking right the first time.
- **A milestone/label mismatch is worth fixing, not just working around.** #11 was labelled `phase-4` but sat in the `v0.2` milestone — caught and corrected (`ROADMAP.md` updated to match) rather than left as a standing inconsistency between two sources of truth for the same fact.

## 8. Vocabulary

Unchanged from [phase-1-progress.md §8](phase-1-progress.md#8-vocabulary--the-projects-own-glossary) — every term defined there (Dictation, Held result, Resident, Rules cleanup, Break placement, etc.) is still exactly how the codebase and `CONTEXT.md` use it. No new formal vocabulary was introduced this phase; the new rules-cleanup behaviors in [§4](#4-walking-one-dictation-end-to-end) are all still just "Rules cleanup."

## 9. War stories worth telling in an interview

- **A three-layer bug that looked fixed twice before it actually was.** `llama-server` crash-looped on a Metal shader compile error. Bumping the pinned release tag looked like the fix, verified in isolation, and changed nothing in the real app — because the app was reading from a completely different path than the one being fetched (see [§5](#the-app-had-two-competing-build-systems-for-the-same-binary)). Worth telling because the lesson generalizes past this one bug: verifying a fix works *in isolation* is not the same claim as verifying it's *actually on the path the running system uses* — and the gap between those two things can be invisible until you specifically go looking for it.
- **A methodology bug in the tool built to find a bug.** The `electron-ax-tree-10` probe's first version measured whatever was frontmost the instant it ran — which is necessarily the terminal you just typed the command in, not the app you switched to. Every trial from that version would have silently measured the wrong thing. Caught by a human running it and reporting the target field said "Terminal" when it should have said "VS Code" — not by anything in the tool itself. A clean example of why raw output needs a sanity check against what you actually expected, not just "did it produce a number."
- **Cold Chrome accessibility readiness took over 5 seconds, once measured properly.** Nobody guessed that number — the working assumption going in was "needs a slightly longer retry loop." Actually measuring it (not just the query succeeding, but the accessibility tree having real depth, not a one-node stub) showed the fix couldn't be a bigger constant at all; the real number was multiple seconds off from anything a sub-1-second product could retry-loop around. Good interview material for "tell me about a time your assumption was wrong and you found out by measuring, not guessing."
- **See also [phase-1-progress.md §9](phase-1-progress.md#9-war-stories-worth-telling-in-an-interview)** for the hotkey-beep, AudioWorkletNode, and stale-NSWorkspace stories — all still accurate and still good material.

## 10. Where we actually are vs. the roadmap

- **Phase 0 (Bootstrap) — done.** Unchanged from Phase 1.
- **Phase 1 (v0.1: "It types") — done, tagged.** Unchanged from Phase 1.
- **Phase 2 (v0.2: two tracks) — done, tagged.** Track A: build-time model fetch hardened (pinned release, HTTP/1.1 retry logic, correct binary path, the dead duplicate build system removed); text injection cross-app hardening produced real measured evidence and split into a scoped Phase 4 fix (#181) plus an open research question (#182) rather than staying an open-ended "needs more testing" item. Track B: the rules-cleanup engine grew substantially (self-correction, numeric entities, code symbols, list cues, emoji, spell-out — see [§4](#4-walking-one-dictation-end-to-end)), and a real-dictation eval harness now exists for it (population deferred to Phase 4). Code signing/notarization/auto-update (#11) was deliberately moved out to Phase 4 rather than attempted here.
- **Phase 3 (v0.3: deepen) — unchanged from Phase 1.** `llama-server` plumbing still folded into the break-placement work already shipped; codebase vocabulary biasing and voice-driven editing both still not built. #173 (IDE-terminal app-tracking) added to this phase's scope.
- **Phase 4 (v1.0: polish/launch) — not started, but better scoped than it was.** Now explicitly holds: functional permission-probing at launch, code signing/notarization/auto-update (#11, moved from Phase 2), the real-dictation eval corpus (#171), and the AX-readiness fallback fix (#181).

The honest one-sentence summary, updated: **the safe, fast, correct baseline is now genuinely hardened, not just built — the remaining gaps are well-evidenced and precisely scoped rather than vague "needs more testing" items, and everything left is either Phase 3's headline differentiators or Phase 4's polish/distribution work.**

## 11. What's unfinished, fragile, or deliberately deferred

Carried forward from [phase-1-progress.md §11](phase-1-progress.md#11-whats-unfinished-fragile-or-deliberately-deferred), all still true: no code signing/notarization (now explicitly Phase 4, #11), permission identity across rebuilds still unresolved, the break-safe app allow-list is still tiny and hardcoded, cold start is still slow, the two headline differentiators still don't exist, the run-on sentence splitter is still a known-imperfect heuristic, there's still no automated latency regression test.

One item is now understood precisely rather than vaguely: **"cross-app injection is verified manually" used to mean "we haven't gotten around to it."** It now means something more specific: AX-readiness latency on Chromium/Electron targets varies by over 5 seconds depending on target and focus history, neither of the two available poke mechanisms reliably helps, and the actual fix is scoped (#181) but not yet implemented — closer to "understood and queued" than "unknown."

New this phase:

- **Nothing currently guards against a second silent duplicate build path reappearing.** The `model-artifacts.mjs`/`fetch-llama.sh` divergence went unnoticed for a long time because nothing checked that two independent acquisition paths for the same binary agreed with each other. There's no lint, test, or convention yet that would catch a similar duplication if it happened again elsewhere in the build.
- **`npm install`'s dependency on an active, sufficiently new Node version isn't guarded either.** A Node version below the `engines` requirement fails deep inside `electron/install.js` with an unhelpful `ERR_REQUIRE_ESM`, not a clear "wrong Node version" message, and there's no `.nvmrc` yet to make the right version automatic.

## 12. File map

Extends [phase-1-progress.md §12](phase-1-progress.md#12-file-map) — everything there is still accurate. Additions this phase:

```
electron/
  cleanup/
    fixtures/                    — real-dictation.json (eval samples, seeded empty) + README (capture recipe)
    realDictation.test.js        — runs every fixture through cleanup(), fails loudly if the set is empty

scripts/
  model-artifacts.mjs            — now transcription (whisper.cpp) only; the dead "rewrite" role is gone
  fetch-llama.sh                 — the only path that acquires llama-server; installs to bin/llama/ (subdirectory,
                                    not flat - the dylibs are @loader_path-relative and ship alongside the binary)

prototypes/
  electron-ax-tree-10/           — Swift probe + run.sh + analyze.py measuring AX-tree-readiness latency and
                                    richness on Chromium/Electron targets; RESULTS.md holds the trial data

docs/
  progress/                      — this directory. phase-1-progress.md, phase-2-progress.md (this file),
                                    one checkpoint per phase, most recent first in README.md's link
```

---

*This document should be kept current as the project moves past what it describes. If a section starts describing something that's no longer true, fix it there rather than leaving it stale — the same standard the project holds its ADRs to. When Phase 3 closes, add `phase-3-progress.md` alongside this one rather than overwriting it.*
