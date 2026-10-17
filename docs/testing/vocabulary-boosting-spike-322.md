# Spike: vocabulary boosting via `transcribeWithVocabulary` (#322)

This is **not a shipped feature**. `transcribeWithVocabulary` is a new command
on `transcription-helper`'s stdio protocol, reachable only by talking to the
helper directly - no Electron code path calls it. It exists to answer the one
question source-reading couldn't: what FluidAudio's CTC keyword-spotting
rescore pass actually costs in latency on real Apple Neural Engine hardware.

See the [#322 issue comment](https://github.com/Nabzx/openstream/issues/322)
for the source-reading findings that shaped this - short version: this
composes as a side-channel pass over the exact same `asr.transcribe()` call
"transcribe" already makes, not a different transcription class, and the
second model FluidAudio downloads for it is a documented ~97.5 MB (not the
100-400 MB the issue originally guessed).

**Compile-verified only** - this session's sandbox cannot execute
`transcription-helper` at all (confirmed separately; same constraint noted in
#253's PR). `swift build --package-path native/transcription-helper -c
release` succeeds; nothing below has actually been run.

## What it does

Same request shape as `"transcribe"` (`{"id","cmd":"transcribeWithVocabulary","wav":"<base64 WAV>","lang":"en"}`),
except after the normal transcription it runs FluidAudio's vocabulary-boosting
pass against a **hardcoded** vocabulary list (a few proper nouns plus two
spoken-command phrases - not read from Settings, not a real vocabulary
source, see the code comment for why). The reply carries two extra fields:
`vocabularyApplied` (bool) and `vocabularyReplacements` (count).

## Steps

1. `npm run build:transcription-helper` - the checked-in binary predates this
   command.
2. Run the helper directly: `./resources/bin/transcription-helper`. Wait for
   `{"event":"ready"}` on stdout (this itself may take a minute - it's
   loading the Parakeet TDT bundle, same as any normal run).
3. Base64-encode a short WAV file that contains one of the hardcoded
   vocabulary words spoken clearly (say "OpenStream" or "Parakeet" - a word
   Parakeet is likely to mishear or spell unusually helps show boosting
   doing something):
   ```
   base64 -i your-clip.wav | tr -d '\n' > /tmp/clip.b64
   ```
4. Build one request line and paste it into the running helper's stdin:
   ```
   printf '{"id":"1","cmd":"transcribeWithVocabulary","wav":"%s","lang":"en"}\n' "$(cat /tmp/clip.b64)"
   ```
5. **The first request** triggers a ~97.5 MB download of the CTC
   keyword-spotter model (`FluidInference/parakeet-ctc-110m-coreml`) from
   Hugging Face - expect a real delay here, separate from the transcription
   itself. Watch stderr for progress/errors.
6. Read the reply line. What to note:
   - **`ms`** - the total time, including the CTC pass. Compare against a
     plain `"transcribe"` request for the same clip (drop the
     `WithVocabulary` machinery entirely) to isolate what the boosting pass
     specifically adds. This is the number that answers the real open
     question: does it fit inside the sub-1-second dictation budget
     (ADR-0002/ADR-0003), or does it blow past it?
   - **`vocabularyApplied` / `vocabularyReplacements`** - whether the
     hardcoded vocabulary actually changed anything, and how many words.
   - **`text`** - sanity-check it's still a real transcript, not garbage.
7. Repeat a few times - the CTC model is resident after the first load (same
   pattern as the main model), so requests 2+ should show the pass's steady
   -state cost, not a one-time load penalty.

## What this doesn't answer

- **Accuracy gain** is still #171's job (a real eval corpus, not built yet).
  A handful of manual clips here can suggest "did it fire," not "does it
  actually help."
- **Whether the side-channel composition is a stable, intended FluidAudio
  pattern** or something that happens to work today - worth an upstream
  sanity check before this becomes a real feature, not just a spike.
- **Where the vocabulary should come from** in a real feature - the
  hardcoded list here settles nothing about that.
