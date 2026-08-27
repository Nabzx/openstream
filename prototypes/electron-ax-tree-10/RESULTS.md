Status: **interim, one trial.** Not a verdict - the harness is validated and working, but this needs the full protocol run (VS Code + Chrome + a native control at minimum, both with and without genuine prior focus) before #10 can act on it. Recorded here as a starting point, not a conclusion.

## What this one trial shows

`kAXFocusedUIElementAttribute` already succeeded at *baseline*, before either mechanism was poked - VS Code had a genuinely focused, real element from earlier interaction in the session (unclear exactly what, since this trial was opportunistic rather than a controlled "click into the editor first" setup). Both `axManualAccessibility` (set succeeded) and `axEnhancedUserInterface` (set itself returned `notImplemented`, same as the earlier ad hoc test) reported the same tree afterward: 5 nodes, depth 4, uncapped.

This is consistent with the working theory from the #10 issue comment: readiness tracks whether the app already has a real focused element from genuine interaction, not whether either attribute was poked. It is **not** confirmation - one opportunistic trial with unknown prior state can't distinguish "the poke worked" from "it was already going to succeed regardless." That's exactly what the controlled protocol in the README is for.

## Data

| App | Note | Baseline | Mechanism | Set result | Poll result | Elapsed (ms) | Attempts | Tree nodes | Tree depth | Capped |
|---|---|---|---|---|---|---|---|---|---|---|
| Code | smoke test, VS Code frontmost, focus state unknown | success | axManualAccessibility | success | succeeded | 0 | 1 | 5 | 4 | False |
| Code | smoke test, VS Code frontmost, focus state unknown | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 5 | 4 | False |

## Still needed

- VS Code and Chrome, each with a deliberate prior click into a real field, both mechanisms.
- VS Code and Chrome, switched to via Cmd+Tab **without** touching anything inside them, both mechanisms - the direct test of "does genuine focus matter more than the poke."
- A native app (TextEdit/Notes) as a control - should succeed immediately with no poke needed, confirming the harness itself behaves sanely outside the Chromium case.
- Ideally a second and third Electron app distinct from VS Code (Slack, Discord) to check whether this is VS-Code-specific or general.
