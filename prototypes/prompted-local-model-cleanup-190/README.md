# Prompted local-model cleanup prototype

Throwaway prototype for [Can prompts make a local rewrite model produce contract-compliant final dictation text?](https://github.com/Nabzx/openstream/issues/190).

It runs the pinned SmolLM2-1.7B rewrite model against a human-recorded corpus and compares:

- raw transcription;
- the existing Rules cleanup result;
- a zero-shot JSON cleanup prompt;
- a few-shot JSON cleanup prompt;
- one response carrying cleaned text and paragraph-break sentence numbers;
- two responses, one for cleaned text and one for paragraph-break sentence numbers.

The experiment is text-only. The corpus has no target application or focused-field record, so it does not measure Accessibility delivery, break-safe behavior in a real target, or release-to-cursor latency.

## Run

Start the rewrite model server in a separate terminal from the repository root:

```bash
resources/bin/llama/llama-server \
  --model resources/models/smollm2-1.7b-instruct-q4_k_m.gguf \
  --host 127.0.0.1 \
  --port 8179 \
  --ctx-size 2048
```

Wait for the server to become healthy, then run the prototype:

```bash
node prototypes/prompted-local-model-cleanup-190/run.mjs \
  --corpus ~/openstream-corpus/real-dictation.draft.json \
  --url http://127.0.0.1:8179/v1/chat/completions \
  --out ~/openstream-corpus/prompted-cleanup-190-results.json
```

Generate a local review page:

```bash
node prototypes/prompted-local-model-cleanup-190/review.mjs \
  --results ~/openstream-corpus/prompted-cleanup-190-results.json \
  > ~/openstream-corpus/prompted-cleanup-190-review.html
open ~/openstream-corpus/prompted-cleanup-190-review.html
```

The runner warms each request before measuring it. It records JSON compliance, model fallback, exact text matches, a conservative raw-word bound, break-reply validity, and warm request latency. It records model artifact bytes but does not include process memory or delivery in the result. Sample-by-sample semantic judgement remains human work.

## Limitations

- SmolLM2 is the candidate tested because it is the current rewrite model and the researched candidates did not have local artifacts available here.
- `expected` values come from the human-edited draft and must be reviewed before treating exact-match counts as evidence.
- The corpus lacks dedicated number, dictated-question, abstention/fallback, and target-context cases.
- The result files contain the user's raw transcriptions and stay outside Git by default.
- This directory is a prototype, not production code. Do not wire it into the dictation pipeline.
