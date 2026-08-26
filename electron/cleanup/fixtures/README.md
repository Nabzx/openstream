# Real dictation fixtures (#15)

`real-dictation.json` is the eval corpus for the rules-cleanup engine (`../rules.js`).
It's a plain assertion suite (`../realDictation.test.js` runs it), so it stays
comparable before/after a `rules.js` change with nothing more than `npm test`.

## Why this file is separate from `spike/llm-cleanup-latency/samples.json`

That set is `say`-generated TTS, kept for the coarse invariant sweep and the
latency budget test in `rules.test.js` - fine for those, but explicitly ruled
out by #15 as an accuracy eval, because TTS renders "um" as a crisp lexical
word that whisper mis-transcribes into a real word, whereas a real human "um"
is non-lexical and whisper usually just drops it. Using TTS samples here would
bake that artifact into the eval and make the eval lie about filler handling.

Every sample in this file must come from a real recording, transcribed by the
actual `whisper-server` this app ships.

## Schema

```json
{
  "id": "short-unique-slug",
  "raw": "verbatim whisper-server output, unedited",
  "expected": "hand-verified correct cleanup() output for that raw text",
  "options": { "oneLineBox": false, "breakSafe": false },
  "notes": "what this sample stresses, e.g. a real non-lexical um whisper dropped on its own"
}
```

`options` is optional and defaults to `{}` (a normal multi-line, non-break-safe
field) when omitted - only set it when the sample is specifically testing the
one-line-field or break-safe modifiers.

## Adding a new sample

1. Make sure `whisper-server` is running (either the full app via `npm start`,
   or just the model server on its own - see `scripts/model-artifacts.mjs`).
   It listens on `127.0.0.1:8178`.
2. Record a short real dictation as a WAV file (16kHz mono 16-bit PCM, same as
   `electron/capture/capture.js` produces - `sox -d -r 16000 -c 1 -b 16 sample.wav`
   works too).
3. Get the raw transcript straight from the model server, bypassing the app's
   cleanup entirely, so what you capture is genuinely pre-cleanup:

   ```bash
   curl -s -F "file=@sample.wav" -F "response_format=json" \
     http://127.0.0.1:8178/inference | jq -r .text
   ```

4. Run that raw text through `cleanup()` (a Node one-liner is enough:
   `node -e 'console.log(require("./rules").cleanup(process.argv[1]))' "<raw text>"`
   from `electron/cleanup/`) and read the output. If it's correct, that's your
   `expected` value. If it's wrong, that's a bug this fixture should now pin
   down - use the wrong output as a documented regression, not the fix.
5. Add the entry to `real-dictation.json` and run `npm test`.

Favour samples that hit real speech patterns TTS can't produce: genuine
non-lexical fillers, false starts, self-corrections, real mis-transcriptions -
not just clean sentences with an "um" typed in.
