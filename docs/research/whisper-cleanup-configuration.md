# Whisper configuration and dictation cleanup

Research note for [#196](https://github.com/Nabzx/openstream/issues/196). This note is research only. It does not change the transcription model server, the final dictation text contract, or production code.

## Question

Can documented Whisper prompt, decoding, segmentation, or post-decode configuration reduce ordinary English Dictation cleanup enough to avoid the dedicated transcription-cleaning model decided in [#194](https://github.com/Nabzx/openstream/issues/194)?

## Sources and version

The repository pins whisper.cpp tag `v1.9.3` at commit [`371b5a7561823ab2bb32142d2751e35e7534727b`](https://github.com/ggml-org/whisper.cpp/tree/371b5a7561823ab2bb32142d2751e35e7534727b), built as `whisper-server` with Metal. The weight is `ggml-base.en.bin` at Hugging Face revision [`5359861c739e955e79d9a303bcbc70fb988958b1`](https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1). The pin is recorded in [`scripts/model-artifacts.mjs`](../../scripts/model-artifacts.mjs).

Primary source paths used below:

- [`include/whisper.h`](https://github.com/ggml-org/whisper.cpp/blob/371b5a7561823ab2bb32142d2751e35e7534727b/include/whisper.h), `whisper_full_params` and result accessors.
- [`examples/server/server.cpp`](https://github.com/ggml-org/whisper.cpp/blob/371b5a7561823ab2bb32142d2751e35e7534727b/examples/server/server.cpp), server flags, multipart request fields, and mapping to `whisper_full_params`.
- [`examples/server/README.md`](https://github.com/ggml-org/whisper.cpp/blob/371b5a7561823ab2bb32142d2751e35e7534727b/examples/server/README.md), documented HTTP usage.
- [`examples/cli/README.md`](https://github.com/ggml-org/whisper.cpp/blob/371b5a7561823ab2bb32142d2751e35e7534727b/examples/cli/README.md), CLI configuration documentation.

## What configuration can documentably do

### Prompting

`--prompt` is documented as an **initial prompt**. The server assigns it to `initial_prompt`; the API says it is tokenized and prepended to decoder context, with at most half of the text context used. `--carry-initial-prompt` prepends it to every decode window. This is useful evidence for vocabulary, names, and writing-style conditioning. It is not a documented instruction-following or cleanup operation. Nothing in the pinned API says that a prompt removes fillers, chooses a self-correction, converts spoken punctuation, or refuses to answer a dictated question.

A technical-term prompt is therefore a hypothesis to test, not a contract mechanism. A cleanup-instruction prompt is a weaker hypothesis still: it may bias generated text, but it does not turn Whisper into a validator or rewrite model. A persistent carried prompt may also consume decoder context and condition every window, so it must be tested for regressions in ordinary words, identifiers, and numbers.

### Decoding

The server exposes greedy `best_of`, beam `beam_size`, initial `temperature`, temperature fallback (`temperature_inc`, `entropy_thold`, `logprob_thold`), `no_speech_thold`, `suppress_nst`, and `no_context`. The header describes these as decoding controls. In particular, `no_context` disables use of past transcription as the next decoder prompt, while `suppress_nst` suppresses non-speech tokens. `--no-fallback` disables temperature fallback.

These settings can change recognition stability and hallucination or non-speech behavior. They do not documentably perform semantic cleanup. `suppress_nst` is about special non-speech tokens, not ordinary lexical fillers such as “um” or “uh”. `no_speech_thold` is a speech/no-speech decision, not a rule for deleting words. More beam search or candidate selection may improve recognition, but it can also increase inference work. The pinned source gives no latency guarantee for any setting.

### Segmentation and VAD

The API documents `max_len` and `split_on_word` as output-segment shaping controls. `single_segment` forces one segment. The server also supports VAD with minimum speech, minimum silence, maximum speech duration, padding, and overlap parameters. Segment and token timestamps are available through documented accessors.

These controls can provide boundaries for downstream processing and may reduce long-window context effects. They do not remove fillers, false starts, accidental repeats, self-corrections, punctuation words, or invented content. The header explicitly warns that `whisper_full_parallel`, which splits audio into chunks, can have worse accuracy at chunk beginnings and ends. Splitting is therefore a segmentation hypothesis, not a cleanup solution.

### Post-decode data

The server can return text, segments, words, probabilities, timestamps, and no-speech probability in JSON formats. The API exposes token IDs, token text, probabilities, and timing. That data could support deterministic confidence gates or alignment-aware rules. It cannot, by itself, tell OpenStream whether “send it to staging, no, production” should become “send it to production”, whether a question should remain a question, or whether a phrase is invented rather than spoken.

A deterministic post-decode filter could implement known vocabulary and punctuation rules, but that is `Rules cleanup` by another name. It must preserve the existing final dictation text contract and cannot be credited as a Whisper capability.

## Behavior by cleanup case

| Case | Documented Whisper configuration capability | Finding |
|---|---|---|
| Clear fillers | None. `suppress_nst` targets non-speech tokens, not spoken words. | Any filler removal observed in existing runs is model behavior, not a configurable guarantee. |
| False starts and accidental repeats | None. Beam, prompt, and context settings affect decoding only. | Must measure; no setting is documented to delete them safely. |
| Self-corrections | None. | Selecting the corrected wording is semantic rewriting and remains outside the transcription contract. |
| Spoken punctuation | No documented spoken-punctuation vocabulary or conversion pass. | Existing rules can do this; Whisper output may sometimes infer punctuation, but configuration does not guarantee it. |
| Invented or answered content | No documented refusal or faithfulness validator. | `no_speech_thold` and fallback thresholds are not safeguards against semantic invention. |
| Technical identifiers and numbers | Initial prompt can condition vocabulary. | Promising hypothesis, with a direct risk of prompt-induced substitutions. Must measure exact-match preservation. |

## Latency and role boundary

The current product decision in #194 gives the transcription-cleaning model a 2.8-second deadline inside the three-second end-of-speech-to-cursor budget, with deterministic fallback. Configuration experiments must measure the complete path: release, final transcription, any segmentation or post-decode work, validation, and cursor delivery. A resident server avoids model-load cost, but changing beam search, fallback retries, VAD, or chunk count may change inference time. Whisper.cpp documents parameters and outputs, not a three-second performance bound.

This does not reopen the role decision by itself. #194 defines the dedicated transcription-cleaning model as a separate role after raw transcription, with `Rules cleanup` as the authoritative fallback. The model must preserve wording and meaning, remove only clear disfluencies and approved punctuation controls, preserve identifiers and numbers, and never paraphrase, summarize, answer, or invent. A Whisper prompt or decoder setting that merely makes raw output look cleaner has not demonstrated those gates. It would replace neither the cleaning role nor its validator unless it meets them in evidence.

The findings also fit ADR-0001's boundary. That ADR keeps cleanup rules-only and permits the rewrite model server to decide break placement without rewriting dictated words. This research does not propose putting a rewriting model into the transcription model server.

## What a prototype must measure

Use real human English recordings, not only TTS, with a paired reference and raw baseline. Compare the pinned baseline against a small matrix of prompt, context, decoding, VAD, and segmentation settings. Include at least two examples of each required behavior plus ambiguous cases:

- fillers, false starts, repeated words, and self-corrections;
- spoken punctuation and paragraph commands;
- technical identifiers, code-like names, homophones, and numbers;
- dictated questions that must remain questions, and phrases designed to expose invented or answered content;
- short, sentence-length, and long Dictations, including silence and resumed speech.

Record raw transcription, final candidate text, segment and token metadata, configuration, resident/peak memory, and timing at each boundary. Score word error rate separately from contract behavior. Require zero critical contract errors, exact preservation of identifiers and numbers, and a clear improvement over `Rules cleanup` on the targeted cleanup cases. Test cold and resident operation, repeated use, and target hardware. Any timeout or uncertain result must be counted as fallback, not as a pass.

## Conclusion

The pinned whisper.cpp release documents useful conditioning, decoding, VAD, segmentation, and metadata controls. It does **not** document a configuration that performs safe semantic cleanup. Prompting may help technical vocabulary, and decoding or segmentation may improve recognition or boundaries, but fillers, false starts, repeats, self-corrections, spoken punctuation, and invented or answered content remain hypotheses requiring measurement. The evidence cannot replace the dedicated transcription-cleaning model role decided in #194, and no experiment should weaken the final dictation text contract to make a configuration pass.
