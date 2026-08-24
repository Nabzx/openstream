# PROTOTYPE - break-position latency and quality spike (issue #67)

**Throwaway. Not production code.** No tests, no error handling, no
abstractions. It exists to answer one question and then be deleted:

> Is the break-position call fast enough for the 1s dictation budget, and does
> a ~1.7B model pick sensible paragraph breaks?

Sibling of `spike/llm-cleanup-latency/` (issue #24), whose harness shape and
machine this reuses so the numbers are directly comparable.

## Scope

This measures the design **decided in #45**: the rewrite model server is handed
numbered sentences and answers with sentence numbers, never with text. It does
**not** re-open whether a model belongs on the dictation path.

## The budget it must fit

End of speech to text ready is committed to **under 1s**. On the 130-word
bucket, whisper `base.en` + rules already spends **0.61s** (#24), leaving the
break-position call roughly **0.39s** of warm headroom.

## What it produces

1. Warm latency of a break-position call per length bucket, both candidate
   models, against the 0.39s headroom.
2. Syntactic validity of the returned indices (parseable, in range, sorted,
   unique) and the failure rate - which defines the fallback.
3. A human-drivable review page (`out/review.html`) for judging whether the
   break placement is actually good. This is the part that decides whether the
   feature earns its ~1.1 GB.
4. Measured resident memory at 4-bit, against the **~1.8 GB total** #45 assumed.

## Candidates

| Role | Model | Licence |
|---|---|---|
| provisional | SmolLM2-1.7B-Instruct Q4_K_M | Apache 2.0, ungated |
| alternate | Qwen3-1.7B Q4_K_M | Apache 2.0, ungated |

Qwen3 is a hybrid reasoning model and emits `<think>` blocks by default. Since
the whole latency case rests on the output being a handful of tokens, thinking
must be disabled - and is measured both ways, because that difference decides
whether Qwen3 is viable at all.

Models live outside the repo in `~/.cache/openstream-spike/models/` (~2.2 GB);
nothing here is committed except code and results.

## Stated assumptions and limits

- **M3 MacBook Air, 16 GB, macOS 15.6.1** - same machine as #24, so comparable.
  Fanless, so thermally representative of the low end; 16 GB, so **not**
  representative of the 8 GB floor that the memory question is really about.
- **Text-only.** No audio is transcribed. Input is the sample corpus run through
  `spike/llm-cleanup-latency/rules.py`, which is the real pipeline input. This
  isolates the break call; transcribe cost is taken from #24 rather than
  re-measured.
- The rules run-on splitter lands some sentence boundaries mid-clause (a known
  #45 weakness). The model is fed exactly that, faithfully - so a bad break may
  be the segmenter's fault rather than the model's, and the review page has to
  keep those two apart.
