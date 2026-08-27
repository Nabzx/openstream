# Prompted local rewrite models for Rules cleanup

Research note for the child issue **Which local rewrite models fit prompted Rules cleanup?** under **Map: evaluate prompted local-model cleanup**.

- Researched: 2026-08-27.
- Scope: ungated, locally runnable English instruct models and runtimes for prompted Rules cleanup on macOS Apple Silicon.
- Status: research only. This note does not select a production model.

## Constraints and the short answer

OpenStream is local-only. Ordinary Dictation must preserve meaning and dictated wording, while Rules cleanup removes only clear disfluencies. The release-to-cursor budget is under one second, including delivery. The rewrite model is therefore a resident helper for a bounded, short-output request, not a replacement for transcription and not permission to rewrite arbitrary text.

The strongest documented candidates found are **Qwen3-1.7B**, **SmolLM2-1.7B-Instruct**, **Granite-3.3-2B-Instruct**, and **OLMo-2-0425-1B-Instruct**. All have ungated public artifacts and Apache 2.0 declarations, but only SmolLM2 has direct model-card evidence for a text-rewriting task. None has evidence that it preserves dictated wording under OpenStream's contract. **LFM2.5-1.2B-Instruct** is technically attractive, but its LFM Open License has a $10 million commercial-revenue threshold, so it does not fit the project's preference for permissive, low-risk redistribution.

No primary source found supplies candidate-specific cold latency, warm latency, resident RSS, or peak RSS on an Apple Silicon Mac. Those values need the later prototype. The existing OpenStream prototype is useful evidence about measurement method and contract risk, but its measured models are ASR models, not these rewrite candidates.

## Candidate artifact ledger

Sizes below are exact bytes from the Hugging Face model API tree at the stated repository revision. `Q4_K_M` is the practical comparison point. The LFS OID is included so a later prototype can verify the downloaded bytes. Artifact bytes are not resident or peak process memory.

