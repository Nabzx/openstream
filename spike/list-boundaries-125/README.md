# PROTOTYPE - list-boundary detection spike (issue #125)

**Throwaway. Not production code.** No tests, no error handling, no
abstractions. It exists to answer one question and then be deleted:

> Can the break-placement model (SmolLM2-1.7B-Instruct, provisional per #32)
> also flag where a speaker rattled off a **list** - reliably enough to render
> it as bullets - and does asking for that second answer in the same call cost
> anything against #67's measured break-placement latency and reliability?

Sibling of `spike/break-position-67/`, whose harness shape, machine, and sample
buckets this reuses so the numbers are **directly comparable to #67's**. The
break-placement half of every measurement here should reproduce #67; any drift
is the cost of the second output line.

## Scope

This measures the contract change #125 makes: the rewrite model server is
handed numbered sentences and answers on **two labelled lines** -

```
BREAKS: 3, 7
LIST: 5-8
```

- never with rewritten text (#45, #90). `LIST: N-M` claims that sentences N
through M are spoken list items; `LIST: none` is the common answer.

It does **not** re-open whether a model belongs on the dictation path (#67
settled that), and it does **not** touch the rules-only list handling #124
shipped for *explicitly* spoken cues ("bullet point", "new bullet"). This is
about the **unmarked** list a rules regex structurally cannot catch - "grab
milk, eggs, bread and butter" - where the only reader positioned to notice the
structure is the model already reading the whole dictation for break placement.

## The budget it must fit

Unchanged from #67: end of speech to text ready is committed to **under 1s**;
whisper `base.en` + rules spends **0.61s** on the 130-word bucket (#24), leaving
**~0.39s** of warm headroom. #67's break-only call sat at **0.11-0.12s** warm.
The second output line adds a handful of tokens; this spike measures whether
that is still true in practice.

## What it produces

1. Warm latency of the two-line call per length bucket, against 0.39s, and
   **beside #67's break-only figure** for the same samples.
2. For the **breaks** dimension: same syntactic-validity + repair-rate tracking
   as #67, to confirm the second line did not degrade break placement.
3. For the **list** dimension: precision / recall of the flagged ranges against
   `reference.py` (the spike author's own read), plus the false-positive rate on
   the ordinal-word decoy samples - the case #124's ticket flagged as the hard
   one.
4. A human-drivable review page (`out/review.html`) rendering every sample
   paragraphed-and-listed four ways (no structure / model / rules-#124 / the
   author). List quality is a taste call and a person has to make it.
5. Malformed-reply behaviour driven through `listbound.parse_reply`: a botched
   `LIST` line must fail closed to prose, never a guessed list (#90's rule).

## Sample corpus (`samples.py`)

| Group | What it is | What it tests |
|---|---|---|
| `list-*` | genuine spoken lists, items as separate clauses | recall |
| `inline-*` | genuine lists, items inside **one** sentence | the known structural gap - can the sentence-index contract even express this? |
| `decoy-*` | ordinal words used as a turn of phrase, not a list | false-positive rate (#124's hard case) |
| `carry-*` | samples lifted straight from #67 | breaks-dimension regression vs #67 |

## Candidates

Same as #67: **SmolLM2-1.7B-Instruct Q4_K_M** (provisional, ship candidate) and
**Qwen3-1.7B Q4_K_M** (alternate, thinking disabled).

SmolLM2 and `llama-server` now come from `scripts/fetch-llama.sh` (#14) into
`resources/`, and `bench.py` picks them up there. Qwen3 is not in that script -
drop `Qwen3-1.7B-Q4_K_M.gguf` into `~/.cache/openstream-spike/models/` (#67's
location) to include it. Nothing here is committed except code and results.

## Stated assumptions and limits

- **M3 MacBook Air, 16 GB, macOS 15.6.1** - same machine as #24 and #67, so
  comparable. Not the 8 GB floor; not sustained thermals.
- **Text-only.** Input is the sample corpus run through the real rules cleanup
  (`spike/llm-cleanup-latency/rules.py`), which is the pipeline input in
  production. Transcribe cost is taken from #24, not re-measured.
- The `reference.py` list ranges are **one author's read** of where a list
  begins and ends - enough to expose a systematic miss or a systematic
  over-trigger, not enough to certify a success.
- `inline-*` samples are expected to score badly and that is the point: a
  sentence-index contract cannot mark a sub-sentence span. If they score
  *well*, that is a finding (the segmenter is splitting those lists into
  clauses anyway).

## Status

**Run 2026-08-27, result negative - see `FINDINGS.md`.** The two-line prompt
regressed paragraph breaks (`BREAKS: 1` on every sample) and over-triggered
lists (flagged on 5 of 6 non-lists). The production contract was pared back:
live prompt reverted to #67's break-only wording, LIST parse/render kept but
gated off (`createDictationIntake({ listDetection: false })`).

To re-measure after a prompt iteration:

    bash ../../scripts/fetch-llama.sh    # SmolLM2 + llama-server, once
    python3 bench.py                     # writes out/results.json
    python3 report.py                    # writes out/review.html
    python3 promptcmp.py                 # A/B a new system prompt vs the shipped one

The latency rows still need a **clean Metal-accelerated server** - this run's
token generation was CPU-speed (~15 tok/s) and the numbers are unusable.
