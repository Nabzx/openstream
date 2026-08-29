# Manual check: conditional Push-to-talk shortcuts (#219)

Issue [#219](https://github.com/Nabzx/openstream/issues/219) covers the macOS
boundaries that CI cannot drive: a real settings window, renderer keyboard
capture, Input Monitoring, physical key transitions, and normal application
behavior. Run this check on each representative Mac and keyboard combination;
do not treat a successful unit test as evidence that a conditional key exists
on every machine.

## Automated gate

From the repository root, run these checks before the hardware pass:

```bash
npm test
npm run typecheck
npm run build
npm run build:hotkey-helper
```

Record the commit and the result of every command in the report. The native
matcher tests cover event sequences; this procedure covers whether those events
actually arrive from macOS and whether the complete app behaves correctly.

## Test record

Record this metadata for every run:

- Date and time:
- Commit:
- Mac model (`system_profiler SPHardwareDataType`):
- macOS version (`sw_vers -productVersion`):
- Keyboard and connection (built-in, USB, Bluetooth, or other):
- Function-key mode: system-feature or standard-function; not applicable for a
  keyboard without a function row:
- Input Monitoring, Accessibility, and Microphone: granted / not granted:

For every accepted candidate, keep one evidence row with all of the following:

| Field | Evidence |
|---|---|
| Candidate | The displayed key name, for example `Option` or `F13` |
| Capture | Accepted identity and displayed label; Fn may arrive through native capture |
| Native transition | Exactly one native `down` and one native `up` for one physical press; no repeat events |
| Dictation | One Dictation began on down and completed when the final dictation text landed at the cursor |
| Normal application behavior | The key's ordinary macOS/application behavior remained visible; record `not observable` when it has no visible action |
| Result | Pass, unavailable, or not supported on this hardware |
| Notes | Any permission, keyboard-mode, or application detail |

The Mac, keyboard, macOS version, and function-key mode fields apply to every
accepted candidate. Copy them alongside each evidence row when the report is
shared so conditional support is not mistaken for universal support.

The settings window captures ordinary candidates from DOM key events. macOS does
not reliably send a standalone Fn press to Chromium, so OpenStream listens for
Fn with a temporary native helper during capture. The visible flow is the same:
choose **Change shortcut**, press Fn, and wait for **Checking shortcut…**.

To record the native pair directly, stop OpenStream and run the built helper for
one candidate with its macOS virtual keycode and an empty modifier list:

```bash
resources/bin/hotkey-helper --keycode <keycode> --modifiers "" | tee /tmp/openstream-hotkey-events.jsonl
```

Make one physical press and release, then stop the helper. Its stdout should
contain one `ready`, one `down`, and one `up` JSON event, while stderr remains
available for diagnostics. Do this only after Input Monitoring is granted and
never use a synthetic event. Restart OpenStream before the app-level candidate
check.

## Capture and rejection matrix

Open **Settings** and choose **Change shortcut** for each attempt. After every
rejected attempt, confirm capture is still active and the current shortcut has
not changed. Each rejection must show exactly `Unsupported key`.

| Input category | Representative attempts | Expected result |
|---|---|---|
| Ordinary characters | `A`, `D`, `Z` | Rejected; `Unsupported key` |
| Digits | `1`, `9` | Rejected; `Unsupported key` |
| Punctuation | `.`, `/`, `-` | Rejected; `Unsupported key` |
| Modifier-plus-character | `Control+D`, `Command+1` | Rejected; `Unsupported key` |
| Modifier-plus-function key | `Option+F1` | Rejected; `Unsupported key` |
| Standalone Shift | Left or right Shift | Rejected; `Unsupported key` |
| Unmapped/non-trigger key | Arrow key or another unmapped event | Rejected; `Unsupported key` |

## Accepted-candidate matrix

Test every candidate that the keyboard exposes. A candidate that never reaches
the renderer is **not supported on that hardware**, not a reason to claim that
the key works universally. For every candidate accepted by the renderer, fill
out the evidence row above, then:

1. Confirm the button reads **Checking shortcut…** while the candidate helper is
   prepared. The displayed current shortcut must change only after readiness is
   confirmed.
2. Press and release the candidate once, speak a short phrase, and complete a
   Dictation. Fill in the native-transition and Dictation evidence fields above.
3. Check the selected key in a normal application. The helper is listen-only,
   so OpenStream must not suppress the key or pretend to own it.

| Candidate group | Candidates and conditions |
|---|---|
| Standalone modifiers | Option, Command, and Control, from either physical side where available |
| Standalone lock/function modifiers | Fn and Caps Lock where the keyboard produces a usable press and release |
| Top-row keys in system-feature mode | F1 through F12, with the keyboard's top row set to system features |
| Top-row keys in standard-function mode | F1 through F12, with **Use F1, F2, etc. keys as standard function keys** enabled |
| External function keys | F13 through F19 on an external keyboard where available |

## Failure and replacement checks

### Failed replacement

Start with a known working shortcut and keep that helper running. Cause a valid
candidate helper to fail before it reports ready in an isolated test run (for
example, stop only the candidate process before readiness, or temporarily make
the helper executable unavailable while the already-running old helper remains
alive). Restore any executable or permission change immediately afterward.

Do not press the candidate to confirm it and do not send a synthetic test event.
The settings window must show **Shortcut unavailable. Choose another shortcut.**
The previous shortcut must remain displayed, saved, and usable. The UI must
explain that macOS or another application may also use a key, but must not claim
that OpenStream detects every conflict.

### Successful replacement

1. Start with standalone Option on a fresh settings file. Confirm the settings
   file is absent before launch and that **Option** is displayed.
2. Repeat with a settings file containing the legacy `Control+Option+D` record.
   Confirm it is displayed and usable without migration or rewriting.
3. Replace the active shortcut with a candidate from the accepted matrix. Confirm
   the new key works immediately, the old shortcut no longer starts a Dictation,
   and ordinary Dictation output is unchanged.
4. Quit and relaunch OpenStream. Confirm the new key is displayed and active,
   the old shortcut remains inactive, and the saved JSON value matches the
   helper's configured identity.

Saving a candidate must never press that key or invoke a macOS/application
shortcut. Any physical press used for the accepted-candidate evidence happens
after the settings change has succeeded.

## Reporting boundaries

Attach the automated command results and the completed evidence rows to the
issue or release record. Mark unavailable Fn, Caps Lock, or function keys as
conditional hardware results, not failures in the universal sense. A shortcut
may also be used by macOS or another application because the helper is
listen-only. OpenStream tells the user to choose another shortcut when
replacement cannot be prepared, but it does not perform reliable conflict
detection and does not send a live confirmation event.
