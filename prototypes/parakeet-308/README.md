# Parakeet prototype (#308)

**Throwaway harness. Not production wiring, not on the build.**

## Question

`large-v3-turbo` was accurate but too slow ([#310](https://github.com/Nabzx/openstream/issues/310), reverted). Is **Parakeet TDT 0.6B v3** accurate enough and fast enough on Apple Silicon to replace `whisper base.en`?

The research so far ([#204](https://github.com/Nabzx/openstream/issues/204), [#205](https://github.com/Nabzx/openstream/issues/205), `docs/competitive/opensuperwhisper.md`): NVIDIA's Parakeet, ~600 MB, very accurate, fast on the ANE. OpenSuperWhisper ships it in production via FluidAudio's Swift/CoreML package. The open question was always "does the local runtime hold up", and nobody had measured it here.

## What this is

`server.py` runs Parakeet via [parakeet-mlx](https://github.com/senstella/parakeet-mlx) and exposes the **same HTTP contract as the bundled `whisper-server`** on `:8178`:

```
POST /inference   multipart: file=<16kHz mono wav>, response_format=json
  -> { "text": "..." }
```

So the app's transcription adapter works against it unchanged.

## Measure it

```bash
./run.sh                       # venv + model download + serve on :8178
```

Then either:

**A. Numbers only.** Record a handful of 16 kHz mono WAV clips of yourself dictating (short / one sentence / a paragraph), drop them in a folder, and:

```bash
./.venv/bin/python bench.py ./clips
```

Watch the **median and max latency**. The budget is end-of-speech to text-ready under 1 s ([ADR-0001](../../docs/adr/0001-no-llm-in-the-dictation-path.md)); this measures only the model call, so leave headroom for cleanup and delivery. `base.en` was ~0.6 s on a paragraph.

**B. In the app.** Stop the app's own `whisper-server` and run the app pointed at this one instead (they share `:8178`). Quickest hack: comment out `whisperServer.start()` in `electron/main.js`, start `./run.sh`, then `npm start`. Dictate normally and judge accuracy in real use.

## What a real integration looks like

If Parakeet wins here, the production path is **not** this Python server. It is a Swift native helper built on **FluidAudio** (`AsrModels.downloadAndLoad`, CoreML / ANE) that compiles to a binary and is supervised exactly like `whisper-server`, `hotkey-helper` and `accessibility-helper` already are. No Python, no bundled venv. That is the ~1 week of work this prototype is meant to justify or rule out.

Parakeet also emits literal ASR with no punctuation, so the deterministic rules engine stays in front of the cursor either way ([ADR-0002](../../docs/adr/0002-no-one-model-dictation-engine.md)).

## Record the result

Add a `RESULTS.md` here with the latency table and an accuracy read, then decide on #308.
