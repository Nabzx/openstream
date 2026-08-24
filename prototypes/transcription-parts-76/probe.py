#!/usr/bin/env python3
"""PROTOTYPE: test whether whisper-server can transcribe successive audio parts.

This is throwaway measurement code for issue 76. It compares one whole-recording
request with stateless, non-overlapping part requests to the pinned whisper-server.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
import urllib.error
import urllib.request
import uuid
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SAMPLES_PATH = ROOT / "spike/llm-cleanup-latency/samples.json"
AUDIO_DIR = HERE / "audio"
PARTS_DIR = HERE / "parts"
RESULTS_PATH = HERE / "results.json"
SERVER = ROOT / "resources/bin/whisper-server"
MODEL = ROOT / "resources/models/ggml-base.en.bin"
PORT = 8176


def generate_audio(samples: list[dict]) -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    for sample in samples:
        output = AUDIO_DIR / f"{sample['id']}.wav"
        if output.exists():
            continue
        subprocess.run(
            [
                "say",
                "-r",
                "150",
                "-o",
                str(output),
                "--data-format=LEI16@16000",
                sample["spoken"],
            ],
            check=True,
        )


def split_wav(source: Path, seconds: float) -> list[Path]:
    output_dir = PARTS_DIR / source.stem / f"{seconds:g}s"
    output_dir.mkdir(parents=True, exist_ok=True)

    with wave.open(str(source), "rb") as wav:
        params = wav.getparams()
        frames_per_part = int(params.framerate * seconds)
        outputs = []
        index = 0
        while True:
            frames = wav.readframes(frames_per_part)
            if not frames:
                break
            output = output_dir / f"{index:03d}.wav"
            with wave.open(str(output), "wb") as part:
                part.setparams(params)
                part.writeframes(frames)
            outputs.append(output)
            index += 1
        return outputs


def split_wav_buffered(source: Path, commit_seconds: float = 10, min_tail_seconds: float = 5) -> list[Path]:
    output_dir = PARTS_DIR / source.stem / "buffered-10s-min5s"
    output_dir.mkdir(parents=True, exist_ok=True)

    with wave.open(str(source), "rb") as wav:
        params = wav.getparams()
        commit_frames = int(params.framerate * commit_seconds)
        min_tail_frames = int(params.framerate * min_tail_seconds)
        remaining = wav.getnframes()
        outputs = []
        index = 0
        while remaining > commit_frames + min_tail_frames:
            frames = wav.readframes(commit_frames)
            output = output_dir / f"{index:03d}.wav"
            with wave.open(str(output), "wb") as part:
                part.setparams(params)
                part.writeframes(frames)
            outputs.append(output)
            remaining -= len(frames) // (params.sampwidth * params.nchannels)
            index += 1
        frames = wav.readframes(remaining)
        output = output_dir / f"{index:03d}.wav"
        with wave.open(str(output), "wb") as part:
            part.setparams(params)
            part.writeframes(frames)
        outputs.append(output)
        return outputs


def multipart(fields: dict[str, str], file_path: Path) -> tuple[bytes, str]:
    boundary = f"----openstream-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            ]
        )
    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            (
                f'Content-Disposition: form-data; name="file"; '
                f'filename="{file_path.name}"\r\n'
            ).encode(),
            b"Content-Type: audio/wav\r\n\r\n",
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return b"".join(chunks), boundary


def infer(file_path: Path, prompt: str = "") -> tuple[str, float]:
    fields = {"response_format": "json"}
    if prompt:
        fields["prompt"] = prompt
    body, boundary = multipart(fields, file_path)
    request = urllib.request.Request(
        f"http://127.0.0.1:{PORT}/inference",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read())
    elapsed = time.perf_counter() - started
    return payload["text"].strip(), elapsed


def wait_for_server(process: subprocess.Popen) -> None:
    for _ in range(120):
        if process.poll() is not None:
            raise RuntimeError("whisper-server exited during startup")
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=1)
            return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    raise TimeoutError("whisper-server did not start")


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def edit_distance(left: list[str], right: list[str]) -> int:
    previous = list(range(len(right) + 1))
    for i, left_word in enumerate(left, 1):
        current = [i]
        for j, right_word in enumerate(right, 1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + (left_word != right_word),
                )
            )
        previous = current
    return previous[-1]


def wer(reference: str, candidate: str) -> float:
    reference_words = words(reference)
    return edit_distance(reference_words, words(candidate)) / max(1, len(reference_words))


def duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / wav.getframerate()


def trim_wav(source: Path, output: Path, seconds: float) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(source), "rb") as wav:
        params = wav.getparams()
        frames = wav.readframes(int(params.framerate * seconds))
    with wave.open(str(output), "wb") as trimmed:
        trimmed.setparams(params)
        trimmed.writeframes(frames)
    return output


def infer_parts(part_files: list[Path], use_prompt: bool) -> tuple[str, list[float]]:
    texts = []
    timings = []
    prompt = ""
    for part in part_files:
        text, elapsed = infer(part, prompt if use_prompt else "")
        texts.append(text)
        timings.append(elapsed)
        prompt = " ".join(texts)[-1000:]
    return " ".join(texts), timings


def hardware_summary() -> dict[str, str]:
    output = subprocess.run(
        ["system_profiler", "SPHardwareDataType"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    allowed = {"Model Name", "Model Identifier", "Chip", "Memory"}
    summary = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        if key in allowed:
            summary[key] = value
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--part-seconds", nargs="+", type=float, default=[3, 5, 10, 15])
    args = parser.parse_args()

    samples = json.loads(SAMPLES_PATH.read_text())
    generate_audio(samples)

    if not SERVER.exists() or not MODEL.exists():
        raise SystemExit("Run scripts/build-whisper.sh before this probe.")

    HERE.mkdir(parents=True, exist_ok=True)
    log = (HERE / "server.log").open("w")
    process = subprocess.Popen(
        [str(SERVER), "-m", str(MODEL), "--port", str(PORT), "-nt"],
        stdout=log,
        stderr=subprocess.STDOUT,
    )

    try:
        wait_for_server(process)
        infer(AUDIO_DIR / "cmd-1.wav")  # warm Metal and the model before measuring
        results = {"hardware": hardware_summary(), "samples": []}

        for sample in samples:
            audio = AUDIO_DIR / f"{sample['id']}.wav"
            whole_text, whole_seconds = infer(audio)
            record = {
                "id": sample["id"],
                "bucket": sample["bucket"],
                "audio_seconds": duration(audio),
                "whole": {"text": whole_text, "seconds": whole_seconds},
                "parts": [],
            }
            print(
                f"{sample['id']:8s} whole {whole_seconds:.3f}s, "
                f"audio {record['audio_seconds']:.1f}s",
                flush=True,
            )

            for part_seconds in args.part_seconds:
                part_files = split_wav(audio, part_seconds)
                for use_prompt in (False, True):
                    stitched, timings = infer_parts(part_files, use_prompt)
                    part_result = {
                        "part_seconds": part_seconds,
                        "prompted": use_prompt,
                        "part_count": len(part_files),
                        "text": stitched,
                        "part_timings": timings,
                        "total_seconds": sum(timings),
                        "final_seconds": timings[-1],
                        "wer_vs_whole": wer(whole_text, stitched),
                    }
                    record["parts"].append(part_result)
                    mode = "prompt" if use_prompt else "plain"
                    print(
                        f"  {part_seconds:>4g}s {mode:6s} parts={len(part_files):2d} "
                        f"final={timings[-1]:.3f}s total={sum(timings):.3f}s "
                        f"WER={part_result['wer_vs_whole']:.1%}",
                        flush=True,
                    )
            candidate_files = split_wav_buffered(audio)
            candidate_text, candidate_timings = infer_parts(candidate_files, True)
            record["buffered_candidate"] = {
                "commit_seconds": 10,
                "min_tail_seconds": 5,
                "part_count": len(candidate_files),
                "part_durations": [duration(part) for part in candidate_files],
                "text": candidate_text,
                "part_timings": candidate_timings,
                "total_seconds": sum(candidate_timings),
                "final_seconds": candidate_timings[-1],
                "wer_vs_whole": wer(whole_text, candidate_text),
            }
            print(
                f"  buffered parts={len(candidate_files):2d} "
                f"final={candidate_timings[-1]:.3f}s "
                f"total={sum(candidate_timings):.3f}s "
                f"WER={record['buffered_candidate']['wer_vs_whole']:.1%}",
                flush=True,
            )
            results["samples"].append(record)
            RESULTS_PATH.write_text(json.dumps(results, indent=2) + "\n")

        # A fixed part interval can leave almost no audio after key release.
        # Sweep that phase because the full samples happen to leave 1.7s and
        # 7.9s tails at a 10s interval.
        results["tail_sweep"] = []
        for sample in [s for s in samples if s["bucket"] == "paragraph"]:
            source = AUDIO_DIR / f"{sample['id']}.wav"
            for tail_seconds in (0.2, 0.5, 1, 2, 5, 9):
                stop_seconds = 20 + tail_seconds
                trimmed = trim_wav(
                    source,
                    PARTS_DIR / sample["id"] / "tail-sweep" / f"{tail_seconds:g}s.wav",
                    stop_seconds,
                )
                whole_text, whole_seconds = infer(trimmed)
                stitched, timings = infer_parts(split_wav(trimmed, 10), True)
                result = {
                    "id": sample["id"],
                    "tail_seconds": tail_seconds,
                    "whole_text": whole_text,
                    "stitched_text": stitched,
                    "whole_seconds": whole_seconds,
                    "final_seconds": timings[-1],
                    "wer_vs_whole": wer(whole_text, stitched),
                }
                results["tail_sweep"].append(result)
                print(
                    f"tail {sample['id']:6s} {tail_seconds:>3g}s "
                    f"final={timings[-1]:.3f}s WER={result['wer_vs_whole']:.1%}",
                    flush=True,
                )
        RESULTS_PATH.write_text(json.dumps(results, indent=2) + "\n")
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        log.close()


if __name__ == "__main__":
    main()
