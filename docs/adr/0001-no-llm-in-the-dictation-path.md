---
status: accepted, partially superseded
---

# No LLM in the dictation path

> **Partially superseded** by [#45](https://github.com/Nabzx/openstream/issues/45),
> which places break placement in long dictation with the rewrite model server. The
> model is asked which sentence numbers take a paragraph break and never returns text,
> so the cleanup decision below stands: cleanup is still rules-only, and no model
> rewrites dictated words. What no longer holds is the absolute claim that the
> dictation path touches no model at all, that voice editing is the only feature
> using one, or that the dictation path holds no rewrite model resident.

`README.md` and `ROADMAP.md` both assume every dictation runs through a local LLM cleanup pass (`llama-server`) for filler removal and punctuation, and five issues were scoped on that assumption without anyone measuring it. A throwaway spike measured it end to end ([issue #24](https://github.com/Nabzx/openstream/issues/24); code and data in `spike/llm-cleanup-latency/`). **We are removing the LLM from the dictation path**: cleanup is a deterministic rules engine costing 0.1-1.0 ms, and the local LLM is deferred to Phase 3 voice editing, which is now the only feature that uses one.

The feared "3-4 seconds per dictation" turned out to be an artifact of assuming the model is loaded per call; warm, a 3B model added only 0.31s to a short command. The decision does not rest on raw latency. It rests on **whisper already self-cleaning short clips** - fillers, stutters and punctuation are handled by the STT model itself - while *not* self-cleaning long ones. LLM value and LLM cost therefore rise together: the obvious compromise of gating the LLM by input length routes it to precisely the paragraph bucket where it costs 4.58s and skips it where it would have been affordable. There is no length band where the pass is both fast enough and worth having, which makes this a forced move rather than a judgement call. Two smaller findings reinforced it: both tested models silently edited meaning on clean short input at temperature 0, and neither could repair mis-transcriptions, which are the dominant quality problem.

**Budget this sets:** end-of-speech to text-ready under 1s. On an M3 MacBook Air, whisper `base.en` plus rules measures 0.12s / 0.18s / 0.61s across short, sentence and paragraph dictations.

## Consequences

- `README.md`'s "smarter output" differentiator no longer describes the dictation path. Whatever remains distinctive about dictation output now comes from the rules engine and from context-aware formatting, not from a model. The README still names Llama 3.2 and needs correcting ([issue #30](https://github.com/Nabzx/openstream/issues/30) owns that paragraph).
- The dictation path supervises **one** subprocess, not two, and holds no multi-gigabyte model resident.
- **Model choice is not this ADR's.** The spike measured Llama 3.2, but [issue #32](https://github.com/Nabzx/openstream/issues/32) subsequently dropped that family - it is gated on Hugging Face, which forces a user signup - in favour of an Apache 2.0 or MIT ungated model. What survives the spike is an empirical warning rather than a pick: a 1B-class model followed rewriting instructions too poorly to trust, so the ~1.7B permissive candidates must be checked against that failure mode.
- Measured on 16 GB, not the 8 GB floor, and on TTS audio rather than real speech. The decision happens to avoid holding a model resident, so it is robust to the memory gap; the TTS limitation, if anything, understates how much whisper self-cleans. Limits are recorded in full in `spike/llm-cleanup-latency/FINDINGS.md`.
- Deliberately left open and unmeasured: injecting rules-cleaned text immediately and swapping in LLM output asynchronously.
