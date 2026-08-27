# Results — issue #178

Measured 2026-08-27 on an **Apple M3 MacBook Air, 16 GB, macOS 15.6.1**.
The raw run is [`out/results.json`](out/results.json). It used NeMo-Speech.cpp
0.1.0 with Metal, the official pinned Q8 GGUFs, one server process per model,
and three warm repetitions per corpus item.

## Verdict

**Reject the one-model replacement for ordinary dictation.** Do not ship
Canary, Nemotron, or Parakeet as the sole transformation model. Keep the
transcription model separate from the deterministic cleanup / formatting path
(and keep translation as an explicit capability decision).

**Parakeet TDT 0.6B v3 is the strongest ASR fallback candidate**, not a
qualifying one-model replacement. It has the better English WER and latency in
this run, but it leaves fillers, self-correction text, and spoken punctuation
commands in the output. It is also offline-only in the official runtime.

## Canary preflight

Canary-1B-v2 was not started. Its official `canary-1b-v2.nemo` artifact is
**6,358,958,080 bytes** (about 5.92 GiB), over the hard 1 GB artifact limit by
more than six times. The official model documentation also does not establish
an Apple Silicon runtime or target-Mac latency. This is a sufficient rejection
under the stated constraints; downloading it would not answer the question.

## Runtime measurements

| Model | Artifact | Resident RSS after warmup | Peak RSS | Streaming | Warm short | Warm long |
|---|---:|---:|---:|---|---:|---:|
| Nemotron 3.5 ASR Streaming 0.6B Q8 | 707.2 MiB | 833.2 MiB | 857.0 MiB | yes | 0.132 s | 2.192 s |
| Parakeet TDT 0.6B v3 Q8 | 680.9 MiB | 803.3 MiB | 823.4 MiB | no | 0.066 s | 0.922 s |

Warm latency is from completed WAV upload to JSON transcription response. The
short recording was 2.539 seconds; the long recording was 30.237 seconds.
Neither figure includes Electron IPC, Accessibility injection, or cursor
arrival, so neither proves the product's end-of-speech-to-cursor budget.

Fresh-server measurements show the cost of loading and first inference:

| Model | Case | Server ready | First request | Spawn to text |
|---|---|---:|---:|---:|
| Nemotron | short | 0.220 s | 0.773 s | 0.993 s |
| Nemotron | long | 0.109 s | 1.792 s | 1.901 s |
| Parakeet | short | 0.117 s | 0.438 s | 0.555 s |
| Parakeet | long | 0.110 s | 0.973 s | 1.083 s |

A resident server makes the first column an app-start cost rather than a
per-dictation cost. The first request still faults model pages and performs
inference, which is why the benchmark reports both fresh and warm cases.

## Output contract

The corpus contains four English contract cases and three multilingual cases.
The contract check requires non-empty output, required phrases, removal of
listed fillers/correction/control words, and the expected punctuation
signature. Reference WER is reported separately.

| Model | Contract passes | English short WER | English long WER | Correction WER | Punctuation WER |
|---|---:|---:|---:|---:|---:|
| Nemotron | **0/7** | 0.125 | 0.101 | 1.250 | 0.125 |
| Parakeet | **3/7** | 0.125 | 0.081 | 1.750 | 0.250 |

The Parakeet passes are the Spanish, German, and French smoke cases. Both
models fail the English safety cases:

- **Filler:** both return `Um, can you just run the test suite again?`.
- **Self-correction:** Parakeet returns both `staging` and `production`, plus
  the literal word `period`; it does not select the corrected wording.
- **Spoken punctuation:** Parakeet returns literal `comma` and `period`.
- **Long dictation:** Parakeet retains `um` and `kind of`; Nemotron also
  produces transcription errors such as `they're` and `N revisit`.

The multilingual part is encouraging but narrow. Parakeet exactly transcribed
the Spanish and German fixtures and made one small French apostrophe scoring
 difference; Nemotron produced word errors in all three. Neither model
supports speech translation, so neither satisfies a one-model design if
translation is mandatory.

## Memory and the 8 GB floor

The measured NeMo-Speech.cpp process reached roughly **0.8 GiB RSS** at peak
and settled around **0.8 GiB RSS** after warmup. This excludes Electron, audio
capture, model supervisor, IPC, Accessibility, and the operating system. The
16 GB target is therefore not a valid proxy for memory pressure on an 8 GB Mac.

The run establishes only that the model server itself fit on the 16 GB M3 Air.
It does **not** establish available headroom, swap behavior, concurrent app
memory, or sustained thermal behavior on an 8 GB machine. A selected
implementation would still need an 8 GB validation run.

## Limits

- Audio was generated with macOS `say`, not recorded human speech. The run is
  repeatable and exposes the output-contract failures, but it is not a real
  speech accuracy certification.
- Seven fixtures and three warm repetitions are directional, not a statistically
  representative language evaluation.
- The benchmark measures text arrival at the local runtime's HTTP client, not
  arrival at the cursor. The latter remains a separate delivery measurement.
- The benchmark tests explicit locales, not automatic language detection or
  mixed-language speech.
- No model can be credited with arbitrary cleanup from punctuation and WER
  alone. The contract failures are the deciding observation.

Sources for the candidate/runtime facts: [issue #179 research](https://github.com/Nabzx/openstream/blob/research/one-model-dictation-models/docs/research/one-model-dictation-models.md),
[NVIDIA NeMo-Speech.cpp](https://github.com/NVIDIA/NeMo-Speech.cpp),
[Nemotron model card](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b),
[Parakeet model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3), and
[Canary model card](https://huggingface.co/nvidia/canary-1b-v2).
