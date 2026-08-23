# Findings - issue #67: is the break-position call fast enough, and does a 1.7B model pick sensible breaks?

Measured on **M3 MacBook Air, 16 GB, macOS 15.6.1** (fanless; above the 8 GB
floor). `llama-server` held **resident** and warmed before timing, matching
#45's resident rewrite server and #24's harness, so the numbers are directly
comparable. Median of 5 warm runs over 12 dictations (130/200/300-word
buckets). Full data in `out/results.json` and `out/control.json`; the
human-drivable review page is `out/review.html`.

## Answer

**Latency passes comfortably. Quality fails, and it fails in a way that is not
a tuning problem.**

The break-position call is cheap, exactly as #45 predicted: 0.11-0.12s on
SmolLM2 across every bucket, against 0.39s of headroom. The 4.58s full-rewrite
figure from #24 does not carry over, because the output really is a handful of
tokens. That half of the expectation is confirmed.

But **neither candidate model picks breaks by reading the text.** They copy the
worked example out of the prompt. This was caught by varying the example and
changing nothing else:

| Model | Example given | Most common first break | Nothing usable | Broke at every sentence |
|---|---|---|---|---|
| SmolLM2-1.7B | `3, 7` | 3 (11x) | 0/12 | 0/12 |
| SmolLM2-1.7B | `4, 9` | 4 (10x) | 2/12 | 0/12 |
| SmolLM2-1.7B | *none* | - | **12/12** | 0/12 |
| Qwen3-1.7B | `3, 7` | 3 (6x), 2 (6x) | 0/12 | 5/12 |
| Qwen3-1.7B | `4, 9` | 2 (7x), 4 (5x) | 0/12 | 4/12 |
| Qwen3-1.7B | *none* | 2 (12x) | 0/12 | **9/12** |

SmolLM2's first break follows the example digit-for-digit, and with the example
removed it returns nothing usable on all twelve. Qwen3 with no example starts at
sentence 2 every time and breaks at *every* sentence on nine of twelve.

This is the failure mode #45 was most worried about, arriving in the form it
predicted: **a model that reliably returns valid, useless indices, failing
silently.** The index-only output format did its job - it made #24's
meaning-editing and quote-wrapping impossible by construction, and the format
was obeyed 12/12 by both non-thinking models. It just cannot make a model choose
well, and #45 was explicit that it was not trying to.

Agreement with the spike author's own paragraphing (a cheap signal, not the
human judgement the ticket asked for): **SmolLM2 1/12, Qwen3 0/12.**

## 1. Warm latency, against 0.39s of headroom

| Bucket | SmolLM2-1.7B | Qwen3-1.7B (no think) | Qwen3-1.7B (thinking) |
|---|---|---|---|
| 130 words | **0.12s** | **0.09s** | 8.77s |
| 200 words | **0.11s** | **0.29s** | 11.16s |
| 300 words | **0.11s** | **0.29s** | 11.61s |
| worst single sample | **0.19s** | 0.65s | 12.25s |

SmolLM2 is flat across buckets, because prefill on a few hundred words is cheap
and the output is 5-12 tokens. Qwen3 costs more only where it emits more
indices, which is itself the degenerate behaviour above.

**Thinking mode is not viable and should not be revisited.** Qwen3 with thinking
enabled hit the 512-token cap and never reached an answer on **11 of 12**
samples, at 8.8-12.2s. It must be disabled explicitly via
`chat_template_kwargs: {enable_thinking: false}`; the default is on.

## 2. Contract compliance

| Model | Format obeyed | Needed repair | Unusable | Output tokens (median) |
|---|---|---|---|---|
| SmolLM2-1.7B | 12/12 | 1/12 | 0/12 | 8 |
| Qwen3-1.7B (no think) | 12/12 | 6/12 | 0/12 | 11 |
| Qwen3-1.7B (thinking) | 1/12 | 0/12 | **11/12** | 512 (capped) |

Repair means indices came back that could not be applied - out of range, or
sentence 1, which every text already starts at. Both non-thinking models stayed
inside the format; Qwen3 needed repair half the time.

## 3. Memory, against #45's ~1.8 GB assumption

| Process | Resident |
|---|---|
| whisper-server base.en | 241 MB |
| llama-server SmolLM2-1.7B Q4_K_M | 1810 MB |
| llama-server Qwen3-1.7B Q4_K_M | 1585 MB |
| **total, SmolLM2** | **2051 MB** |
| **total, Qwen3** | **1825 MB** |

#45 assumed **~1800 MB total**. Qwen3 lands on it; SmolLM2 overshoots by ~14%.
Neither is alarming on 16 GB, but on the 8 GB floor this is **a quarter of RAM
held for the entire session**, for a feature that on this evidence does not
work. **Still unmeasured at 8 GB** - this is a 16 GB machine, so nothing here
tests behaviour under real memory pressure.

Cold start: SmolLM2 2.20s, Qwen3 1.51s. Both are startup cost, not per-dictation.

## 4. The defined fallback

The ticket asked for a fallback for a malformed or empty reply. `breakpos.py`
implements it and `out/review.html` §5 lets you drive it:

- **Repair, don't reject.** Drop indices that are out of range, duplicated, or
  equal to 1; apply what remains. A partly-sensible answer still beats no
  paragraphs.
- **Nothing usable -> ship it unbroken.** One paragraph, exactly the behaviour
  before this feature existed. This is the safe direction: a missing break is
  invisible, a wrong break is not.
- **Never retry on the dictation path.** The budget has 0.39s of headroom and a
  retry doubles the cost of the case that already failed.
- Format compliance and repair rate are tracked **separately**. A reply that has
  to be scavenged out of prose is a format failure even when the numbers are
  usable, because the latency case rests on the output being a few tokens.

## What this does not settle

The ticket asked for a **human** reading of whether the breaks land well.
`out/review.html` §4 renders all twelve dictations paragraphed four ways (no
breaks / each model / the spike author) with buttons to record a verdict. That
step has not been done - no agent should stand in for it. The control in §3
arguably pre-empts it: if the models are anchoring on the example rather than
reading, there is no placement judgement left to make. **That call is the
human's**, and it is the one thing this spike hands back.

## Limits, stated

- **16 GB, fanless, one machine.** Not the 8 GB floor, and not sustained
  thermals - every latency figure here is warm and unstressed.
- **Text-only.** No audio; transcribe cost is taken from #24, not re-measured.
- **One prompt, three example variants.** A better prompt might do better. What
  the control shows is that the *example* is doing the work, which is a
  different and worse problem than an under-tuned prompt.
- **Twelve samples, one author's paragraphing.** Enough to expose a systematic
  failure, not enough to certify a success had one appeared.
- The run-on splitter lands some sentence boundaries mid-clause (#45's known
  weakness), so some available break positions are poor to begin with. The
  review page keeps that separate from the model's choice.
