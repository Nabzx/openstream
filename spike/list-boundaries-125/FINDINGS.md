# Findings - issue #125: can the break-placement model also flag list boundaries, and does the second output line cost anything?

**Not yet run.** This file is scaffolded with the questions and empty result
tables, the same way #15's eval corpus landed before it was scored. Run
`python3 bench.py` on the reference machine (M3 MacBook Air, 16 GB, both GGUFs
in `~/.cache/openstream-spike/models/`), then `python3 report.py`, then fill
this in and delete the "not yet run" wording.

The production contract change (`electron/breakPlacementHttpAdapter.js`,
`electron/paragraphBreaks.js`, `electron/dictationCoordinator.js`) shipped
alongside this scaffold **fail-closed**: an unreadable `LIST` line renders as
ordinary prose. So the feature is safe to have merged unmeasured - what is
unmeasured is whether it ever produces a *useful* list, and whether the second
line slowed break placement down. This spike answers both.

---

## Pre-run observation that will shape the result

Running the corpus through the real rules cleanup (`bench.py` prints the
numbering) shows the **run-on splitter fuses list items into single sentences**
on most of the natural samples - `list-standup` collapses to 2 sentences,
`list-groceries`' first three items land in one sentence, `inline-*` never
splits at all. This is #45's known segmenter weakness, and it means:

- The sentence-index contract can only mark a list **at sentence granularity**.
  Where items share a sentence, the best the model can do is flag the span and
  let each fused sentence become one bullet - which may or may not read
  acceptably. That is a `review.html` judgement.
- `list-deploy-steps` and `list-candidates` were written with enough spoken
  sentence structure to survive the splitter; they are the samples where list
  detection has a fair chance. If the model does well **only** there, the
  finding is "needs the #45 segmenter fixed first", not "model can't do it".
- The honest question this spike may end up answering is not "can SmolLM2 flag
  lists" but "does the pipeline ever hand it text where a list is expressible".

---

## Answer

_(one paragraph: ship / don't ship the list line, and why)_

---

## 1. Latency, against ~0.39s of headroom

#67 measured the break-only call at **0.11-0.12s** warm. The two-line reply
adds a `LIST:` line - a handful more tokens. Does the warm median move?

| Bucket | SmolLM2 two-line | SmolLM2 break-only (#67) | Qwen3 no-think two-line |
|---|---|---|---|
| 130 words | _tbd_ | 0.12s | _tbd_ |
| 200 words | _tbd_ | 0.11s | _tbd_ |
| worst single sample | _tbd_ | 0.19s | _tbd_ |

Output token count (median), two-line vs #67's 8: _tbd_

---

## 2. Breaks dimension - regression check vs #67

The `carry-*` samples are lifted straight from #67. Their paragraph breaks
should not have changed because the prompt now also asks about lists.

| Model | Format obeyed | Needed repair | Break indices match #67 |
|---|---|---|---|
| SmolLM2-1.7b | _tbd_ | _tbd_ | _tbd_ |
| Qwen3-1.7b (no think) | _tbd_ | _tbd_ | _tbd_ |

---

## 3. List dimension - recall on genuine lists

`list-*` samples. `list_overlap` is Jaccard of the flagged span against
`reference.py`'s span.

| Sample | n sentences | ref span | SmolLM2 span | overlap | reads well? (review.html) |
|---|---|---|---|---|---|
| list-groceries | 4 | (2,4) | _tbd_ | _tbd_ | _tbd_ |
| list-packing | 6 | (2,6) | _tbd_ | _tbd_ | _tbd_ |
| list-deploy-steps | 7 | (2,6) | _tbd_ | _tbd_ | _tbd_ |
| list-candidates | 7 | (2,6) | _tbd_ | _tbd_ | _tbd_ |

---

## 4. List dimension - false positives on the decoys

`decoy-*` samples use ordinal words ("first of all", "secondly") as a turn of
phrase. `inline-agenda` has a real list but only inside one sentence, so the
correct answer is still `LIST: none`. Every one of these must come back
`LIST: none`.

| Sample | SmolLM2 | Qwen3 no-think |
|---|---|---|
| decoy-thanks | _tbd_ | _tbd_ |
| decoy-argument | _tbd_ | _tbd_ |
| decoy-story | _tbd_ | _tbd_ |
| inline-agenda | _tbd_ | _tbd_ |

False-positive rate is the number that decides whether this ships: a wrongly
bulleted paragraph is far more jarring than a missed list.

---

## 5. Malformed-reply behaviour

`listbound.parse_reply` is the spike's copy of the shipped fail-closed logic
(`electron/paragraphBreaks.js`). Drive these through `report.py` §3:

- **Unreadable `LIST` line -> `range: None` -> prose.** Never a guessed span.
- **Out-of-range span -> clamped into the text**, or dropped if it collapses to
  under two items.
- **No `LIST` line at all** (model used #67's short form) -> breaks still parse,
  list is simply absent. The model dropping back to the old contract costs list
  detection, nothing else.
- **Never retry.** Same rule as #67 - the headroom does not allow it.

Confirmed against `electron/paragraphBreaks.test.js` and
`electron/dictationCoordinator.test.js`: _tbd, note any divergence found here_.

---

## Limits, stated

- **16 GB, fanless, one machine.** Same gap as #67 - not the 8 GB floor, not
  sustained thermals, every latency figure warm.
- **Text-only.** Corpus run through the real `rules.py`; transcribe cost from
  #24, not re-measured.
- **One author's list references.** `reference.py` is enough to catch a
  systematic miss or over-trigger, not to certify a success.
- **Twelve samples, ~half defeated by the segmenter.** Enough to expose whether
  the contract is expressible at all; not a corpus to certify list quality on.
- **One prompt.** The two-line prompt reuses #67's several-varied-examples
  decision; a better prompt might do better, and the `LIST` instruction in
  particular is untuned.
