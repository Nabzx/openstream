# Results — voice-edit fidelity spike (#222)

Run 2026-08-28 on the driving machine (macOS 26.2, Apple Silicon), against the
repo's own pinned `resources/bin/llama/llama-server` + `smollm2-1.7b-instruct-q4_k_m.gguf`
at a 2048-token context — the rewrite model server exactly as production configures it.
15 cases × 3 prompt variants. Faithfulness judged by hand from `review.html`; the
raw data is in `results.json`.

## Verdict: **No.** Prompting SmolLM2-1.7B does not clear the bar for voice editing.

The model handles deterministic string transforms and is safely conservative on
vague/adversarial commands, but it **will not reliably perform the two commands the
feature is pitched on** — "make this a bullet list" and "make this shorter" — under
any of the three prompts tried. It either silently returns the text unchanged or,
when pushed with an example, does the wrong transform and adds artefacts.

## Latency — not a concern

Warm, single request: **min 266ms, median ~900ms, max 2.5s** across all variants.
Comfortably inside the "multi-second is acceptable but must be visible" bar from #17.
Model load (cold start) was ~1.3s with the file warm in disk cache.

## Faithfulness by variant

Hand-judged; "acceptable" = applied the instruction and only the instruction.

### zero-shot (plain contract prompt)

| Bucket | Acceptable | Notes |
| --- | --- | --- |
| tested-core (8) | **3–4 / 8** | `snake_case`, `camelCase`, numbered list: clean. `capitalise`: missed "for", changed "macos"→"MacOS". `fix grammar`: partial (tense shift, "Me and him" left). "shorter": deleted one word only. **both bullet-list cases returned unchanged.** |
| preservation (2) | 1 / 2 | hedge kept ✓. "shorter" silently dropped "Tuesday". |
| adversarial (5) | 4 / 5 | correctly left vague/question/leave-alone cases untouched. Translated to (wrong) French when asked. |

### strict (zero-shot + "you MUST carry out the instruction, don't add bullets unless asked")

**No improvement.** 7/15 returned unchanged — one *more* than zero-shot. The
bullet-list cases still came back verbatim; "make this shorter" got *worse* (fully
unchanged where zero-shot at least trimmed a word). Telling it harder does not make
it able.

### one-shot (one worked bullet-list example)

**Worse.** The single example contaminates every case: spurious `-` markers added to
plain sentences (`adv-make-better`, `adv-leave-alone`, `preserve-hedge`), "make this
shorter" turned into a bullet list, "make this a numbered list" rendered as dashes,
`camelCase` broke to `snake_case`, and `preserve-number-name` was reduced to
"- Latency dropped by 43 milliseconds" — Priya, Tuesday and the deployment context
all gone. Same pattern #67 measured for break placement: the example doesn't remove
the bias, it *is* the bias.

## The #17 guards don't catch the real failure modes

**0 / 45 guard rejections** across all runs. The guards (empty / >3× length /
chatter-prefix) are designed for a model that rambles — but SmolLM2 fails by
*doing nothing* or *doing the wrong transform cleanly*. Neither is deterministically
detectable:

- An "returned unchanged" check would catch the zero-shot no-ops (6–7 per run) —
  worth adding to #17's contract — but that just converts a silent no-op into an
  error message, it doesn't make the edit happen.
- Nothing deterministic catches "did a bullet list when asked to shorten" or
  "dropped a proper noun".

## What this means for #17

The design in #17's decision comment is sound; the model in the role is not. Options,
in order of preference:

1. **Narrow #17's launch surface to what actually works**: identifier case
   conversions and list *numbering/bulleting of already-delimited items*, shipped as
   a small fixed set with the "returned unchanged → tell the user" guard. Drop the
   open natural-language surface until the model improves. This is a much smaller
   feature than the pitch.
2. **Wait for a better model in the rewrite role** — re-run this exact spike against
   the #192 candidates (Qwen3-1.7B, Granite-3.3-2B, OLMo-2-1B). `run.mjs` takes
   `--url`, so this is a one-command re-test once another server is available.
3. **Defer voice editing past v0.3.**

Recommend option 1 for scope-setting and option 2 as the parallel research task
(add a child ticket to re-run this against Qwen3 / Granite).

## Reproducing

```
# start the rewrite model server on any port
resources/bin/llama/llama-server --model resources/models/smollm2-1.7b-instruct-q4_k_m.gguf \
  --host 127.0.0.1 --port 8199 --ctx-size 2048
# run the corpus
node prototypes/voice-edit-fidelity-222/run.mjs --url http://127.0.0.1:8199/v1/chat/completions
node prototypes/voice-edit-fidelity-222/review.mjs > prototypes/voice-edit-fidelity-222/review.html
```
