# Manual check: hotkey -> transcribe -> inject (#2, push-to-talk via #5, injection via #6/#12)

What CI/a headless session can verify, and what still needs a human running
the actual app: launching a real Electron window, granting macOS
permissions, and pressing a global hotkey aren't things a sandboxed session
can drive.

Since #5, `Control+Option+D` is real push-to-talk: hold to record, release
to stop and transcribe. Since #6, the transcript is delivered to the field
under the cursor via the accessibility helper's fallback chain (write at
the caret, then clipboard-plus-paste, then synthesised keystrokes - see
#62), not just printed to the terminal.

The default was originally `Cmd+Shift+D`; #84 moved it to `Control+Option+D`
after finding that a Cmd-combo with no matching menu item makes AppKit play
the system alert beep in the focused app (the tap is listen-only, so the
keystroke still reaches it) - and that beep, landing at the start of the
clip, got hallucinated by Whisper as "[Music]". Control/Option combos aren't
treated as menu key-equivalents, so nothing beeps.

## Already verified without a GUI

- `whisper-server` compiles and serves `/inference`: a synthetic TTS clip
  posted with the exact `encodeWav` + `fetch`/`FormData` code path `main.js`
  uses came back correctly transcribed.
- `encodeWav` produces a valid mono 16kHz 16-bit WAV (checked against
  `afinfo`).
- `hotkey-helper` compiles, and run standalone without Input Monitoring
  granted, correctly logs the permission gap to stderr and exits `1`
  rather than hanging or crashing.
- `accessibility-helper` compiles, and run standalone without Accessibility
  granted, its `inject` command correctly reports the frontmost app but
  holds rather than delivering - AX calls fail cleanly without the grant,
  they don't hang.
- Since #10, the fallback chain's decision logic (`InjectionEngine` in
  `native/accessibility-helper/Sources/AccessibilityInjection/`) has 12
  automated tests covering every rung, the settle guard, and the blind-paste
  gate against fakes - `swift test --package-path native/accessibility-helper`
  (needs a full Xcode install; Command Line Tools alone are missing
  `Testing.framework`'s runtime search path).
- All new/changed files pass `node --check`.

## Needs a human, one time

1. `npm install` (builds `whisper-server`, `hotkey-helper` and
   `accessibility-helper`, fetches the model if not already present), then
   `npm start`.
2. The first hold of `Control+Option+D` should trigger the macOS **Input
   Monitoring** prompt (not Accessibility - see #5's contract). Grant it.
3. The next dictation attempt should trigger a separate **Accessibility**
   prompt for the injection helper (not Input Monitoring - see #6's
   contract, two helpers, two permissions). Grant it, then quit and
   relaunch the app so both helpers pick up their grants.
4. Click into a normal text field (e.g. a Notes window, or this file in an
   editor), hold `Control+Option+D`, say something, release it.
5. The transcript should appear **in the field**, not just the terminal.
   The terminal running `npm start` still prints it too, prefixed
   `[dictation]`, followed by a line reporting how it was delivered - e.g.
   `injected via wrote into the field` or `injected via pasted`.
6. Tap it very briefly with no speech - should log
   `no audio captured, skipping` and nothing is injected.
7. Hold it, say something, and switch to another app mid-hold (still
   holding the keys) to confirm the tap is global and doesn't need the
   app focused. The text should land in whichever app is frontmost when
   you release, not the one that was frontmost when you pressed.
8. Try a terminal window and an Electron-based editor (e.g. VS Code, Slack)
   as the target - these are exactly the cases #62 designed the fallback
   chain around. A terminal's prompt should receive a clipboard paste, not
   have its scrollback overwritten. In the Electron app, check whether
   `#12`'s `AXManualAccessibility` forcing actually got a usable focused
   element (rung 1 or a verified rung 2) rather than the bare `AXWebArea`
   #28 measured without it - either is an acceptable outcome, but the
   difference is worth noting since it's unmeasured until this step runs.
   This is also the step #10 is actually asking for: real testing across a
   spread of apps (Electron, terminals, Java/Swing) rather than the
   automated coverage above, which exercises the decision logic against
   fakes but can't confirm what a real app actually does with a paste or a
   synthesised keystroke.

If step 2/3 don't fire the OS prompts, or step 5 never prints/injects,
check the terminal for `[whisper-server]`-, `[hotkey-helper]`- and
`[accessibility-helper]`-prefixed lines first:

- The resident whisper server takes ~15-20s to load Metal shaders on a
  cold start (see the M1 timing in `spike/llm-cleanup-latency/`), so an
  early hotkey press mid-load will log a connection error rather than a
  transcript.
- If `[hotkey-helper]` logs `failed to create event tap` repeatedly, the
  Input Monitoring grant either wasn't given or hasn't taken effect yet -
  check System Settings > Privacy & Security > Input Monitoring for
  OpenStream (or Electron, in dev).
- If `[dictation] injection held: ...` keeps appearing even in a plain
  text field, check System Settings > Privacy & Security > Accessibility
  for the same target - the accessibility helper needs its own grant,
  separate from Input Monitoring.
- `injection held` right after switching apps is expected, not a bug -
  that's the settle guard (#62) refusing to trust a target for the first
  ~400ms after a switch.
