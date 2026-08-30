---
status: accepted
---

# Parakeet TDT 0.6b v3 for the transcription model server

[ADR-0002](0002-no-one-model-dictation-engine.md) settled that dictation stays two
stages and left one question open: *which* model fills the transcription stage.
`whisper base.en` (whisper.cpp) filled it from the start.
[#203](https://github.com/Nabzx/openstream/issues/203)/[#204](https://github.com/Nabzx/openstream/issues/204)
asked whether Parakeet does it better.

**The transcription model server now runs NVIDIA Parakeet TDT 0.6b v3 as CoreML on the
Apple Neural Engine, via [FluidAudio](https://github.com/FluidInference/FluidAudio).**
It replaces whisper.cpp's `whisper-server` binary and the `ggml-base.en.bin` weight.
The two-stage shape ADR-0002 fixed is unchanged: Parakeet returns raw text, then
`electron/cleanup/rules.js` and the rewrite model server do their existing jobs.

## Why

- **Accuracy.** Parakeet TDT 0.6b v3 sits well above `whisper base.en` on English WER
  and brings native punctuation and capitalisation, which the cleanup stage was
  leaning on whisper for.
- **It runs on the ANE.** FluidAudio ships Parakeet as CoreML bundles that run on the
  Neural Engine, off the GPU that Metal-heavy apps and the rewrite model already want.
- **No C++ build.** FluidAudio is a pure-Swift SPM dependency, the same shape as the
  hotkey and accessibility helpers. `whisper-server` needed a pinned whisper.cpp
  checkout, a CMake/Metal build, and staged dylibs (`scripts/model-artifacts.mjs`).
- **`large-v3-turbo` was tried first and reverted** ([#310](https://github.com/Nabzx/openstream/issues/310)/[#312](https://github.com/Nabzx/openstream/issues/312)):
  ~10-20s to load and several seconds per utterance, well over the sub-1s budget.
  Parakeet is the "different engine" route ADR-0002 pointed at, not a bigger whisper.

## Consequences

- **New process:** `native/transcription-helper` (Swift), supervised by
  `electron/transcriptionHelper.js`. It speaks the same newline-delimited JSON stdio
  protocol as the accessibility helper rather than HTTP - it is both the server and
  the transcription adapter, so `transcriptionHttpAdapter.js` and the port-8178
  contract are gone. The Electron side waits for its `{"event":"ready"}` line before
  letting a dictation through.
- **The model is not a bundled weight.** FluidAudio downloads the CoreML bundles from
  Hugging Face on the helper's first run (~1 GB, into
  `~/Library/Application Support/FluidAudio`). There is no `ggml` file in
  `resources/models` and nothing for `modelStore.js` to fetch for this role. First
  run therefore has no download-progress screen yet - the helper logs to stderr and
  the health probe reports "starting" until it is ready.
  ([#249](https://github.com/Nabzx/openstream/issues/249) parity is a follow-up.)
- **macOS floor rises to 14.** FluidAudio requires Swift 6 and macOS 14; the app was
  nominally macOS 13. Parakeet-on-ANE wants a recent OS regardless.
- **`#16` vocabulary biasing does not apply.** Parakeet has no `initial_prompt` the way
  whisper did. FluidAudio exposes a separate vocabulary-boosting API that a later pass
  can wire in; for now the coordinator still builds the prompt and the helper ignores
  it.
- **whisper.cpp is kept, dormant.** `whisperServer.js`, `transcriptionHttpAdapter.js`,
  `build-whisper.sh`, the `model-artifacts.mjs` transcription role and the
  `ggml-base.en.bin` entry in `modelStore.js` are all still present but unwired. This
  swap is a trial - if Parakeet does not hold up on real use, reverting is flipping
  `electron/main.js` back to `whisperServer`. A later PR removes the whisper machinery
  once Parakeet is proven.
- **`scripts/verify-dictation-pipeline.sh` is stale** - it waits on a listener on port
  8178. It needs updating for the stdio helper (follow-up).
