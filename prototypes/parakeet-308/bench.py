"""Benchmark Parakeet against the numbers OpenStream's budget cares about.

Point it at a folder of 16 kHz mono WAV clips (the same shape the app
captures). It reports, per clip and in aggregate:

  - warm transcription latency (the number that killed large-v3-turbo in #310)
  - the transcript, so you can eyeball accuracy against what you said

    ./.venv/bin/python bench.py ./clips

The sub-1s budget is end-of-speech to text-ready (ADR-0001). This measures
just the model call; add the rules-cleanup pass (~1ms) and delivery on top.
"""

from __future__ import annotations

import io
import sys
import time
import wave
from pathlib import Path

import numpy as np

MODEL_ID = "mlx-community/parakeet-tdt-0.6b-v3"


def load_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wav:
        frames = wav.readframes(wav.getnframes())
        sr = wav.getframerate()
        ch = wav.getnchannels()
        audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        if ch > 1:
            audio = audio.reshape(-1, ch).mean(axis=1)
    return audio, sr


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(1)

    clips = sorted(Path(sys.argv[1]).glob("*.wav"))
    if not clips:
        raise SystemExit(f"no .wav files in {sys.argv[1]}")

    print(f"loading {MODEL_ID} ...")
    t0 = time.perf_counter()
    from parakeet_mlx import from_pretrained

    model = from_pretrained(MODEL_ID)
    print(f"cold load: {time.perf_counter() - t0:.1f}s\n")

    # one warm-up so the first real timing isn't paying shader compilation
    warm_audio, warm_sr = load_wav(clips[0])
    model.transcribe(warm_audio, sample_rate=warm_sr)

    latencies = []
    for clip in clips:
        audio, sr = load_wav(clip)
        secs = len(audio) / sr
        t0 = time.perf_counter()
        result = model.transcribe(audio, sample_rate=sr)
        dt = time.perf_counter() - t0
        latencies.append((secs, dt))
        print(f"{clip.name:28s}  {secs:5.1f}s audio  {dt * 1000:6.0f}ms  {(result.text or '').strip()!r}")

    print()
    print(f"clips: {len(latencies)}")
    print(f"median latency: {sorted(dt for _, dt in latencies)[len(latencies) // 2] * 1000:.0f}ms")
    print(f"max latency:    {max(dt for _, dt in latencies) * 1000:.0f}ms")
    over = [n for (n, (_, dt)) in zip((c.name for c in clips), latencies) if dt > 1.0]
    if over:
        print(f"over the 1s budget: {', '.join(over)}")
    else:
        print("all clips under 1s")


if __name__ == "__main__":
    main()