| Candidate and source revision | License and access | Quantization artifact | Bytes | Context evidence | Runtime status |
| --- | --- | --- | ---: | --- | --- |
| [Qwen3-1.7B-GGUF](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/tree/daeb8e2d528a760970442092f6bf1e55c3b659eb), `daeb8e2d528a760970442092f6bf1e55c3b659eb` | HF API reports `gated: false`; card declares Apache 2.0. Base model license is [Apache 2.0](https://huggingface.co/Qwen/Qwen3-1.7B/raw/70d244cc86ccca08cf5af4e1e306ecf908b1ad5e/LICENSE). | `Qwen3-1.7B-Q4_K_M.gguf`, LFS OID `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5` | 1,282,439,264 | GGUF metadata and base `config.json` say 40,960. The GGUF card's prose says 32,768. Treat the discrepancy as unresolved rather than promising either number. | Official Qwen card gives a llama.cpp command. llama.cpp support for Qwen3 was merged in [commit `d3bd7193ba66c15963fd1c59448f22019a8caf6e`](https://github.com/ggml-org/llama.cpp/commit/d3bd7193ba66c15963fd1c59448f22019a8caf6e). |
| [SmolLM2-1.7B-Instruct-GGUF](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/tree/2d4a76a30b4af41ecd395c35725ac11688d4cfe4), `2d4a76a30b4af41ecd395c35725ac11688d4cfe4` | HF API reports `gated: false`; official model card declares Apache 2.0 and links the Apache license. | `smollm2-1.7b-instruct-q4_k_m.gguf`, LFS OID `decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33` | 1,055,609,536 | GGUF metadata and base [config.json](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/raw/31b70e2e869a7173562077fd711b654946d38674/config.json) say 8,192. | Official Hugging Face GGUF repo gives llama.cpp usage. |
| [Granite-3.3-2B-Instruct-GGUF](https://huggingface.co/ibm-granite/granite-3.3-2b-instruct-GGUF/tree/7cdf86ccd1f1bb3491c9b7017b033f2e51367397), `7cdf86ccd1f1bb3491c9b7017b033f2e51367397` | HF API reports `gated: false`; IBM model card and GGUF card declare Apache 2.0. The IBM card links the Apache license. | `granite-3.3-2b-instruct-Q4_K_M.gguf`, LFS OID `ac71e9e32c0bea919b409c5918f69ca74339854b0319c5065e4e9fb6d95c4852` | 1,545,303,328 | IBM [config.json](https://huggingface.co/ibm-granite/granite-3.3-2b-instruct/raw/707f574c62054322f6b5b04b6d075f0a8f05e0f0/config.json) says 131,072. The model card calls this 128K. | IBM publishes the GGUF family; llama.cpp has Granite support. The exact runtime compatibility should still be tested at the pinned runtime revision. |
| [OLMo-2-0425-1B-Instruct-GGUF](https://huggingface.co/allenai/OLMo-2-0425-1B-Instruct-GGUF/tree/62f8c199538474c3e33ed5d7e0580abd66686a27), `62f8c199538474c3e33ed5d7e0580abd66686a27` | HF API reports `gated: false`; official AllenAI card declares Apache 2.0 and says the model is intended for research and educational use. No separate license file was exposed by the checked model repo. | `OLMo-2-0425-1B-Instruct-Q4_K_M.gguf`, LFS OID `abd8187934a438fbf7cfff0a1de5b9d2793ce913f158794df1951dcba6c93cc6` | 935,515,296 | Official [config.json](https://huggingface.co/allenai/OLMo-2-0425-1B-Instruct/raw/48d788eca847d4d7548f375ad03d3c9312f6139e/config.json) says 4,096. | Official AllenAI GGUF repo exists. llama.cpp has OLMo2 support, including [merged support PR](https://github.com/ggml-org/llama.cpp/pull/12400). |

The Qwen, SmolLM2, and Granite repositories also publish larger Q8 or F16 files. Their exact checked sizes are available in the revision-pinned API trees. A later prototype should compare Q4_K_M and Q8 where output fidelity justifies the extra bytes.

### A technically promising but unsuitable license

[LiquidAI LFM2.5-1.2B-Instruct-GGUF](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/tree/6767265158422fb8a19c62ceb45f16f05363615b), revision `6767265158422fb8a19c62ceb45f16f05363615b`, is ungated and has an official Q4_K_M artifact of 730,895,168 bytes, LFS OID `b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5`. Its model card claims day-one llama.cpp and MLX support, 32,768-token context, and under 1 GB memory, but those are not target-Mac measurements. The [LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct/raw/6767265158422fb8a19c62ceb45f16f05363615b/LICENSE) permits redistribution subject to conditions, but section 5 says commercial use by a legal entity at or above $10 million annual revenue is not licensed. That is a meaningful restriction for a redistributable OpenStream artifact, not a clean alternative to Apache 2.0.

## Runtime evidence

### llama.cpp

The checked runtime is llama.cpp release `v0.3.0`, target commit [`c1d0e7a004015f23bc0233470b747b596f29b264`](https://github.com/ggml-org/llama.cpp/releases/tag/v0.3.0). Its [MIT license](https://raw.githubusercontent.com/ggml-org/llama.cpp/c1d0e7a004015f23bc0233470b747b596f29b264/LICENSE) is permissive for an installer with attribution.

The versioned [README](https://raw.githubusercontent.com/ggml-org/llama.cpp/c1d0e7a004015f23bc0233470b747b596f29b264/README.md) says Apple silicon is a first-class target optimized with ARM NEON, Accelerate, and Metal. The versioned [build guide](https://raw.githubusercontent.com/ggml-org/llama.cpp/c1d0e7a004015f23bc0233470b747b596f29b264/docs/build.md#metal-build) says Metal is enabled by default on macOS and that it runs computation on the GPU. It also documents 1.5-bit through 8-bit integer quantization.

`llama-server` is a suitable local process boundary. Its [server documentation](https://raw.githubusercontent.com/ggml-org/llama.cpp/c1d0e7a004015f23bc0233470b747b596f29b264/tools/server/README.md) documents loopback HTTP use, `--offline`, resident model loading, `--warmup`, `--perf`, memory-map or mlock load modes, and cache controls. The same document says the server supports schema-constrained JSON. The [GBNF guide](https://raw.githubusercontent.com/ggml-org/llama.cpp/c1d0e7a004015f23bc0233470b747b596f29b264/grammars/README.md) documents grammar-constrained generation and JSON Schema conversion. This can constrain an answer such as `{"break_sentences":[...]}` or a status object. It cannot force the model to preserve source wording inside an unconstrained string.

The official [llama-bench documentation](https://raw.githubusercontent.com/ggml-org/llama.cpp/c1d0e7a004015f23bc0233470b747b596f29b264/tools/llama-bench/README.md) defines prompt processing, token generation, and combined tests, repeats them, and reports tokens per second. It explicitly excludes tokenization and sampling. It has a warmup switch but does not produce a candidate-specific end-of-speech-to-cursor result. Generic tokens-per-second numbers are therefore not proof of the OpenStream output contract.

### MLX-LM

Apple's [MLX-LM](https://github.com/ml-explore/mlx-lm) is MIT-licensed at revision [`ff8289c67a4661b232e30466b231b34dbac3428b`](https://github.com/ml-explore/mlx-lm/commit/ff8289c67a4661b232e30466b231b34dbac3428b). Its README describes text generation and fine-tuning on Apple silicon, MLX quantized models, prompt caching, and a configurable prefill step size. The source's `GenerationResponse` reports prompt tokens, generation tokens, tokens per second, and `peak_memory`; the generator supports a logits-processor callback. These are useful measurement hooks, not measurements.

The official MLX community conversion [Qwen3-1.7B-4bit](https://huggingface.co/mlx-community/Qwen3-1.7B-4bit/tree/3b1b1768f8f8cf8351c712464f906e86c2b8269e), revision `3b1b1768f8f8cf8351c712464f906e86c2b8269e`, says it was converted from Qwen3 with mlx-lm 0.24.0. Its `model.safetensors` is 968,080,210 bytes, LFS OID `0e86d9677e519323849eac1bc272caae88567a481ff188c431f70be543d9995f`, and the complete checked repository payload is 984,014,814 bytes including tokenizer and metadata. The model card declares Apache 2.0 through the Qwen base model and says it is ungated. This is evidence that MLX can run a candidate, not evidence that it meets the latency or wording contract.

No constrained-decoding API was found in the checked MLX-LM README or generation source equivalent to llama.cpp's GBNF/JSON Schema interface. MLX-LM exposes logits processors, which may be a lower-level seam for a later experiment, but that is not the same as documented structured output.

## Quality evidence relevant to dictated wording

### Direct candidate evidence

SmolLM2 is the only checked candidate whose official model card makes a task-specific claim. It says the instruct model supports text rewriting and reports `OpenRewrite-Eval (micro_avg RougeL) = 44.9`, compared with `46.9` for Qwen2.5-1.5B-Instruct in the same table. It includes a prompt that says to rewrite an email while maintaining its main points and key message. This establishes that the model was trained and evaluated for a broad rewriting task. It does **not** establish exact wording preservation, safe removal of only clear disfluencies, or compliance with OpenStream's final-text contract.

Qwen3's card claims instruction following and shows a non-thinking mode. Granite's card lists summarization, extraction, and instruction following and documents separate `<think>` and `<response>` tags. OLMo's card reports IFEval and other generic evaluations. None of those cards tests dictated speech, disfluency removal, correction selection, or semantic preservation. Granite's thinking mode is also a poor default for a sub-second bounded request unless explicitly disabled and measured.

### OpenStream evidence

The existing cleanup spike measured on an M3 MacBook Air, 16 GB, macOS 15.6.1, with resident llama.cpp servers. Its `FINDINGS.md` reports warm 3B added 0.31 seconds for a short command but 4.58 seconds for a roughly 130-word paragraph. It also reports meaning drift on clean short input: a tested model dropped the hedge "I think" despite a no-rephrase instruction. The test models were Llama 1B and 3B, not the candidates above, and the audio was macOS TTS. This is a warning about the task, not a ranking of these candidates.

The newer [one-model prototype results](../../prototypes/one-model-dictation-178/RESULTS.md), commit [`3174314c38971a92e410f81bb7d04af44e3b9957`](https://github.com/Nabzx/openstream/commit/3174314c38971a92e410f81bb7d04af44e3b9957), measures ASR candidates rather than rewrite models. It is still useful for the method: it separates artifact bytes, resident RSS, peak RSS, cold startup, warm request latency, and cursor-excluded contract checks. It explicitly warns that WER and generic speed do not prove the OpenStream contract.

## Memory, latency, and installer accounting

Keep these quantities separate:

- **Model artifact bytes:** the exact downloadable GGUF or MLX file above. A Q4_K_M file around 0.94 to 1.55 GB is not a memory measurement.
- **Resident process memory:** model pages and runtime allocations after load. With mmap, not every artifact page must be resident; with Metal, buffers may be allocated in unified memory.
- **Peak process memory:** load-time, prefill, KV cache, shader compilation, and temporary buffers can exceed resident post-warmup memory.
- **Complete installer size:** Electron, native helpers, runtime, resources, and model together. No official source gives an OpenStream installer size for these candidates, so it remains unavailable.

The source documentation gives controls, not target evidence. llama.cpp can report internal timing with `--perf`, choose mmap or mlock, and change KV cache types. MLX-LM reports peak memory in its generation response and allows prefill-step and KV-cache controls. Neither supplies cold and warm numbers for these four candidate artifacts on the target Mac. The later prototype should record at least process RSS, peak RSS, model load time, first result, warm p50/p95, and release-to-cursor delivery on an 8 GB and a 16 GB Apple Silicon Mac.

For a prompted Rules cleanup prototype, the request should be bounded aggressively: a short system prompt, a small maximum output, no thinking, and a structured response that carries either the cleaned text or a safe refusal. Structured output limits syntax only. It does not stop a model from changing words inside a JSON string. A safer experiment may ask for edit operations or sentence indices and apply them to the original text, but that design question belongs to the prototype and human review.

## Conclusion

The research establishes several viable, ungated artifact and runtime combinations. SmolLM2 has the clearest direct rewriting evidence, while Qwen3, Granite, and OLMo2 add permissive alternatives with publicly pinned GGUFs. llama.cpp provides the most complete documented Metal, GGUF, server, and constrained-output path. MLX-LM provides a second Apple Silicon runtime and exposes useful peak-memory and timing hooks.

The evidence does not establish that any candidate preserves dictated wording while removing only clear disfluencies. It also does not establish cold or warm latency, resident or peak memory, or complete installer size for OpenStream's target machines. Those are prototype measurements. This note intentionally makes no production selection before that prototype and a human decision.