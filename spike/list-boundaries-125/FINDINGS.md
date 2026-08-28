# Findings - issue #125: can the break-placement model also flag list boundaries, and does the second output line cost anything?

Run **2026-08-27** on an Apple-Silicon MacBook (see *Limits*), `llama-server`
`b10639` from `scripts/fetch-llama.sh`, SmolLM2-1.7B-Instruct Q4_K_M held
resident and warmed. 5 warm reps per sample, median reported. 10 of the 12
corpus samples reached the model (`list-standup` and `inline-shop` collapse to
2 sentences under rules cleanup and fall below `MIN_SENTENCES`). Qwen3 was not
run - its GGUF is not in the repo fetch script. Data in `out/results.json`,
review page in `out/review.html`.

> **Re-run 2026-08-28 (for #126), clean Metal decode.** Same harness, same
> machine, this time with token generation actually on the GPU. It reproduces
> the negative content result exactly - breaks match **1/10**, list
> false-positive **5/10** - and finally gives a real latency number:
> **median 1.07s, min 0.93s, max 1.42s** for the two-line call (completion
> ~24 tokens). That is against #67's break-only **0.12s** and the **0.39s** of
> warm headroom in the 1s budget - roughly **3x over budget**. So the combined
> call now fails on latency as well as content. Cold start 7.6s, RSS 1.43 GB.
> The rest of this document (the 2026-08-27 run) stands; only §1 is superseded.

## Answer

**Do not ship list detection in the combined call as it stands.** The two-line
reply format is learnable - every reply came back well-formed `BREAKS: … /
LIST: …` - but the content is wrong on both dimensions:

1. **It regresses paragraph breaks.** SmolLM2 emitted `BREAKS: 1` on **10/10**
   samples. #67's break-only prompt suppressed sentence 1 reliably (1/12
   repairs); with the `LIST:` instruction sharing the system prompt, the
   sentence-1 prohibition stops working and the model also over-breaks.
2. **List precision is near zero.** A list was flagged on **9/10** samples,
   including **5 of 6 non-lists**. `LIST: none` essentially never fired.

The production contract change was therefore **pared back before merge**: the
live prompt is reverted to #67's break-only wording, and the LIST parse /
render path is kept, unit-tested, and **gated off** (`createDictationIntake({
listDetection: false })`). The parse still runs on every reply and its
`listBoundaries.*` diagnostics still fire - that is the telemetry a future
prompt needs - but nothing is rendered. `repairListRange`'s fail-closed
behaviour was confirmed here (see §5).

## What a follow-up should try

- **Keep #67's break prompt verbatim and append the LIST ask as a clearly
  secondary second line.** A quick A/B (`promptcmp.py`, variant B) restored
  clean break placement (`2, 4, 6`, no leading 1) - but the model then dropped
  the `LIST:` line entirely and reverted to a bare index list. So the two
  instructions appear to compete at 1.7B, consistent with #24's finding that
  1B-class models follow multi-part instructions unreliably.
- **A separate list-detection call.** Costs a second inference against the
  headroom, but that headroom needs re-measuring on real hardware anyway
  (see §1) and it isolates the two prompts.
- **A larger model**, per #32's still-open acquisition question.
- Heavier few-shot weighted toward `LIST: none` (variant C collapsed the format
  entirely - too terse - so this needs care).

---

## 1. Latency - not a usable measurement on this run

