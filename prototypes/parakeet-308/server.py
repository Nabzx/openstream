"""Parakeet transcription server - a prototype for issue #308.

Speaks the same HTTP contract as the bundled whisper-server so the Electron
app's transcription adapter can point at it unchanged:

    POST /inference   multipart form: file=<wav>, response_format=json, [prompt=<str>]
      -> { "text": "..." }
    GET  /            -> 200 (health)

This is NOT production wiring. It needs Python + MLX on the machine, which
the app cannot bundle the way it bundles the C++ whisper-server. A real
integration would use FluidAudio (Swift + CoreML, compiles to a binary
like the other native helpers, no Python) - the same package
OpenSuperWhisper ships. This server exists only to measure whether
Parakeet is accurate enough and fast enough to be worth that work.

Run:  ./run.sh            (sets up the venv, downloads the model, serves on :8178)
"""

from __future__ import annotations

import io
import sys
import time
import wave

from fastapi import FastAPI, UploadFile, Form
from fastapi.responses import JSONResponse
import numpy as np
import uvicorn

MODEL_ID = "mlx-community/parakeet-tdt-0.6b-v3"
HOST = "127.0.0.1"
PORT = 8178

print(f"loading {MODEL_ID} ...", flush=True)
_t0 = time.perf_counter()
from parakeet_mlx import from_pretrained  # noqa: E402

model = from_pretrained(MODEL_ID)
print(f"model ready in {time.perf_counter() - _t0:.1f}s", flush=True)

app = FastAPI()


@app.get("/")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "model": MODEL_ID})


@app.post("/inference")
async def inference(
    file: UploadFile,
    response_format: str = Form("json"),
    prompt: str = Form(""),  # accepted for contract parity; Parakeet has no initial-prompt hook
) -> JSONResponse:
    raw = await file.read()

    # whisper-server accepts 16 kHz mono PCM WAV (see electron/wav*.js). Decode
    # to float32 the same way parakeet-mlx's own loader would.
    with wave.open(io.BytesIO(raw), "rb") as wav:
        frames = wav.readframes(wav.getnframes())
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        if channels > 1:
            audio = audio.reshape(-1, channels).mean(axis=1)

    t0 = time.perf_counter()
    result = model.transcribe(audio, sample_rate=sample_rate)
    dt = time.perf_counter() - t0

    text = (result.text or "").strip()
    print(f"[inference] {dt * 1000:.0f}ms  {len(audio) / sample_rate:.1f}s audio  ->  {text!r}", flush=True)
    return JSONResponse({"text": text})


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
