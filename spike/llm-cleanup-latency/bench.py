#!/usr/bin/env python3
"""PROTOTYPE - throwaway. End-to-end latency spike for openstream issue #24.

Measures end-of-speech -> text-ready, split into transcribe and cleanup, for:
  - whisper base.en and small.en (resident whisper-server, not per-call CLI)
  - Llama 3.2 3B and 1B Q4_K_M cleanup (resident llama-server over HTTP)
  - a deterministic rules-only cleanup (rules.py)

Both models are held RESIDENT and warmed before timing, because that is what the
product does. Model load is reported separately as a startup cost, never folded
into per-dictation latency.

Usage:
    python3 bench.py latency     # main measurement, writes results.json
    python3 bench.py sustained   # back-to-back thermal/drift run
"""
import json
import pathlib
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request

import rules

HERE = pathlib.Path(__file__).parent
MODELS = pathlib.Path.home() / ".cache" / "openstream-spike" / "models"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

WHISPER_MODELS = {
    "base.en": MODELS / "ggml-base.en.bin",
    "small.en": MODELS / "ggml-small.en.bin",
}
LLM_MODELS = {
    "llama-3.2-3b": MODELS / "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    "llama-3.2-1b": MODELS / "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
}

WHISPER_PORT = 8089
LLM_PORT = 8090
REPS = 3  # per sample, median reported
WARMUP = 2  # discarded requests before timing starts

SYSTEM_PROMPT = (
    "You clean up dictated speech. Remove filler words and stutters, fix "
    "punctuation and capitalisation, and convert spoken punctuation commands "
    "(\"period\", \"comma\", \"new line\") into real punctuation. Do NOT "
    "rephrase, summarise, translate, answer, or add anything. Preserve the "
    "speaker's wording and meaning exactly. Output only the cleaned text."
)


# --------------------------------------------------------------------------
# server plumbing
# --------------------------------------------------------------------------

