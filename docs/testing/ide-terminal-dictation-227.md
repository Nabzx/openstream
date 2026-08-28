# Manual check: dictation launched from an IDE terminal (#227)

[#227](https://github.com/Nabzx/openstream/issues/227): a dictation produced no
visible text when OpenStream was started from **VS Code's integrated terminal**.
That was seen on a build without [#181](https://github.com/Nabzx/openstream/issues/181)
(context AX-readiness fallback) or [#47](https://github.com/Nabzx/openstream/issues/47)
(launch permission gate), both of which are on `main` now, so this check
confirms whether anything is still wrong and, if so, names the stage.

## What changed for this

- **Context detection no longer hard-fails** on a not-yet-ready AX tree
  (#181) — it falls back to an unknown-field context and the dictation
  proceeds, denying line breaks.
- **The injection path now retries focus resolution** within
  `Config.axInjectBudgetMs` (200 ms) before dropping to blind-paste-or-hold
  (#227). An Electron target (VS Code, Slack) whose AX tree isn't up on the
  first read usually comes good within that window.
- **A context read that fails outright now holds the transcript** for manual
  paste instead of dropping it silently.
- **One summary line per dictation**: `[dictation] outcome: <status> …`.

## Steps

1. Grant Microphone, Input Monitoring, and Accessibility. If the app opens
   on the **Permissions** screen, the helper's grant is missing — fix that
   first (remove the stale OpenStream entry in System Settings, re-add the
   fresh build), it is a separate problem from #227.
2. Launch the final build from **VS Code's integrated terminal**
   (`npm start`).
3. Click into a text field in **another** app (TextEdit, Notes).
4. Hold the push-to-talk key, dictate a sentence, release.
5. Repeat with the target being an Electron app (a second VS Code window, a
   Slack message box).
6. As a control, quit and repeat the whole thing launched from
   **Terminal.app** instead.

Pass: the text lands in the target app in every case, within the latency
budget.

## Reading the console when it fails

The one line that names the stage:

```
[dictation] outcome: held reason="couldn't read the focused field: …"
[dictation] outcome: failed stage=transcription reason="…"
[dictation] outcome: delivered
```

Alongside it:

| Line | Means |
|---|---|
| `[dictation] context.bundleId: "com.microsoft.VSCode"` | context detection resolved the **wrong** app — it should be the app you dictated into, not VS Code. Points at the app-switch tracker (#173). |
| `[dictation] context.axReady: false` | the target's AX tree wasn't ready in time; delivery fell back. Expected occasionally for a cold Electron target, not every time. |
| `[dictation] outcome: held …` + the overlay shows the text | delivery couldn't place it. The words are recoverable — copy from the overlay. |
| `[accessibility-helper] resolveFocusedElement: … trusted=false` | the helper's Accessibility grant is not active for this build — a permission problem, not #227. |
| `[accessibility-helper] resolveFocusedElement: … AXError -25204` | the AX API timed out on the target (tree not ready / not responding). |

If context resolves the correct app and `axReady` is `true` but delivery
still holds, capture the full `[accessibility-helper]` block from that
attempt and attach it to #227 — that is a delivery-path bug the retry
didn't cover.
