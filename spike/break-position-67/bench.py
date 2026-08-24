#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Break-position latency + quality spike, issue #67.

Measures the call #45 decided: numbered sentences in, sentence numbers out.
Input is the sample corpus run through the real rules cleanup, because that is
what the call receives in the product. No audio; transcribe cost comes from #24.

The model server is held RESIDENT and warmed before timing, matching #45's
"the rewrite model server becomes resident" and #24's harness, so the numbers
are directly comparable.

Usage:  python3 bench.py            # writes out/results.json
"""
import json
import pathlib
import statistics
import subprocess
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "llm-cleanup-latency"))

import rules
import breakpos
from samples import SAMPLES
from reference import REFERENCE

MODELS = pathlib.Path.home() / ".cache" / "openstream-spike" / "models"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
PORT = 8091
REPS = 5      # per sample, median reported; cheap here because output is tiny
WARMUP = 2

# Qwen3 is a hybrid reasoning model. Thinking is measured both ways because
# that difference decides whether Qwen3 is viable at all (README, Candidates).
CONFIGS = {
    "smollm2-1.7b": dict(
        path=MODELS / "smollm2-1.7b-instruct-q4_k_m.gguf", extra={}),
    "qwen3-1.7b-nothink": dict(
        path=MODELS / "Qwen3-1.7B-Q4_K_M.gguf",
        extra={"chat_template_kwargs": {"enable_thinking": False}}),
    "qwen3-1.7b-think": dict(
        path=MODELS / "Qwen3-1.7B-Q4_K_M.gguf",
        extra={"chat_template_kwargs": {"enable_thinking": True}}),
}


def post_json(url, payload, timeout=300):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def ask_breaks(prompt, extra):
    """One break-position call. Returns (reply_text, seconds, usage)."""
    t0 = time.perf_counter()
    data = post_json(
        f"http://127.0.0.1:{PORT}/v1/chat/completions",
        {
            "messages": [
                {"role": "system", "content": breakpos.SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
            "top_p": 1.0,
            # Generous headroom on purpose: capping this would hide a model
            # that rambles, and rambling is one of the failure modes measured.
            "max_tokens": 512,
            "cache_prompt": True,
            **extra,
        },
    )
    secs = time.perf_counter() - t0
    u = data.get("usage", {})
    return (data["choices"][0]["message"]["content"] or "").strip(), secs, {
        "prompt_tokens": u.get("prompt_tokens"),
        "completion_tokens": u.get("completion_tokens"),
    }


class Server:
    def __init__(self, name, path, extra):
        self.name, self.path, self.extra = name, path, extra
        self.proc = self.load_seconds = self.rss_mb = None

    def __enter__(self):
        t0 = time.perf_counter()
        self.proc = subprocess.Popen(
            ["llama-server", "-m", str(self.path), "--port", str(PORT),
             "--host", "127.0.0.1", "-c", "4096", "-ngl", "99", "--no-webui"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        url = f"http://127.0.0.1:{PORT}/health"
        while True:
            if self.proc.poll() is not None:
                raise RuntimeError(f"{self.name} exited during startup")
            try:
                urllib.request.urlopen(url, timeout=2).read()
                break
            except Exception:
                time.sleep(0.25)
        warm = "1. One two.\n2. Three four.\n3. Five six."
        ask_breaks(warm, self.extra)
        self.load_seconds = time.perf_counter() - t0
        for _ in range(WARMUP - 1):
            ask_breaks(warm, self.extra)
        return self

    def measure_rss(self):
        """Resident set size of the warmed server, in MB.

        Unified memory on Apple Silicon means the GGML metal buffers show up in
        the process RSS, so this is the honest 'what does holding this model
        resident cost' number - but it is measured on a 16 GB machine, which is
        not the 8 GB floor the memory question is really about.
        """
        out = subprocess.run(["ps", "-o", "rss=", "-p", str(self.proc.pid)],
                             capture_output=True, text=True).stdout.strip()
        self.rss_mb = round(int(out) / 1024, 1) if out else None
        return self.rss_mb

    def __exit__(self, *exc):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()


def main():
    results = {
        "meta": {
            "machine": sh("sysctl", "-n", "machdep.cpu.brand_string"),
            "ram_gb": round(int(sh("sysctl", "-n", "hw.memsize")) / 1073741824),
            "macos": sh("sw_vers", "-productVersion"),
            "reps": REPS,
            "when": time.strftime("%Y-%m-%d %H:%M:%S"),
            # #24's measured floor on the 130-word bucket, the budget this
            # call has to fit inside.
            "budget_seconds": 1.0,
            "transcribe_plus_rules_130w": 0.61,
        },
        "cold_start": {},
        "rss_mb": {},
        "samples": {},
    }

    # --- the input the call actually receives -----------------------------
    for s in SAMPLES:
        cleaned = rules.clean(s["messy"])
        sents = breakpos.split_sentences(cleaned)
        results["samples"][s["id"]] = {
            "bucket": s["bucket"],
            "words": len(s["messy"].split()),
            "cleaned": cleaned,
            "sentences": sents,
            "n_sentences": len(sents),
            "asked": breakpos.should_ask(sents),
            "reference": REFERENCE[s["id"]],
            "runs": {},
        }

    # --- per candidate -----------------------------------------------------
    for name, cfg in CONFIGS.items():
        print(f"== {name} ==")
        with Server(name, cfg["path"], cfg["extra"]) as srv:
            results["cold_start"][name] = round(srv.load_seconds, 2)
            results["rss_mb"][name] = srv.measure_rss()
            print(f"  cold start {srv.load_seconds:.2f}s   rss {srv.rss_mb} MB")
            for s in SAMPLES:
                d = results["samples"][s["id"]]
                if not d["asked"]:
                    continue
                prompt = breakpos.build_prompt(d["sentences"])
                times, reply, usage = [], None, None
                for _ in range(REPS):
                    reply, secs, usage = ask_breaks(prompt, cfg["extra"])
                    times.append(secs)
                parsed = breakpos.parse_reply(reply, d["n_sentences"])
                med = statistics.median(times)
                d["runs"][name] = {
                    "reply": reply,
                    "seconds": round(med, 3),
                    "all_seconds": [round(t, 3) for t in times],
                    "tokens": usage,
                    **parsed,
                    "paragraphs": breakpos.assemble(
                        d["sentences"], parsed["indices"]),
                }
                flag = "" if parsed["verdict"] in ("ok", "none") else " <-- " + parsed["verdict"]
                print(f"  {s['id']:12s} {med:6.2f}s  "
                      f"{usage['completion_tokens']:>4} tok  "
                      f"{parsed['indices']}{flag}")

    (OUT / "results.json").write_text(json.dumps(results, indent=2))
    print(f"\nwrote {OUT / 'results.json'}")


if __name__ == "__main__":
    main()
