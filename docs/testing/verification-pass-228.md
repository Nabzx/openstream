# Pre-launch verification pass — results

Issue [#228](https://github.com/Nabzx/openstream/issues/228). The manual checks CI cannot
drive, run against a clean pull of `main` shortly before the `v1.0.0` tag. The individual
procedures live in the other files in this folder ([voice-edit](voice-edit-manual-check.md),
[hotkey-transcribe](hotkey-transcribe-manual-check.md),
[settings-hotkey-remap](settings-hotkey-remap-manual-check.md),
[ide-terminal](ide-terminal-dictation-227.md),
[break-safe apps](break-safe-apps-settings-19.md)); this file records what the pass found.

## Environment

- Apple Silicon MacBook Pro, macOS 14+, source build (`git clone` … `npm start`).
- Run twice: from a plain Terminal, and from the VS Code integrated terminal.
- Transcription: Parakeet TDT 0.6b v3 (CoreML / ANE, via FluidAudio — [ADR-0003](../adr/0003-parakeet-for-transcription.md)).
  First run downloaded the model bundles (~470 MB); subsequent runs load from the FluidAudio cache.
- Rewrite model: SmolLM2-1.7B, `llama-server` on 127.0.0.1:8179.

## Passed

| Area | Result |
|---|---|
| **Basic dictation** | Text lands at the cursor. Tray goes recording → transcribing → idle; the overlay appears with a sound meter that tracks the voice. |
| **Break safety — allowed** | A spoken "new paragraph" lands as a real break in TextEdit and in a Notes note body. `context.bundleId` correctly names the app. |
| **Break safety — denied** | The same command in Terminal is dropped; the text runs on as one line, nothing is submitted, and the console logs `[dictation] context.breakCommandDropped: com.apple.Terminal`. |
| **The Notes regression ([#307](https://github.com/Nabzx/openstream/issues/307))** | Fixed. `context.bundleId: "com.apple.Notes"`, the paragraph break lands. Was broken for weeks — context detection had been resolving the wrong frontmost app (see below). |
| **Spoken breaks with a pause ([#320](https://github.com/Nabzx/openstream/issues/320))** | Fixed. "first line … *pause* … new paragraph … *pause* … second line" produces a clean `First line\n\nSecond line.` — no stray `.` at the start of the new line, which Parakeet's prosody-driven punctuation used to leave behind. |
| **Bullet points** | "shopping list, bullet point, milk, bullet point, eggs" → `Shopping list\n- Milk\n- Eggs.` |
| **Voice editing ([#17](https://github.com/Nabzx/openstream/issues/17))** | "make this uppercase" → `HELLO WORLD`; "wrap this in quotes" → quoted; an unrecognised command leaves the selection untouched with a brief overlay message; with nothing selected, push-to-talk is ordinary dictation. |
| **IDE-terminal dictation ([#227](https://github.com/Nabzx/openstream/issues/227))** | Launched from VS Code's integrated terminal, dictating into TextEdit puts the text in TextEdit, not stuck on VS Code. |
| **Latency** | Warm dictations: 150–260 ms release-to-cursor, every time — well inside the sub-1s budget. Parakeet transcription alone is ~150–300 ms on a short clip. (Browser targets now add a ~400 ms settle — see the Google Docs section below.) |
| **Window-close JavaScript error** | Gone ([#330](https://github.com/Nabzx/openstream/issues/330)). Closing the app — including an editor killing its integrated terminal — no longer pops Electron's error dialog; a teardown-race exception is logged to the terminal instead. |

## Findings, moved to v1.1 — not launch blockers

| Finding | Detail | Tracked |
|---|---|---|
| **Cold first dictation** | The first dictation after launch takes ~1.3–1.8 s and its context read falls back to the NSWorkspace tracker, because the system-wide AX read returns `kAXErrorCannotComplete` (-25204) until an app-scoped AX call has thawed the messaging channel. Every dictation after the first is instant and resolves context from AX. Two warm-up attempts shipped ([#329](https://github.com/Nabzx/openstream/issues/329), [#331](https://github.com/Nabzx/openstream/issues/331)); the residual is [#333](https://github.com/Nabzx/openstream/issues/333). The failure mode — a stale tracker giving the wrong break-safe verdict — is narrow and did not occur in testing. |
| **Transcription accuracy on short clips** | Parakeet mishears proper nouns and some words on brief utterances ("world" → "Wald", "Nabil" → "Nabeel"). | [#321](https://github.com/Nabzx/openstream/issues/321) (correction table), [#322](https://github.com/Nabzx/openstream/issues/322) (FluidAudio keyword boosting), [#171](https://github.com/Nabzx/openstream/issues/171) (eval corpus to measure it) |
| **Spoken numbers spelled out** | "twenty three" produces "twenty three", not "23". The rules engine only converts number words in a currency context today. | [#332](https://github.com/Nabzx/openstream/issues/332) |

## Not run

- **Push-to-talk shortcut remapping** ([#198](https://github.com/Nabzx/openstream/issues/198)) — Zazai's area. The known edge (a chosen shortcut can still interfere with ordinary typing in some configurations) is v1.1 polish.

## Root cause worth recording: the frontmost-app tracker

The Notes regression ([#307](https://github.com/Nabzx/openstream/issues/307)) and the cold-start finding are the same underlying issue. Context detection used to take the frontmost app from `RealAppSwitchTracker`, which polls `NSWorkspace.shared.frontmostApplication` — a value that lags and, when the app is launched from a terminal, can freeze at whatever was frontmost at launch (the [#113](https://github.com/Nabzx/openstream/issues/113) / [#173](https://github.com/Nabzx/openstream/issues/173) class of bug). Injection re-resolves the real focused element every time, so the *text* always landed correctly — but the *break-safe verdict* was computed against the wrong app.

The fix ([#318](https://github.com/Nabzx/openstream/issues/318)): read the focused application from the AX system-wide element (`kAXFocusedApplicationAttribute`) instead of the NSWorkspace tracker, so "which app am I typing into" comes from the same source injection uses. The tracker stays only for the [#62](https://github.com/Nabzx/openstream/issues/62) settle guard, which is about timing, not identity. That system-wide read is cold for the first dictation after launch — hence the residual in [#333](https://github.com/Nabzx/openstream/issues/333).

## Found after the pass: Google Docs ([#368](https://github.com/Nabzx/openstream/issues/368))

Not covered by the pass — Docs is a hard target and none of the procedures used it. A user reported that dictation into a Google Doc did nothing after the first attempt.

Docs renders the document to a `<canvas>` and manages keystrokes through a hidden `contenteditable` iframe it fully controls, so the injection ladder mishandled it three ways:

- **Rung 1 trusted a silent AX write.** `kAXSelectedTextAttribute` set on Docs' focused element returned `.success` and did nothing; the engine reported `delivered, verified`. Rung 1 now reads the field back and only claims success if the text is actually there ([#369](https://github.com/Nabzx/openstream/issues/369)).
- **The browser check read the wrong source.** A paste-first list for browser bundles skips rung 1, but it consulted the frontmost-app tracker — the same lagging source as above — so it missed Chrome. When rung 1 *did* land the write in Docs but the value didn't reflect it, verification failed and the fall-through paste inserted the text a second time. `FieldInfo` now carries the bundle id of the app that owns the focused element, resolved from its pid ([#370](https://github.com/Nabzx/openstream/issues/370)).
- **The paste fired too soon.** Once the AX channel is warm, injection runs ~150 ms after the hotkey release — before Docs re-focuses its editing iframe — so the synthetic Cmd+V landed nowhere. The first dictation only worked because the cold-start delay pushed it past that window. There is now a 400 ms settle before pasting into a browser, and the keystroke synthesis moved to a private `CGEventSource` so a still-settling hotkey modifier can't turn the Cmd+V into Cmd+*modifier*+V ([#370](https://github.com/Nabzx/openstream/issues/370)).

Verified: dictation into a Doc lands once, on every dictation. Browser dictations now take ~880 ms release-to-cursor (the settle plus the paste), inside the 1 s budget.
