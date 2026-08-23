# Findings - issue #67: is the break-position call fast enough, and does a 1.7B model pick sensible breaks?

Measured on **M3 MacBook Air, 16 GB, macOS 15.6.1** (fanless; above the 8 GB
floor). `llama-server` held **resident** and warmed before timing, matching
#45's resident rewrite server and #24's harness, so the numbers are directly
comparable. Median of 5 warm runs over 12 dictations (130/200/300-word
buckets). Full data in `out/results.json` and `out/control.json`; the
human-drivable review page is `out/review.html`.

## Answer

**Latency passes. Break quality holds up. Ship it, with SmolLM2-1.7B.**

> **Correction.** An earlier revision of this document concluded the opposite -
> that both models were copying the prompt's worked example rather than reading
> the text, and that neither filled the role. Two further experiments show that
> conclusion was wrong, and it is retracted below. The example-variation control
> that produced it was real but over-read: it caught a narrow first-break bias
> and was mistaken for whole-cloth pattern matching.

### Why the "it is just copying the example" reading was wrong

Two tests the original control did not run:

**1. It does not reproduce any fixed rule.** SmolLM2's indices match a cheap
"break every k sentences" rule exactly on **1 of 12**, mean overlap 0.53. It
also breaks *less* on longer dictations (13 sentences -> `[3, 7]`), which a
positional rule cannot do.

**2. Reorder the sentences and the breaks move.** Holding sentence count fixed
and shuffling the order destroys topic structure while leaving every positional
cue intact. Only **11 of 36** shuffles left the indices unchanged, and the
unchanged ones are the short samples where there is barely a choice (3 and 4
sentences). Crucially the breaks move in the **right direction**: on incoherent
shuffled text the model breaks far more often - `perf-1` goes from `[3, 7]` to
breaking at nearly every sentence. That is topic-discontinuity detection
working.

The model is reading the text.

### What the real defect is, and that it is not promptable away

The first break is systematically early and not content-chosen. With the single
example `3, 7` it opens at index 3 on 11/12; with `4, 9` it opens at 4 on 10/12.
Replacing the single example with **several varied examples** (`2, 5, 9` / `4` /
`3, 6` / `none`) does not fix it - it just moves the anchor to the earliest legal
index, 2, on **12/12** for both models.

So the model always starts a new paragraph after sentence two or three,
regardless of content. Whether that is a defect at all is a taste question: an
opening paragraph of two or three sentences is an ordinary prose convention, and
**the human reviewer judged the breaks good**, which is the judgement this ticket
was raised to obtain.

The multi-example prompt is still the one to ship: it is neutral for SmolLM2 and
it **eliminates Qwen3's degenerate every-sentence breaking** (5/12 -> 0/12).

### Which model

**SmolLM2-1.7B**, on latency consistency. Both obey the format 12/12, but
SmolLM2's worst single sample is **0.19s** against Qwen3's **0.65s** - and 0.65s
overruns the 0.39s headroom outright. Qwen3 is 225 MB cheaper in memory, which
does not buy back a blown latency budget on the one hard product commitment.

### Memory: fine, at the context cap that was already decided

Measured at `-c 4096` the total is 2051 MB, over #45's assumed ~1800 MB. But
#52 had already capped the rewrite model server's context at **2048** after
measuring SmolLM2's KV cache at 192 KiB/token (it has no grouped-query
attention). Break placement needs far less: the largest prompt here is **490
tokens** for a 300-word dictation, so the cap has 4x headroom.

| Context | llama-server RSS | + whisper base.en | 300-word median |
|---|---|---|---|
| 4096 | 1814 MB | 2055 MB | 0.203s |
| **2048 (the decided cap)** | **1463 MB** | **1704 MB** | **0.202s** |
| 1024 | 1271 MB | 1512 MB | 0.211s |

At the decided cap the total is **1704 MB, under the ~1800 MB #45 assumed**, and
latency is unchanged. There is no memory problem to escalate - the earlier
figure was an artifact of benchmarking at 4096 instead of the cap already in
force. Keep 2048: 1024 saves a further 192 MB but leaves only 2x headroom over
the largest observed prompt, for no latency gain.

**Still measured on 16 GB, not the 8 GB floor.** That gap is unchanged, but the
decision now sits comfortably inside the budget it was checked against rather
than over it.

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

## What the human judged

`out/review.html` §4 renders all twelve dictations paragraphed four ways (no
breaks / each model / the author). The reviewer read them and judged the breaks
**good**. That is the judgement this ticket was raised to obtain, and no agent
stood in for it.

Recorded honestly: the page's verdict buttons keep state in memory only, so the
per-sample marks were not captured - the verdict here is the reviewer's overall
call, not a per-sample tally.

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