| Bucket | SmolLM2 two-line (this run) | SmolLM2 break-only (#67) |
|---|---|---|
| 130 words | 0.86 - 1.05s | 0.12s |
| 200 words | 1.26 - 1.37s | 0.11s |
| worst single sample | 1.37s | 0.19s |

**These numbers do not measure the contract and must not be compared to #67.**
Server timings show prompt eval at ~185 tok/s (Metal prefill working) but token
**generation at ~15-17 tok/s** - CPU-speed, ~4x slower than #67's Metal
generation - and `predicted_ms` swung 950-1700ms for an identical 18-token
reply, the signature of system contention. `-ngl 99` vs `-ngl 0` changed
prefill speed but not generation, so the prebuilt `b10639` binary is not
getting the model onto the GPU for decode on this machine, and the machine was
loaded. Median completion length was **18 tokens** (vs #67's 8 for the break
line alone) - the *only* latency-relevant fact this run establishes: the second
line roughly doubles output tokens, as expected.

**Re-run on a clean Metal-accelerated server before drawing any latency
conclusion.**

## 2. Breaks dimension - regressed by the second instruction

Every reply led with `BREAKS: 1`. After `repairBreakIndices` drops the illegal
1 and any out-of-range index:

| Sample | ref breaks | model (raw) | after repair | match |
|---|---|---|---|---|
| carry-arch-1 | 3, 6 | 1, 3, 6 | 3, 6 | yes (via repair) |
| carry-onboard-1 | 2 | 1, 2, 3 | 2, 3 | no (over-broke) |
| list-deploy-steps | – | 1, 2, 4, 6 | 2, 4, 6 | no |
| list-candidates | – | 1, 2, 4, 6 | 2, 4, 6 | no |
| (6 others) | – | `1, x` | `x` | spurious break kept |

Format obeyed 10/10; **repair needed 10/10** (vs #67's 1/12). The fail-closed
repair rescues `carry-arch-1` but cannot rescue a spurious *in-range* break.

## 3. List dimension - recall high, ranges loose

| Sample | ref span | model span | Jaccard | rendered list reads well? |
|---|---|---|---|---|
| list-groceries | 2-4 | 2-4 | 1.00 | _human: see review.html_ |
| list-packing | 2-6 | 2-6 | 1.00 | _human_ |
| list-deploy-steps | 2-6 | 3-5 | 0.60 | _human_ |
| list-candidates | 2-6 | 3-7 | 0.67 | _human_ |

All 4 genuine lists were flagged (recall 4/4); 2 spans exact, 2 off by a
sentence or two at each end.

## 4. List dimension - false positives (the number that killed it)

| Sample | should be | model said |
|---|---|---|
| decoy-thanks | none | 2-6 → clamped 2-3 |
| decoy-argument | none | 3-4 |
| decoy-story | none | `LIST: 3` → **rejected, none** (malformed, not judgement) |
| inline-agenda | none | 2-4 → clamped 2-3 |
| carry-arch-1 | none | 2-7 |
| carry-onboard-1 | none | 1-3 |

**5 of 6 non-lists got a list.** The one correct `none` came from a malformed
reply the parser rejected, not from the model declining. A wrongly bulleted
paragraph is far more jarring in real dictation than a missed list, so this
alone rules out shipping it on.

## 5. Malformed-reply behaviour - confirmed fail-closed

`listbound.parse_reply` mirrors the shipped `electron/paragraphBreaks.js`:

- `decoy-story`'s `LIST: 3` (a bare number, not a range) → `range: None` →
  rendered as prose. Correct.
- `decoy-thanks` / `inline-agenda` out-of-text spans (`2-6` on 3 sentences) →
  **clamped** into range (`2-3`), `repairUsed` flagged.
- Every reply that omitted a parseable range degraded to prose; none was
  retried.

Matches `electron/paragraphBreaks.test.js` and
`electron/dictationCoordinator.test.js` (the "off by default" and
"fails closed" cases). No divergence found.

## Limits, stated

- **One machine, heavily loaded, generation not GPU-accelerated.** Latency
  (§1) is unusable; everything else (which sentences come back) is temperature-0
  deterministic and reproduced identically across two runs.
- **`--list-devices` reports "Apple M1"**, not the M3 in #67's write-up and this
  spike's original README - so the hardware baseline is not the one #67
  established either. Confirm the machine before re-running.
- **One prompt.** The `LIST` instruction is untuned; §"What a follow-up should
  try" is the point of continuing.
- **One author's list references**, 10 samples, ~half with items the run-on
  splitter fused into single sentences. Enough to show the current prompt
  fails; not a corpus to certify a fixed one.
- **Qwen3 not run.**
