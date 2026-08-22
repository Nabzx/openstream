#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Generates TTS dictation audio from samples.json.

Real dictation audio would be better, but `say` gives us reproducible clips at a
controlled words-per-minute, which is what the latency half of the spike needs.
Transcribe time tracks audio duration and model size, not how clean the speech is.
"""
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).parent
AUDIO = HERE / "audio"
AUDIO.mkdir(exist_ok=True)

samples = json.loads((HERE / "samples.json").read_text())

for s in samples:
    out = AUDIO / f"{s['id']}.wav"
    # 150 wpm is a realistic dictation pace; `say` defaults to ~175 which is fast.
    subprocess.run(
        ["say", "-r", "150", "-o", str(out),
         "--data-format=LEI16@16000", s["spoken"]],
        check=True,
    )
    dur = subprocess.run(
        ["afinfo", str(out)], capture_output=True, text=True
    ).stdout
    secs = [l for l in dur.splitlines() if "estimated duration" in l]
    print(f"{s['id']:10s} {s['bucket']:10s} {len(s['spoken'].split()):3d} words  "
          f"{secs[0].split(':')[1].strip() if secs else '?'}")
