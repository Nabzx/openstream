# Findings - issue #24: does the local LLM cleanup pass earn its latency?

Measured on **M3 MacBook Air, 16 GB, macOS 15.6.1** (fanless; above the 8 GB
floor). whisper.cpp 1.9.2, llama.cpp b0.2.0, both run as **resident servers**
and warmed before timing. Median of 3 runs. Full data in `out/results.json`,
`out/sustained.json`; browsable side-by-side comparison in `out/report.html`.

## Answer

**LLM cleanup does not cost 3-4 seconds - the feared number was wrong.** But it
still should not sit on the critical path of every dictation, because the case
where it is fast is the case where it adds nothing, and the case where it adds
something is the case where it is too slow.

Recommendation: **ship deterministic rules cleanup as the always-on path. Do not
put `llama-server` in the dictation hot path.** Reserve the LLM for the
explicitly-invoked voice-editing feature (Phase 3), where the user has asked for
a rewrite and expects to wait.

**Why "just gate the LLM by length" does not rescue it.** That is the obvious
counter-proposal, and the data kills it: gating by length routes the LLM to
precisely the paragraph bucket where it costs 4.58s, and skips it on the short
bucket where it is affordable. Value and cost rise together. There is no length
band where the LLM pass is both fast enough and worth having, so this is a
forced move rather than a judgement call.

One design the data does *not* rule out, and which was not measured: inject
rules-cleaned text immediately, then swap in LLM output asynchronously a few
seconds later. Flagged so #12-#17 do not rediscover it; out of scope here.

## 1. Warm per-dictation latency (whisper base.en, seconds)

| Bucket | Transcribe | + rules | + Llama 1B | + Llama 3B |
|---|---|---|---|---|
| short (~13 words) | 0.12 | **0.12** | 0.28 | 0.43 |
| sentence (~37 words) | 0.18 | **0.18** | 0.94 | 1.41 |
| paragraph (~130 words) | 0.61 | **0.61** | 2.95 | 4.58 |

Rules cleanup costs 0.1-1.0 **milliseconds**. It is free.

Whisper small.en roughly triples transcribe time (0.32 / 0.51 / 1.51s) for
noticeably better transcripts - a real speed/accuracy knob, independent of this
decision.

The original 3-4s fear was an artifact of assuming per-call model loading. Warm,
the 3B pass costs 0.31s on a short command. **The paragraph bucket is where it
breaks**: 4.58s end-to-end is slower than typing, exactly the inversion the
issue warned about.

## 2. Startup cost (once per app launch, not per dictation)

| Process | Spawn -> first result |
|---|---|
| whisper-server base.en | 0.38s |
| whisper-server small.en | 0.81s |
| llama-server 3B | 2.27s |
| llama-server 1B | 1.64s |

If `llama-server` is started lazily, the first dictation pays +2.27s on top.
Starting it eagerly means holding ~2 GB resident for the entire session.

## 3. Sustained use (fanless)

527 back-to-back dictations over 12 minutes, whisper base.en + 3B. Comparing
each sample against itself (first third vs. last third - comparing raw first and
last iterations conflates drift with which clip landed there, and reports a
misleading +34.6%):

| Sample | first third | last third | drift |
|---|---|---|---|
| cmd-1 | 0.49s | 0.55s | +13.0% |
| cmd-2 | 0.62s | 0.73s | +16.6% |
| cmd-3 | 0.65s | 0.74s | +14.1% |
| sent-1 | 1.86s | 2.14s | +15.5% |
| sent-2 | 2.16s | 2.49s | +15.3% |
| sent-3 | 1.63s | 1.84s | +12.5% |
| **mean** | | | **+14.5%** |

A consistent ~15% slowdown, uniform across samples, so it is real load-related
degradation rather than noise. Note this is a far heavier duty cycle than real
dictation; treat +15% as an upper bound on what a user would feel. Wall-clock
drift is a sudo-free proxy - no power or temperature sensors were read.

## 4. Quality - the part that actually decides it

