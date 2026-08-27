#!/usr/bin/env python3
"""PROTOTYPE - one-model dictation benchmark for issue #178.

This is throwaway measurement code. It compares local speech models as the
single transformation model in ordinary dictation. It does not change the
application and it does not claim that ASR confidence proves semantic safety.

The benchmark deliberately tests the output contract from issue #177, not just
word error rate: clear fillers and corrections must be removed, spoken
punctuation must become punctuation, and the result must not invent content.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import statistics
import subprocess
import threading
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
LOGS = OUT / "logs"
CORPUS = json.loads((HERE / "corpus.json").read_text())
PORT = 8197
REPETITIONS = 3
READY_TIMEOUT = 240
MEMORY_SAMPLE_SECONDS = 0.02
MEMORY_LIMIT_BYTES = 1_000_000_000

MODEL_SPECS = {
    "nemotron-3.5": {
        "display_name": "Nemotron 3.5 ASR Streaming 0.6B Q8",
        "env": "NEMOTRON_MODEL",
        "official_bytes": 741_548_352,
        "license": "OpenMDW-1.1",
        "translation": False,
        "streaming": True,
        "source": "https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b",
    },
    "parakeet-tdt": {
        "display_name": "Parakeet TDT 0.6B v3 Q8",
        "env": "PARAKEET_MODEL",
        "official_bytes": 713_975_456,
        "license": "CC BY 4.0",
        "translation": False,
        "streaming": False,
        "source": "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3",
    },
}

# Canary is rejected before starting a runtime. The exact LFS size is from the
# model repository's file listing, not a parameter-count estimate.
CANARY_PREFLIGHT = {
    "name": "Canary-1B-v2",
    "artifact": "canary-1b-v2.nemo",
    "official_bytes": 6_358_958_080,
    "license": "CC BY 4.0",
    "source": "https://huggingface.co/nvidia/canary-1b-v2",
    "status": "rejected-before-runtime",
    "reason": "official artifact exceeds the 1 GB model-artifact limit",
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        action="append",
        metavar="NAME=PATH",
        help="model to run; repeat for nemotron-3.5=PATH and parakeet-tdt=PATH",
    )
    parser.add_argument(
        "--nemo-bin",
        default=os.environ.get("NEMO_SPEECH_BIN") or shutil.which("nemo-speech"),
        help="NeMo-Speech.cpp CLI (default: NEMO_SPEECH_BIN or PATH)",
    )
    parser.add_argument(
        "--audio-dir",
        type=Path,
        default=OUT / "audio",
        help="generated or supplied WAV directory",
    )
    parser.add_argument("--skip-audio-generation", action="store_true")
    parser.add_argument("--repetitions", type=int, default=REPETITIONS)
    parser.add_argument("--port", type=int, default=PORT)
    return parser.parse_args()


def host_details():
    details = {
        "os": platform.platform(),
        "architecture": platform.machine(),
        "processor": platform.processor(),
    }
    if shutil.which("sysctl"):
        details["chip"] = command_output(["sysctl", "-n", "machdep.cpu.brand_string"])
        memory = command_output(["sysctl", "-n", "hw.memsize"])
        if memory.isdigit():
            details["ram_gb"] = round(int(memory) / 1_073_741_824)
    if shutil.which("sw_vers"):
        details["macos"] = command_output(["sw_vers", "-productVersion"])
    return details


def command_output(command):
    return subprocess.run(command, capture_output=True, text=True, check=True).stdout.strip()


def generate_audio(audio_dir):
    """Create reproducible macOS TTS WAVs without committing audio files."""
    if platform.system() != "Darwin":
        raise SystemExit("audio generation requires macOS; pass --skip-audio-generation with WAVs")
    if not shutil.which("say") or not shutil.which("afconvert"):
        raise SystemExit("audio generation requires macOS say and afconvert")

    audio_dir.mkdir(parents=True, exist_ok=True)
    for sample in CORPUS:
        output = audio_dir / f"{sample['id']}.wav"
        if output.exists():
            continue
        source = output.with_suffix(".aiff")
        subprocess.run(
            ["say", "-v", sample["voice"], "-o", str(source), sample["spoken"]],
            check=True,
        )
        subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", str(source), str(output)],
            check=True,
        )
        source.unlink()


def audio_seconds(path):
    with wave.open(str(path), "rb") as audio:
        return round(audio.getnframes() / audio.getframerate(), 3)


def normalize_words(text):
    return re.findall(r"[^\W_]+(?:['’][^\W_]+)?", text.lower(), flags=re.UNICODE)


def contains_phrase(text, phrase):
    words = normalize_words(text)
    target = normalize_words(phrase)
    return bool(target) and any(words[index:index + len(target)] == target
                                for index in range(len(words) - len(target) + 1))


def punctuation(text):
    return "".join(re.findall(r"[,!?;:.]", text))


def word_distance(expected, actual):
    reference = normalize_words(expected)
    result = normalize_words(actual)
    previous = list(range(len(result) + 1))
    for row, reference_word in enumerate(reference, start=1):
        current = [row]
        for column, result_word in enumerate(result, start=1):
            current.append(min(
                current[-1] + 1,
                previous[column] + 1,
                previous[column - 1] + (reference_word != result_word),
            ))
        previous = current
    distance = previous[-1]
    return {
        "reference_words": len(reference),
        "output_words": len(result),
        "word_errors": distance,
        "wer": round(distance / max(1, len(reference)), 3),
        "unexpected_words": sorted(set(result) - set(reference)),
    }


def evaluate_output(sample, output):
    word_score = word_distance(sample["reference"], output)
    required = [phrase for phrase in sample["must_contain"] if not contains_phrase(output, phrase)]
    forbidden = [phrase for phrase in sample["must_not_contain"] if contains_phrase(output, phrase)]
    expected_marks = punctuation(sample["reference"])
    actual_marks = punctuation(output)
    return {
        **word_score,
        "required_phrases_missing": required,
        "forbidden_phrases_present": forbidden,
        "punctuation_expected": expected_marks,
        "punctuation_actual": actual_marks,
        "punctuation_matches": expected_marks == actual_marks,
        "non_empty": bool(output.strip()),
        "contract_pass": (
            bool(output.strip())
            and not required
            and not forbidden
            and expected_marks == actual_marks
        ),
    }


def multipart_body(wav_path, locale):
    boundary = "----openstream-one-model-178"
    body = bytearray()

    def field(name, value):
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(f"{value}\r\n".encode())

    body.extend(f"--{boundary}\r\n".encode())
    body.extend(
        f'Content-Disposition: form-data; name="file"; filename="{wav_path.name}"\r\n'.encode()
    )
    body.extend(b"Content-Type: audio/wav\r\n\r\n")
    body.extend(wav_path.read_bytes())
    body.extend(b"\r\n")
    field("response_format", "json")
    field("language", locale)
    body.extend(f"--{boundary}--\r\n".encode())
    return boundary, bytes(body)


def transcribe(port, wav_path, locale):
    boundary, body = multipart_body(wav_path, locale)
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/audio/transcriptions",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=READY_TIMEOUT) as response:
        payload = json.loads(response.read())
    elapsed = time.perf_counter() - started
    return payload.get("text", "").strip(), elapsed


def process_rss(pid):
    try:
        value = command_output(["ps", "-o", "rss=", "-p", str(pid)])
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return int(value) * 1024 if value.isdigit() else None


class ResidentServer:
    """One local server process, with RSS sampled throughout its lifetime."""

    def __init__(self, binary, model_path, port, log_path):
        self.binary = binary
        self.model_path = model_path
        self.port = port
        self.log_path = log_path
        self.process = None
        self.started = None
        self.ready_seconds = None
        self.rss_after_ready_bytes = None
        self.rss_after_first_request_bytes = None
        self.resident_bytes = None
        self.peak_bytes = 0
        self._stop_monitor = threading.Event()
        self._monitor_thread = None
        self._log = None

    def __enter__(self):
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._log = self.log_path.open("w")
        self.started = time.perf_counter()
        self.process = subprocess.Popen(
            [
                self.binary,
                "serve",
                "--asr-model",
                str(self.model_path),
                "--port",
                str(self.port),
                "--no-ui",
                "--no-warmup",
                "--threads",
                "1",
            ],
            stdout=self._log,
            stderr=subprocess.STDOUT,
        )
        self._monitor_thread = threading.Thread(target=self._monitor_memory, daemon=True)
        self._monitor_thread.start()
        self._wait_until_ready()
        self.ready_seconds = time.perf_counter() - self.started
        self.rss_after_ready_bytes = process_rss(self.process.pid)
        self.resident_bytes = self.rss_after_ready_bytes
        self.peak_bytes = max(self.peak_bytes, self.resident_bytes or 0)
        return self

    def _wait_until_ready(self):
        url = f"http://127.0.0.1:{self.port}/ready"
        deadline = time.monotonic() + READY_TIMEOUT
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise RuntimeError(f"server exited during startup; see {self.log_path}")
            try:
                with urllib.request.urlopen(url, timeout=2) as response:
                    if json.loads(response.read()).get("ready"):
                        return
            except (OSError, urllib.error.URLError, json.JSONDecodeError):
                time.sleep(0.1)
        raise TimeoutError(f"server did not become ready; see {self.log_path}")

    def _monitor_memory(self):
        while not self._stop_monitor.is_set():
            if self.process:
                current = process_rss(self.process.pid)
                if current:
                    self.peak_bytes = max(self.peak_bytes, current)
            self._stop_monitor.wait(MEMORY_SAMPLE_SECONDS)

    def request(self, sample, audio_dir):
        return transcribe(self.port, audio_dir / f"{sample['id']}.wav", sample["locale"])

    def __exit__(self, exc_type, exc_value, traceback):
        self._stop_monitor.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2)
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        if self._log:
            self._log.close()


def parse_models(args):
    models = {}
    for item in args.model or []:
        try:
            name, raw_path = item.split("=", 1)
        except ValueError as error:
            raise SystemExit("--model must be NAME=PATH") from error
        if name not in MODEL_SPECS:
            raise SystemExit(f"unknown model {name}; use {', '.join(MODEL_SPECS)}")
        models[name] = Path(raw_path).expanduser()

    for name, spec in MODEL_SPECS.items():
        if name in models:
            continue
        configured = os.environ.get(spec["env"])
        if configured:
            models[name] = Path(configured).expanduser()
    return {name: path for name, path in models.items() if path.exists()}


def measure_model(name, model_path, args):
    spec = MODEL_SPECS[name]
    artifact_bytes = model_path.stat().st_size
    model_result = {
        "display_name": spec["display_name"],
        "path": str(model_path),
        "artifact_bytes": artifact_bytes,
        "artifact_mib": round(artifact_bytes / 1_048_576, 1),
        "artifact_under_1_gb": artifact_bytes < MEMORY_LIMIT_BYTES,
        "official_artifact_bytes": spec["official_bytes"],
        "artifact_matches_pinned_size": artifact_bytes == spec["official_bytes"],
        "license": spec["license"],
        "translation_supported": spec["translation"],
        "streaming_supported": spec["streaming"],
        "source": spec["source"],
        "cold": {},
        "warm": {},
    }

    cold_ids = ["en-short", "en-long"]
    for index, sample_id in enumerate(cold_ids):
        sample = next(sample for sample in CORPUS if sample["id"] == sample_id)
        log_path = LOGS / f"{name}-cold-{index}.log"
        with ResidentServer(args.nemo_bin, model_path, args.port, log_path) as server:
            output, inference_seconds = server.request(sample, args.audio_dir)
            server.rss_after_first_request_bytes = process_rss(server.process.pid)
            model_result["cold"][sample_id] = {
                "server_ready_seconds": round(server.ready_seconds, 4),
                "first_request_seconds": round(inference_seconds, 4),
                "spawn_to_text_seconds": round(server.ready_seconds + inference_seconds, 4),
                "rss_after_ready_mib": round((server.rss_after_ready_bytes or 0) / 1_048_576, 1),
                "rss_after_first_request_mib": round((server.rss_after_first_request_bytes or 0) / 1_048_576, 1),
                "peak_rss_mib": round(server.peak_bytes / 1_048_576, 1),
                "text": output,
                "quality": evaluate_output(sample, output),
            }

    warm_log = LOGS / f"{name}-warm.log"
    with ResidentServer(args.nemo_bin, model_path, args.port, warm_log) as server:
        # This request is deliberately discarded. It pays first-inference setup
        # so every reported warm result is comparable to a resident model.
        server.request(CORPUS[0], args.audio_dir)
        server.resident_bytes = process_rss(server.process.pid)
        for sample in CORPUS:
            times = []
            output = ""
            for _ in range(args.repetitions):
                output, elapsed = server.request(sample, args.audio_dir)
                times.append(elapsed)
            median = statistics.median(times)
            model_result["warm"][sample["id"]] = {
                "seconds": round(median, 4),
                "all_seconds": [round(value, 4) for value in times],
                "audio_seconds": audio_seconds(args.audio_dir / f"{sample['id']}.wav"),
                "text": output,
                "quality": evaluate_output(sample, output),
            }
        model_result["resident_rss_mib"] = round((server.resident_bytes or 0) / 1_048_576, 1)
        model_result["peak_rss_mib"] = round(server.peak_bytes / 1_048_576, 1)

    return model_result


def main():
    args = parse_args()
    if not args.nemo_bin:
        raise SystemExit("nemo-speech not found; set NEMO_SPEECH_BIN")
    if args.repetitions < 1:
        raise SystemExit("--repetitions must be positive")
    args.audio_dir.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    if not args.skip_audio_generation:
        generate_audio(args.audio_dir)
    missing_audio = [sample["id"] for sample in CORPUS
                     if not (args.audio_dir / f"{sample['id']}.wav").exists()]
    if missing_audio:
        raise SystemExit(f"missing WAV files: {', '.join(missing_audio)}")

    models = parse_models(args)
    if not models:
        raise SystemExit("no model paths found; pass --model NAME=PATH or set model env vars")

    results = {
        "schema": 1,
        "question": "Can one local speech model meet OpenStream's ordinary-dictation constraints?",
        "prototype": "throwaway; issue #178",
        "measured_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "host": host_details(),
        "limits": {
            "artifact_bytes": MEMORY_LIMIT_BYTES,
            "latency_seconds": 1.0,
            "latency_clock": "completed WAV upload to JSON transcription response; cursor injection is not included",
            "quality": "issue #177 contract cases plus reference WER; TTS audio is not real speech",
            "memory": "NeMo-Speech.cpp server RSS only; resident is sampled after warmup and peak is sampled every 20ms; Electron, capture, and injection are not included",
        },
        "preflight": {"canary-1b-v2": CANARY_PREFLIGHT},
        "models": {},
    }

    for name, model_path in models.items():
        print(f"== {name} ({model_path}) ==")
        result = measure_model(name, model_path, args)
        results["models"][name] = result
        print(f"  artifact {result['artifact_mib']} MiB; resident {result['resident_rss_mib']} MiB; peak {result['peak_rss_mib']} MiB")
        for sample_id, measurement in result["warm"].items():
            quality = "PASS" if measurement["quality"]["contract_pass"] else "FAIL"
            print(f"  {sample_id:16s} {measurement['seconds']:.3f}s  {quality}  {measurement['text']}")

    (OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT / 'results.json'}")


if __name__ == "__main__":
    main()
