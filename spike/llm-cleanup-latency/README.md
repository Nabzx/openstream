# PROTOTYPE - LLM cleanup latency spike (issue #24)

**Throwaway. Not production code.** No tests, no error handling, no persistence,
no abstractions. It exists to answer one question and then be deleted:

> Does the local LLM cleanup pass earn the latency it costs, or does a
> rule-based cleanup get most of the value for near-zero delay?

This does not match either branch of the `prototype` skill (it is neither a
state-machine logic demo nor a UI variation set). The issue specifies the
artifact itself - "a throwaway spike that measures end to end" - so the shape
follows the issue. The skill's shared rules still apply: throwaway, one command
to run, no persistence, state surfaced, captured on a branch off main.

## Run it

```sh
python3 make_audio.py          # regenerate TTS dictation clips (once)
python3 bench.py latency       # main measurement -> out/results.json
python3 bench.py sustained 12  # 12 min back-to-back run -> out/sustained.json
python3 report.py              # -> out/report.html, double-click it
```

Prereqs: `brew install whisper-cpp llama.cpp`, and the four models in
`~/.cache/openstream-spike/models/` (whisper `ggml-base.en.bin`,
`ggml-small.en.bin`; `Llama-3.2-{3B,1B}-Instruct-Q4_K_M.gguf` from the
`bartowski` GGUF mirrors - Meta's own repos are gated).

Models live outside the repo on purpose: ~3.4 GB, and nothing here should be
committed except code and results.

## What it measures

- **Warm per-dictation latency**, split transcribe vs. cleanup, across three
  length buckets (short command / sentence / paragraph) and two whisper sizes.
- **Cold start separately.** Both whisper and llama run as *resident servers*
  (`whisper-server`, `llama-server`), warmed before timing. Measuring via the
  one-shot CLIs would have charged every sample a 2 GB model load and produced
  a "3-4s per dictation" number that is a measurement artifact, not a product
  cost. Startup is reported as its own line item.
- **A genuinely good rules baseline** (`rules.py`): filler removal, stutter
  collapse across contractions, spoken-punctuation commands, run-on sentence
  splitting, capitalisation, and technical-vocabulary fixups. A 15-line regex
  strawman would have rigged the comparison.
- **Sustained use**: back-to-back dictations for ~12 minutes, reporting
  wall-clock drift. That is the honest sudo-free proxy for thermal behaviour on
  a fanless Air - no power or temperature sensors are read.

## Stated assumptions and limits

- **M3 MacBook Air, 16 GB, macOS 15.6.1.** Fanless, so thermally representative
  of the low end; 16 GB, so *not* representative of the 8 GB memory floor. Any
  conclusion that depends on holding ~2 GB resident needs re-checking at 8 GB.
- **Audio is `say` TTS at 150 wpm**, not real speech. Transcribe time tracks
  audio duration and model size rather than speech cleanliness, so the latency
  half is sound. The quality half is weaker: TTS renders "um" as a crisp lexical
  word, which whisper turns into a wrong real word ("um can" -> "How can"),
  whereas a real human "um" is non-lexical and whisper usually drops it. Treat
  filler-removal difficulty here as pessimistic and mis-transcription as an
  artifact of TTS.
- Single machine, single session, no A/B against real users.
