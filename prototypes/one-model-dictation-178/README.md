# PROTOTYPE — one-model dictation benchmark (issue #178)

Throwaway measurement harness. It is not production code and does not change
OpenStream. It answers one question:

> Can one local speech model replace the ordinary dictation path while staying
> below a 1 GB artifact, within the under-one-second end-of-speech budget, and
> inside the output contract from issue #177?

The benchmark uses the official NVIDIA NeMo-Speech.cpp runtime for the two
sub-1 GB candidates recommended by issue #179. Canary-1B-v2 is rejected by a
preflight artifact check: its official `.nemo` file is 6,358,958,080 bytes, so
there is no useful Mac run to perform under the stated limit.

## Run on the target Mac

Install NeMo-Speech.cpp outside this repository (the benchmark does not install
it for you):

```sh
curl -fsSL https://github.com/NVIDIA/NeMo-Speech.cpp/raw/main/scripts/install.sh \
  | sh -s -- --backend metal --prefix "$HOME/Library/Application Support/NeMoSpeech" --no-modify-path
```

Download the pinned artifacts into a scratch directory. The model files are
large and intentionally are not committed:

```sh
export NEMO_SPEECH_BIN="$HOME/Library/Application Support/NeMoSpeech/bin/nemo-speech"
export NEMO_SPEECH_MODEL_DIR="$HOME/Library/Caches/NeMoSpeech/models"
"$NEMO_SPEECH_BIN" pull nemotron-3.5
"$NEMO_SPEECH_BIN" pull parakeet-tdt
export NEMOTRON_MODEL="$(find "$NEMO_SPEECH_MODEL_DIR" -name 'nemotron-3.5-asr-streaming-0.6b.q8_0.gguf' -print -quit)"
export PARAKEET_MODEL="$(find "$NEMO_SPEECH_MODEL_DIR" -name 'parakeet-tdt-0.6b-v3.q8_0.gguf' -print -quit)"
```

Then run one command from the repository root:

```sh
prototypes/one-model-dictation-178/run.sh
```

It generates macOS `say` audio in `out/audio/`, starts one resident server per
candidate, measures fresh-server and resident requests, samples RSS every 20ms,
and writes `out/results.json`. Set `--repetitions 5` for a less noisy run. An
existing WAV corpus can be supplied with `--skip-audio-generation --audio-dir
/path/to/wavs`.

## What is measured

- exact model artifact bytes and the pinned published size;
- server RSS after model load and peak RSS during startup and inference;
- cold server startup plus first completed-audio-to-text request;
- warm request latency for short, long, and multilingual dictations;
- English fillers, a clear self-correction, spoken punctuation, capitalization,
  punctuation, and reference word error rate;
- Spanish, German, and French transcription with explicit locale prompts.

The contract check is intentionally strict for the safety cases. It requires a
non-empty answer, all required phrases, no forbidden filler/correction/control
words, and the exact punctuation signature. WER is reported separately, so a
candidate can show good ASR while still failing the dictation contract.

## Limits

- The fixture audio is macOS TTS, not human speech. It is suitable for a
  repeatable smoke/evaluation run, not a real-speech quality certification.
- The clock is WAV upload through JSON response. It includes local runtime and
  server work, but not Electron IPC, Accessibility injection, or cursor arrival.
  Therefore a text result under one second is necessary but not sufficient for
  OpenStream's end-of-speech-to-cursor commitment.
- RSS is the NeMo-Speech.cpp server only. It excludes Electron, audio capture,
  and the injection helper. The M3 host has 16 GB unified memory; there is no
  8 GB machine measurement here. Do not infer swap or thermal behavior at the
  memory floor from this run.
- Nemotron and Parakeet are ASR models. Neither supplies speech translation or
  a documented general dictation-rewrite operation. Translation behavior is
  separately undecided in issue #180.
- No benchmark can prove subtle semantic preservation. The corpus only catches
  the listed high-signal failures and reports reference WER for the rest.

The final verdict belongs in `RESULTS.md` after a run. Keep this directory on a
throwaway branch; only the validated decision should be carried into production.