**Whisper already does most of the cleanup on short clips.** Raw base.en output
for `"um can you just uh run the the test suite again period"` is
`"How can you just run the test suite again period?"` - fillers gone, stutter
collapsed, capitalised, question mark inferred. There is very little left for a
cleanup pass to do. On the 130-word paragraph it does *not* self-clean: `"the
the"`, `"it it"`, `"is is"` all survive and punctuation is sparse. So cleanup
value is concentrated exactly in the bucket where the LLM is too slow.

**Both LLMs damage meaning on short input.** The clean-input case is `cmd-3`,
where whisper produced coherent text (`"Okay so I think we should probably you
know bump the time out to 30 seconds."`). Both models still dropped the hedge
`"I think"` - 3B gave `"We should probably bump the time out to 30 seconds."`,
1B gave `"Okay, so we should bump the time out to 30 seconds."` *wrapped in
quotation marks*, and left whisper's line wrapping intact. Rules gave
`"I think we should probably bump the time out to 30 seconds."` - faithful.
Dropping a hedge changes what the speaker committed to; that is a meaning edit,
not a cleanup.

A second example, `cmd-1`, is more dramatic - 1B turned `"can you run"` into
`"I can run"` and 3B dropped the question entirely - but discount it: whisper
had already garbled that input into `"How can you..."`, so the models were
reacting to corrupted text. `cmd-3` is the one that survives the TTS caveat.

Temperature was 0 with an explicit "do not rephrase" instruction; these are
instruction-following failures, not sampling noise.

**On paragraphs, 3B is clearly the best output.** It produced the closest match
to the human reference, with correct clause boundaries. Rules split run-ons on
conjunctions and land boundaries mid-clause (`"...going back. And forth on
because..."`). This is the one place the LLM genuinely earns something - and it
costs 4.58s to get it.

**Neither path fixes mis-transcriptions**, which are the dominant quality
problem. `"um so the the problem"` transcribed as `"I'm so that the problem"`,
and rules, 1B and 3B all faithfully preserve the error. Cleanup cannot repair
what STT got wrong. Caveat: this particular class of error is inflated by TTS
(see limits).

## 5. Limits - read before acting on this

- **16 GB, not 8 GB.** Nothing here tests the memory floor. The recommendation
  happens to avoid holding 2 GB resident, so it is robust to that gap, but a
  decision to ship the LLM hot path would need re-measuring at 8 GB.
- **TTS audio, not real speech.** `say` at 150 wpm. Transcribe timings are
  sound (they track duration and model size, and scale correctly: 0.11s at 3s
  audio -> 0.60s at 38s). The quality half is weaker: TTS renders "um" as a
  crisp lexical word that whisper converts into a wrong real word ("um can" ->
  "How can"), whereas a real human "um" is non-lexical and whisper usually drops
  it. So filler-removal difficulty here is pessimistic, and the
  mis-transcription rate is inflated. **The finding that whisper self-cleans
  short clips would only get stronger with real speech.**
- **LLM timings understate prefill.** Requests were sent with
  `cache_prompt: true` and each sample was repeated 3 times, so the median run
  is a KV-cache hit on text a real user would never have sent before. In
  production only the system prompt is cacheable. The true cost is somewhat
  higher, most on the paragraph bucket. This biases *in favour* of the LLM, so
  it strengthens rather than threatens the conclusion.
- **The paragraph bucket was not run under sustained load.** The 12-minute run
  cycles only short and sentence samples. Applying the measured +14.5% to the
  4.58s paragraph figure puts it near 5.2s under sustained use - an
  extrapolation, not a measurement.
- 8 samples, one machine, one session. Directional, not statistical.
- Prompt was not tuned. A better cleanup prompt might fix the 3B meaning-drift
  on short input; it would not change the latency curve, which is what decides
  the question.

## Impact on the roadmap

Issues #12, #13, #14, #15 and #17 assume LLM cleanup is in the dictation path.
On this evidence that assumption should be inverted: those tickets should be
re-scoped around a rules engine, with `llama-server` deferred to Phase 3
voice-editing. This is ADR-shaped - see `docs/adr/`.
