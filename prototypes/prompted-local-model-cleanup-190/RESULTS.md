# Results

Prototype for [Can prompts make a local rewrite model produce contract-compliant final dictation text?](https://github.com/Nabzx/openstream/issues/190).

## Verdict

This run does not support replacing Rules cleanup. The prompted model did not demonstrate safe cleanup on the human-recorded corpus, and the one-response text-plus-break contract failed structurally. Keep this result as prototype evidence only. The downstream production-role decision remains in [What production role should prompted model cleanup have?](https://github.com/Nabzx/openstream/issues/191).

The corpus itself needs one more review pass before its exact-match counts can be treated as a quality score. Fifteen of 20 hand-entered references contain at least one token that is absent from the raw transcription. Those are recognition corrections, not cleanup operations. The prototype correctly records them as cases where a cleanup model must not guess.

## Run conditions

- Candidate: SmolLM2-1.7B-Instruct Q4_K_M through the bundled llama.cpp server.
- Model artifact: 1,055,609,536 bytes. This exceeds the map's required limit of fewer than 1,000,000,000 bytes.
- Model server startup to healthy: 1,047 ms.
- Peak server RSS: 2,160,368 KiB, about 2.06 GiB. This excludes Electron, the transcription model server, helpers, and the operating system.
- Corpus: 20 human-recorded 16 kHz mono WAV files with direct raw transcriptions.
- Not measured: target application, focused field, Accessibility delivery, break-safe behavior in a real target, release-to-cursor latency, complete process-group memory, numbers, dictated questions, and explicit abstention cases.

## Prompt and response results

The runner warmed each request before measuring the second request. The latency figures cover local model HTTP requests only. They do not include audio capture, transcription, validation outside the runner, or delivery.

| Variant | Accepted cleanup replies | Model fallbacks | Malformed replies | Exact final matches | Break replies | Median | P95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zero-shot cleanup | 5/20 | 15/20 | 2/20 | 0/20 | n/a | 527 ms | 3,030 ms | 7,518 ms |
| Few-shot cleanup | 7/20 | 13/20 | 0/20 | 0/20 | n/a | 378 ms | 836 ms | 3,134 ms |
| Combined cleanup and breaks | 0/20 | 20/20 | 20/20 | 0/20 | 0/20 | 544 ms | 3,218 ms | 3,609 ms |
| Separate cleanup then breaks | 7/20 | 13/20 | 0/20 | 0/20 | 11/20 valid | 503 ms total | 976 ms total | 3,454 ms |

The combined prompt returned JSON with a `text` field but omitted `breakSentences` on every sample. The parser therefore rejected every reply instead of allowing text through without a valid break contract. The separate calls produced valid break JSON for 11 of 20 samples, at the cost of a second model request.

The model sometimes returned `accept` while leaving the problem untouched. Examples include keeping the filler and spoken `full stop`, preserving false-start wording, and duplicating the final sentence of a long Dictation. The conservative raw-word check caught one output that introduced a repeated sentence. The accepted status is therefore not evidence of contract compliance.

## Limits and next action

The current result is enough to reject this prompt and response contract, not enough to rank every researched candidate. SmolLM2's artifact already misses the byte budget, and the text-only run cannot establish the three-second end-to-cursor budget or the 8 GB process-group memory gate.

The review page remains local beside the corpus:

```text
~/openstream-corpus/prompted-cleanup-190-review.html
```

Before another candidate run, correct the hand-entered references, add number, question, abstention, and target-context cases, and keep the recognition reference separate from cleanup quality. Do not wire this prototype into production.