class Server:
    """A resident model server, started once and reused for every sample."""

    def __init__(self, cmd, port, health_path, warm_fn, name):
        self.cmd, self.port, self.health_path = cmd, port, health_path
        self.warm_fn, self.name = warm_fn, name
        self.proc = None
        self.load_seconds = None

    def __enter__(self):
        t0 = time.perf_counter()
        self.proc = subprocess.Popen(
            self.cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        url = f"http://127.0.0.1:{self.port}{self.health_path}"
        while True:
            if self.proc.poll() is not None:
                raise RuntimeError(f"{self.name} exited during startup")
            try:
                urllib.request.urlopen(url, timeout=2).read()
                break
            except Exception:
                time.sleep(0.25)
        # Cold start = process spawn -> first real inference complete.
        self.warm_fn()
        self.load_seconds = time.perf_counter() - t0
        for _ in range(WARMUP - 1):
            self.warm_fn()
        return self

    def __exit__(self, *exc):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def post_json(url, payload, timeout=300):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def transcribe(wav_path):
    """POST a wav to the resident whisper-server, return (text, seconds)."""
    boundary = "----spike"
    body = bytearray()

    def field(name, value):
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(f"{value}\r\n".encode())

    body.extend(f"--{boundary}\r\n".encode())
    body.extend(
        f'Content-Disposition: form-data; name="file"; '
        f'filename="{wav_path.name}"\r\n'.encode())
    body.extend(b"Content-Type: audio/wav\r\n\r\n")
    body.extend(wav_path.read_bytes())
    body.extend(b"\r\n")
    field("response_format", "json")
    field("temperature", "0.0")
    body.extend(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"http://127.0.0.1:{WHISPER_PORT}/inference", data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read())
    return data.get("text", "").strip(), time.perf_counter() - t0


def llm_cleanup(text):
    """Send a transcript to the resident llama-server. Returns (text, secs, meta)."""
    t0 = time.perf_counter()
    data = post_json(
        f"http://127.0.0.1:{LLM_PORT}/v1/chat/completions",
        {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            "temperature": 0.0,
            "top_p": 1.0,
            # Generous headroom: cleanup output is ~the length of the input.
            "max_tokens": 600,
            "cache_prompt": True,
        },
    )
    secs = time.perf_counter() - t0
    usage = data.get("usage", {})
    return (
        data["choices"][0]["message"]["content"].strip(),
        secs,
        {"prompt_tokens": usage.get("prompt_tokens"),
         "completion_tokens": usage.get("completion_tokens")},
    )


def whisper_server(model_key):
    return Server(
        ["whisper-server", "-m", str(WHISPER_MODELS[model_key]),
         "--port", str(WHISPER_PORT), "--host", "127.0.0.1"],
        WHISPER_PORT, "/",
        lambda: transcribe(HERE / "audio" / "cmd-1.wav"),
        f"whisper-server({model_key})",
    )


def llm_server(model_key):
    return Server(
        ["llama-server", "-m", str(LLM_MODELS[model_key]),
         "--port", str(LLM_PORT), "--host", "127.0.0.1",
         "-c", "4096", "-ngl", "99", "--no-webui"],
        LLM_PORT, "/health",
        lambda: llm_cleanup("um this is a a warmup sentence"),
        f"llama-server({model_key})",
    )


def median_of(fn, reps=REPS):
    """Run fn reps times, return (result_of_last, median_seconds, all_seconds)."""
    times, result = [], None
    for _ in range(reps):
        result, secs, *rest = fn()
        times.append(secs)
    return result, statistics.median(times), times


# --------------------------------------------------------------------------
# main measurement
# --------------------------------------------------------------------------

def run_latency():
    samples = json.loads((HERE / "samples.json").read_text())
    results = {
        "meta": {
            "machine": subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True).stdout.strip(),
            "ram_gb": round(int(subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True).stdout.strip()) / 1073741824),
            "macos": subprocess.run(["sw_vers", "-productVersion"],
                                    capture_output=True, text=True).stdout.strip(),
            "reps": REPS,
            "when": time.strftime("%Y-%m-%d %H:%M:%S"),
        },
        "cold_start": {},
        "samples": {s["id"]: {"bucket": s["bucket"],
                              "words": len(s["spoken"].split()),
                              "spoken": s["spoken"],
                              "messy": s["messy"],
                              "reference": s["reference"]} for s in samples},
    }

    # --- audio durations -----------------------------------------------
    for s in samples:
        info = subprocess.run(["afinfo", str(HERE / "audio" / f"{s['id']}.wav")],
                              capture_output=True, text=True).stdout
        dur = next((l for l in info.splitlines() if "estimated duration" in l), "")
        results["samples"][s["id"]]["audio_seconds"] = round(
            float(dur.split(":")[1].strip().split()[0]), 2) if dur else None

    # --- rules-only cleanup (no server) ---------------------------------
    print("== rules-only cleanup ==")
    for s in samples:
        _, med, _ = median_of(
            lambda s=s: (rules.clean(s["messy"]), _timed(rules.clean, s["messy"])),
            reps=20)
        sid = s["id"]
        results["samples"][sid]["rules_from_messy"] = rules.clean(s["messy"])
        results["samples"][sid]["rules_seconds"] = round(med, 6)
        print(f"  {sid:10s} {med*1000:.3f} ms")

    # --- transcription --------------------------------------------------
    for wkey in WHISPER_MODELS:
        print(f"== whisper {wkey} ==")
        with whisper_server(wkey) as srv:
            results["cold_start"][f"whisper:{wkey}"] = round(srv.load_seconds, 2)
            print(f"  cold start (load + first inference): {srv.load_seconds:.2f}s")
            for s in samples:
                wav = HERE / "audio" / f"{s['id']}.wav"
                text, med, all_t = median_of(lambda w=wav: transcribe(w))
                d = results["samples"][s["id"]]
                d[f"transcript_{wkey}"] = text
                d[f"transcribe_seconds_{wkey}"] = round(med, 3)
                d[f"transcribe_all_{wkey}"] = [round(t, 3) for t in all_t]
                # Rules applied to what whisper actually produced - the real pipeline.
                d[f"rules_from_{wkey}"] = rules.clean(text)
                print(f"  {s['id']:10s} {med:6.2f}s  ({d['audio_seconds']}s audio)")

    # --- LLM cleanup ----------------------------------------------------
    for lkey in LLM_MODELS:
        print(f"== {lkey} cleanup ==")
        with llm_server(lkey) as srv:
            results["cold_start"][f"llm:{lkey}"] = round(srv.load_seconds, 2)
            print(f"  cold start (load + first inference): {srv.load_seconds:.2f}s")
            for s in samples:
                d = results["samples"][s["id"]]
                for src in ["messy"] + [f"transcript_{w}" for w in WHISPER_MODELS]:
                    intext = d.get(src) if src != "messy" else s["messy"]
                    if not intext:
                        continue
                    out, secs, meta = llm_cleanup(intext)
                    times = [secs]
                    for _ in range(REPS - 1):
                        out, secs, meta = llm_cleanup(intext)
                        times.append(secs)
                    tag = src.replace("transcript_", "")
                    d[f"llm_{lkey}_from_{tag}"] = out
                    d[f"llm_{lkey}_seconds_from_{tag}"] = round(
                        statistics.median(times), 3)
                    d[f"llm_{lkey}_tokens_from_{tag}"] = meta
                print(f"  {s['id']:10s} "
                      f"{d[f'llm_{lkey}_seconds_from_base.en']:6.2f}s (from base.en)")

    (OUT / "results.json").write_text(json.dumps(results, indent=2))
    print(f"\nwrote {OUT / 'results.json'}")
    return results


