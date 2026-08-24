# Transcription parts prototype

Throwaway probe for [Can the transcription model server decode in parts during speech?](https://github.com/Nabzx/openstream/issues/76).

It compares one complete `whisper-server` request with successive, non-overlapping requests against the same audio. The candidate policy keeps short recordings whole. Once more than 15 seconds of audio has accumulated, it decodes the oldest 10 seconds and keeps at least 5 seconds pending. Each later request receives the transcript so far as its initial prompt.

## Run it

From the repository root:

```bash
PATH="/Applications/MATLAB_R2023b.app/bin/maca64/cmake/bin:$PATH" ./scripts/build-whisper.sh
python3 prototypes/transcription-parts-76/probe.py
```

The first command uses the `cmake` installation available on the test machine. Any CMake 3 installation should work.

The probe generates reproducible 16 kHz TTS audio with macOS `say`, starts the pinned `whisper-server`, warms the model, and writes `results.json`. Generated audio, split parts, and the server log stay untracked.

## What this does not test

The audio is clean TTS, not microphone speech. The run is warm and unstressed on an M3 MacBook Air with 16 GB RAM. It does not represent the 8 GB floor or long thermal saturation. The earlier 14.5% sustained-load drift from [Does the local LLM cleanup pass earn its latency?](https://github.com/Nabzx/openstream/issues/24) remains the conservative thermal assumption.
