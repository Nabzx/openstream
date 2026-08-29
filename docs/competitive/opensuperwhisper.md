# Competitive read: OpenSuperWhisper

*Fetched August 2026 from [Starmel/OpenSuperWhisper](https://github.com/Starmel/OpenSuperWhisper) — README, releases, and issues #8–#204.*

## Where each project stands

| | OpenSuperWhisper | OpenStream |
|---|---|---|
| Stars / forks | 2,739 / 233 | 0 / — (not launched) |
| Created | Feb 2025 | Aug 2026 |
| Last release | 0.1.0, Mar 2026 | — |
| Stack | native Swift menu-bar app | Electron + React |
| Install | `brew install opensuperwhisper` (cask core), signed DMG | `git clone` + compile from source |
| DMG size | **11 MB** (models downloaded on first run) | **~1.3 GB** (models bundled) |
| Engines | whisper.cpp **and Parakeet** (FluidAudio / CoreML) | whisper.cpp `base.en` only |
| Text processing | Asian-language autocorrect only | deterministic rules cleanup + break-safety + voice edits |

OpenSuperWhisper has **lost momentum**: 87 open issues, a community collective (`my-monkeys`) forked it to v0.2.1 to land the PR backlog, and issue [#151](https://github.com/Starmel/OpenSuperWhisper/issues/151) is an open plea to the maintainer to hand it over. The incumbent is contestable — but from zero, against a working Homebrew install.

## The wedge

**They transcribe. We finish the text.** OpenSuperWhisper is a transcription tool — audio in, raw text at the cursor. Users file bugs like "missing space between sentences" ([#107](https://github.com/Starmel/OpenSuperWhisper/issues/107)) because there is no cleanup layer at all. OpenStream is a dictation tool for developers: deny-by-default on line breaks, deterministic cleanup, spoken corrections, voice edits, context-aware delivery.

Don't out-transcribe them (same whisper.cpp, same Parakeet). Win on **what happens after the transcript** — and on the fact that their own top feature requests are things OpenStream has or is one decision from: cleanup hooks ([#55](https://github.com/Starmel/OpenSuperWhisper/issues/55)), custom vocabulary ([#19](https://github.com/Starmel/OpenSuperWhisper/issues/19), [#202](https://github.com/Starmel/OpenSuperWhisper/issues/202)), profiles ([#203](https://github.com/Starmel/OpenSuperWhisper/issues/203)), workflow routing ([#14](https://github.com/Starmel/OpenSuperWhisper/issues/14)).

## Parity gaps — what they have that we must match

1. **Signing + notarisation + Homebrew** (#11) — the adoption ceiling. No feature lead beats a one-line install.
2. **Ship a small app** (#249) — models on first run, not bundled. Reverses #30.
3. **In-app model picker** (#251), **multiple languages** (#252), **Parakeet** (#176/#204/#205), **drag-and-drop file transcription** (#253).
4. **Expected furniture** — mic picker (#137), recording history (#136), completion chime + indicator position (#256), mouse-button trigger (#258).

## Where OpenStream already wins — press it

- **Deny-by-default on line breaks.** No other open tool does this. The one-line pitch.
- **Deterministic cleanup** — fillers, spoken punctuation, "scratch that", emoji, currency, spell-out.
- **Voice editing** on a selection; the **Commands tab** for discoverability.
- **Context-aware delivery** — break-safe apps, one-line fields, held results.
- **Robust injection** — the AX-write → clipboard → keystroke fallback already fixes their open non-US-keyboard bug ([#90](https://github.com/Starmel/OpenSuperWhisper/issues/90)).
- **Process isolation** — a blocked Accessibility call can't kill the hotkey (they have M1 crash and mic-hang reports).

## Overtake — build what their users beg for, that neither app has

- **Custom vocabulary** (#250) — our #16 is *built*, just shelved. Fastest lead.
- **Post-processing hooks** (#259) — their #55. One adapter stage; also the home for semantic voice edits.
- **Per-app profiles** (#260) — their #203. We already detect the frontmost app.
- **Coding-agent dictation mode** (#261) — their #188. Our lane.

## The honest risk

Electron: 1.3 GB vs 11 MB, slower cold start, "another Electron menu-bar app" scepticism. The size is fixable (#249); the rest is a permanent tax for the React UI — own it. "Overtake" is a 6–12 month story. The realistic first goal: be the obvious choice for the developer who wants dictation that doesn't fire off half-typed commands, then widen.