def _timed(fn, arg):
    t0 = time.perf_counter()
    fn(arg)
    return time.perf_counter() - t0


# --------------------------------------------------------------------------
# sustained / thermal
# --------------------------------------------------------------------------

def run_sustained(minutes=12, wkey="base.en", lkey="llama-3.2-3b"):
    """Back-to-back dictations for ~`minutes`, to expose drift on a fanless Mac.

    Wall-clock latency drift is the honest sudo-free proxy for thermal
    behaviour; this does not read power or temperature sensors.
    """
    samples = json.loads((HERE / "samples.json").read_text())
    cycle = [s for s in samples if s["bucket"] in ("short", "sentence")]
    log = []
    print(f"== sustained {minutes} min: whisper {wkey} + {lkey} ==")
    with whisper_server(wkey), llm_server(lkey):
        deadline = time.time() + minutes * 60
        i = 0
        while time.time() < deadline:
            s = cycle[i % len(cycle)]
            wav = HERE / "audio" / f"{s['id']}.wav"
            text, t_tr = transcribe(wav)
            _, t_llm, _ = llm_cleanup(text)
            log.append({"i": i, "t": round(time.time() - (deadline - minutes * 60), 1),
                        "id": s["id"], "transcribe": round(t_tr, 3),
                        "cleanup": round(t_llm, 3),
                        "total": round(t_tr + t_llm, 3)})
            if i % 5 == 0:
                print(f"  iter {i:3d}  transcribe {t_tr:5.2f}s  "
                      f"cleanup {t_llm:5.2f}s  total {t_tr + t_llm:5.2f}s")
            i += 1
    out = {"config": {"whisper": wkey, "llm": lkey, "minutes": minutes},
           "iterations": log}
    (OUT / "sustained.json").write_text(json.dumps(out, indent=2))

    first = [r["total"] for r in log[:5]]
    last = [r["total"] for r in log[-5:]]
    print(f"\n  first 5 mean {statistics.mean(first):.2f}s  "
          f"last 5 mean {statistics.mean(last):.2f}s  "
          f"drift {(statistics.mean(last)/statistics.mean(first)-1)*100:+.1f}%")
    print(f"wrote {OUT / 'sustained.json'}")
    return out


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "latency"
    if cmd == "latency":
        run_latency()
    elif cmd == "sustained":
        mins = int(sys.argv[2]) if len(sys.argv) > 2 else 12
        run_sustained(minutes=mins)
    else:
        sys.exit(f"unknown command: {cmd}")
