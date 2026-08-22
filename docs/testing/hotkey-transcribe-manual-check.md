# Manual check: hotkey -> transcribe -> console (#2)

What CI/a headless session can verify, and what still needs a human running
the actual app: launching a real Electron window, granting microphone
permission, and pressing a global hotkey aren't things a sandboxed session
can drive.

## Already verified without a GUI

- `whisper-server` compiles and serves `/inference`: a synthetic TTS clip
  posted with the exact `encodeWav` + `fetch`/`FormData` code path `main.js`
  uses came back correctly transcribed.
- `encodeWav` produces a valid mono 16kHz 16-bit WAV (checked against
  `afinfo`).
- All new files pass `node --check`.

## Needs a human, one time

1. `npm install` (builds whisper-server and fetches the model if not already
   present), then `npm start`.
2. First press of `Cmd+Shift+D` should trigger the macOS microphone
   permission prompt. Grant it.
3. Say something, press `Cmd+Shift+D` again to stop.
4. The transcript should print to the terminal running `npm start`,
   prefixed `[dictation]`.
5. Press it again with no speech (press-then-immediately-press-again) -
   should log `no audio captured, skipping` rather than hitting the server.

If step 2 doesn't fire the OS prompt, or step 4 never prints, check the
terminal for `[whisper-server]`-prefixed lines first - the resident server
takes ~15-20s to load Metal shaders on a cold start (see the M1 timing
in `spike/llm-cleanup-latency/`), so an early hotkey press mid-load will log
a connection error rather than a transcript.
