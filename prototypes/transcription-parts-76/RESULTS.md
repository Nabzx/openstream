# Results

## Verdict

`whisper-server` does not have an incremental transcription session. Every `/inference` request accepts a complete audio file, creates fresh PCM buffers, and calls `whisper_full_parallel` over that file. The server keeps the model resident, but no audio, decoder state, or token history survives between requests.

A client can imitate parts by making several complete requests and passing earlier text back as `prompt`. That cuts the post-key-release decode on long dictations by about two thirds in this probe, but it changes words and sentence punctuation. My recommendation is to reject it and use one whole-recording decode. The latency gain is real; the transcript is no longer equivalent, and the punctuation loss breaks the numbered-sentence input expected by the paragraph-break call.

## Source finding

The pinned `whisper-server` handler:

1. locks the model for one request;
2. requires a complete multipart `file`;
3. allocates new PCM vectors;
4. calls `whisper_full_parallel` on all samples in that request.

See [`server.cpp` at the pinned commit](https://github.com/ggml-org/whisper.cpp/blob/371b5a7561823ab2bb32142d2751e35e7534727b/examples/server/server.cpp#L817-L990).

Upstream's microphone streaming example does not preserve decoder state either. It rebuilds an audio window, calls `whisper_full` again, and carries only overlap audio plus prompt tokens into later calls. See [`stream.cpp` at the pinned commit](https://github.com/ggml-org/whisper.cpp/blob/371b5a7561823ab2bb32142d2751e35e7534727b/examples/stream/stream.cpp#L279-L341) and its overlap handling at [lines 412-427](https://github.com/ggml-org/whisper.cpp/blob/371b5a7561823ab2bb32142d2751e35e7534727b/examples/stream/stream.cpp#L412-L427).

There are therefore two available mechanisms:

- Send the growing recording each time. Earlier text may change, and key release still re-decodes the whole recording.
- Send disjoint audio parts. Earlier parts never change, but the model loses acoustic context at each cut.

Only the second mechanism can buy the latency promised by [Streaming or batch transcription?](https://github.com/Nabzx/openstream/issues/31), so the probe measured it.

## Candidate policy

The least-bad policy found in the sweep was:

- Keep recordings up to 15 seconds as one request.
- Once pending audio exceeds 15 seconds, decode the oldest 10 seconds.
- Keep at least 5 seconds pending, so key release never sends a tiny tail.
- Pass the transcript so far as the next request's `prompt`.
- Stitch each response once. Earlier text is final and has a 0% revision rate.

The 5-second reserve matters. Arbitrary 3-second cuts produced up to 50% word error against the whole decode on a short sample. A tail sweep from 0.2 to 9 seconds also produced a cut-off `mon` where the whole decode had `input`.

## Timing and word accuracy

Warm, unstressed, M3 MacBook Air, 16 GB, pinned `base.en`, clean 150 WPM TTS:

| Bucket | Audio duration | Whole decode | Candidate final decode | Total candidate compute | Word error vs whole |
|---|---:|---:|---:|---:|---:|
| Short, 3 samples | 3.2-4.9s | 0.09-0.10s | 0.08-0.10s | 0.08-0.10s | 0% |
| Sentence, 3 samples | 11.4-12.9s | 0.15-0.16s | 0.15-0.16s | 0.15-0.16s | 0% |
| Paragraph 1 | 37.9s | 0.46s | 0.14s | 0.61s | 0.7% |
| Paragraph 2 | 41.7s | 0.45s | 0.16s | 0.56s | 1.5% |

The candidate does no extra work on short and sentence dictations. On paragraphs it reduces post-key-release model time by 66-70%, while increasing total decode work by 24-32%. The earlier requests fit easily inside each 10-second audio interval. Applying the prior 14.5% thermal drift to the slower final part gives about 0.18 seconds.

## The accuracy problem hidden by WER

Word error rate understates the damage because punctuation is structural input to the next pipeline stage.

Whole decode of paragraph 2:

> So that the onboarding flow needs to handle three separate permission prompts and they all behave differently which is annoying. Our microphone access is the standard one that pops a system dialogue immediately. Accessibility is the one where Mac OS just silently denies you until the user goes into system settings and flips the toggle manually and then input monitoring is is the one nobody remembers exists until the global hotkey doesn't fire what I think we should do is is detect all three up front on first law or to show a single checklist screen with with a green tick next to each one as it gets granted and just pull every second or so to update it because there's no callback for the accessibility one anyway.

Candidate parts:

> So that the onboarding flow needs to handle three separate permission prompts and they all behave differently which is annoying our microphone access is the standard one that pops a system dialogue immediately accessibility is the one where Mac OS just silently denies you until the user goes into system settings and flips the toggle manually and then input monitoring is is the one nobody remembers exists until the global hotkey doesn't fire what I think we should do is is detect all three up front on first law launch show a single checklist screen with with a green tick next to each one as it gets granted and just pull every second or so to update it because there's no callback for the accessibility one anyway

The parts version improves the garbled `first law or to show` into `first law launch show`, but drops every sentence boundary. [What do the prose cleanup rules concretely do to text?](https://github.com/Nabzx/openstream/issues/45) and [Is the break-position call fast enough, and does a 1.7B model pick sensible paragraph breaks?](https://github.com/Nabzx/openstream/issues/67) expect numbered sentences before the break-position call. This sample becomes one sentence, so that call has nothing to place.

## Human check

The remaining judgment is whether the latency reduction is worth accepting changed words and lost sentence boundaries. I do not think it is. Recovering punctuation would add a new model task or require a whole-recording final pass, and the latter gives back the latency win.
