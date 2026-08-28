---
status: accepted
---

# No one-model dictation engine

The [#176](https://github.com/Nabzx/openstream/issues/176) map asked whether a single
local speech model could be OpenStream's whole ordinary-dictation engine — one model
that takes completed audio and returns *final dictation text*, collapsing the
transcription and Rules-cleanup stages into itself and, ideally, standing in for the
rewrite model server too. Candidates were Nemotron 3.5 ASR Streaming 0.6B and Parakeet
TDT 0.6B v3 (Canary-1B-v2 was ruled out earlier for exceeding the 1 GB model-artifact
limit with no documented Mac runtime). [#178](https://github.com/Nabzx/openstream/issues/178)
benchmarked them against the whole contract on the M3 MacBook Air target.

**No candidate qualifies, so ordinary dictation stays two stages.** One transcription
model server turns audio into raw text; a deterministic Rules-cleanup stage
(`electron/cleanup/rules.js`) turns that into final dictation text. No model rewrites
dictated words. This is already the shape of `electron/dictationCoordinator.js`; this
ADR makes it the settled architecture rather than an interim state the roadmap still
expects to replace.

The benchmark's findings:

- **The budget-fitting models leave the work undone.** Parakeet and Nemotron produce
  literal ASR output — clear fillers ("um", "uh"), self-corrections ("scratch that"),
  and spoken punctuation commands ("comma", "new line") all pass straight through.
  That is transcription, not final dictation text; the cleanup stage still has to run.
- **Nemotron also misses the latency target** on long dictations, where the
  end-of-speech-to-cursor budget is under one second.
- **Canary-1B-v2 is out on size** before quality or latency can even be measured.

Routing a *fixed, deterministic* cleanup job (filler removal, spoken-punctuation
mapping, false-start repair, sentence segmentation) through a 0.6B model that does it
unreliably buys nothing over the lookup tables and regexes already in `rules.js`, and
inherits every failure mode a model brings. This mirrors ADR-0001's finding for LLM
cleanup and [#222](https://github.com/Nabzx/openstream/issues/222)'s for voice-edit
commands: where the transform is a closed set, a model is the wrong tool.

## Consequences

- **`dictationCoordinator.js`'s stage separation is committed, not provisional.**
  Transcription adapter → `cleanup/rules.js` → context detection → optional
  break placement (rewrite model, sentence indices only) → delivery or Held result.
  The [#188](https://github.com/Nabzx/openstream/issues/188) user stories — the 13
  disfluency and spoken-command behaviours — are Rules-cleanup's responsibility and
  live in `rules.js`.
- **This confirms and extends ADR-0001.** Not only "no LLM cleanup pass": no single
  ASR model that also self-cleans to the contract. The rewrite model server keeps its
  ADR-0001 / [#45](https://github.com/Nabzx/openstream/issues/45) role — break-placement
  indices for eligible long dictations, never final text.
- **The [#176](https://github.com/Nabzx/openstream/issues/176) map's destination no
  longer holds** and the map should be closed or re-pointed. Its "choose one model"
  framing is superseded here.
- **Which model fills the transcription model server role is a separate, open
  question.** `whisper base.en` fills it today; Parakeet TDT 0.6B v3 remains a
  candidate *for that role alone* (multilingual, punctuation, ~681 MiB — see
  [#203](https://github.com/Nabzx/openstream/issues/203)). Swapping the transcription
  model does not change the two-stage shape this ADR fixes.
- **English-only stands.** The #176 map reopened language scope only to evaluate a
  one-model engine without a translation requirement. With that approach rejected, the
  earlier English-only position holds unless revisited on its own.
- Measured on 16 GB, not the 8 GB floor. The decision keeps the pipeline to one
  resident speech model plus the small rewrite model, so it is not sensitive to that
  gap. Full limits in the #178 benchmark artifact.
