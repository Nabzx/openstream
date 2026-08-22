# Manual check: hotkey -> transcribe -> console (#2, push-to-talk via #5)

What CI/a headless session can verify, and what still needs a human running
the actual app: launching a real Electron window, granting macOS
permissions, and pressing a global hotkey aren't things a sandboxed session
can drive.

Since #5, `Cmd+Shift+D` is real push-to-talk: hold to record, release to
stop and transcribe. This replaced the earlier toggle-based proof of
concept, which used Electron's `globalShortcut` (activation-only, no
release event) as a stand-in until the native helper existed.

## Already verified without a GUI

- `whisper-server` compiles and serves `/inference`: a synthetic TTS clip
  posted with the exact `encodeWav` + `fetch`/`FormData` code path `main.js`
  uses came back correctly transcribed.
- `encodeWav` produces a valid mono 16kHz 16-bit WAV (checked against
  `afinfo`).
- `hotkey-helper` compiles, and run standalone without Input Monitoring
  granted, correctly logs the permission gap to stderr and exits `1`
  rather than hanging or crashing.
- All new/changed files pass `node --check`.

## Needs a human, one time

1. `npm install` (builds `whisper-server` and `hotkey-helper`, fetches the
   model if not already present), then `npm start`.
2. The first hold of `Cmd+Shift+D` should trigger the macOS **Input
   Monitoring** permission prompt (not Accessibility - see #5's contract).
   Grant it, then quit and relaunch the app so the helper picks up the
   grant.
3. Hold `Cmd+Shift+D`, say something, release it.
4. The transcript should print to the terminal running `npm start`,
   prefixed `[dictation]`.
5. Tap it very briefly with no speech - should log
   `no audio captured, skipping` rather than hitting the server.
6. Hold it, say something, and switch to another app mid-hold (still
   holding the keys) to confirm the tap is global and doesn't need the
   app focused.

If step 2 doesn't fire the OS prompt, or step 4 never prints, check the
terminal for `[whisper-server]`- and `[hotkey-helper]`-prefixed lines
first:

- The resident whisper server takes ~15-20s to load Metal shaders on a
  cold start (see the M1 timing in `spike/llm-cleanup-latency/`), so an
  early hotkey press mid-load will log a connection error rather than a
  transcript.
- If `[hotkey-helper]` logs `failed to create event tap` repeatedly, the
  Input Monitoring grant either wasn't given or hasn't taken effect yet -
  check System Settings > Privacy & Security > Input Monitoring for
  OpenStream (or Electron, in dev).
