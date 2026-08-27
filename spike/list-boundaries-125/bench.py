#!/usr/bin/env python3
"""PROTOTYPE - throwaway. List-boundary + break-placement spike, issue #125.

Measures the contract #125 extends: numbered sentences in, two labelled lines
out (BREAKS / LIST). Input is the sample corpus run through the real rules
cleanup, because that is what the call receives in the product. No audio;
transcribe cost comes from #24.

The model server is held RESIDENT and warmed before timing, matching #45 and
#67's harness, so the latency numbers are directly comparable to #67's
break-only figure.

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
import listbound
from samples import SAMPLES
from reference import REFERENCE

MODELS = pathlib.Path.home() / ".cache" / "openstream-spike" / "models"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
PORT = 8092
REPS = 5
WARMUP = 2

CONFIGS = {
    "smollm2-1.7b": dict(
        path=MODELS / "smollm2-1.7b-instruct-q4_k_m.gguf", extra={}),
    "qwen3-1.7b-nothink": dict(
        path=MODELS / "Qwen3-1.7B-Q4_K_M.gguf",
        extra={"chat_template_kwargs": {"enable_thinking": False}}),
}


def post_json(url, payload, timeout=300):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def ask(prompt, extra):
    """One two-line structure call. Returns (reply_text, seconds, usage)."""
    t0 = time.perf_counter()
    data = post_json(
        f"http://127.0.0.1:{PORT}/v1/chat/completions",
        {
            "messages": [
                {"role": "system", "content": listbound.SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
            "top_p": 1.0,
            # Generous on purpose: capping this hides a model that rambles, and
            # rambling past the two lines is a failure mode being measured.
            "max_tokens": 256,
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


def span_overlap(a, b):
    """Jaccard overlap of two inclusive (start, end) spans; 0 if either None."""
    if not a or not b:
        return 1.0 if a == b else 0.0
    sa = set(range(a[0], a[1] + 1))
    sb = set(range(b[0], b[1] + 1))
    return len(sa & sb) / len(sa | sb)


class Server:
    def __init__(self, name, path, extra):
        self.name, self.path, self.extra = name, path, extra
        self.proc = self.load_seconds = self.rss_mb = None

    def __enter__(self):
        t0 = time.perf_counter()
        self.proc = subprocess.Popen(
            ["llama-server", "-m", str(self.path), "--port", str(PORT),
             "--host", "127.0.0.1", "-c", "2048", "-ngl", "99", "--no-webui"],
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
        for _ in range(WARMUP):
            ask(warm, self.extra)
        self.load_seconds = time.perf_counter() - t0
        return self

    def measure_rss(self):
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
            "budget_seconds": 1.0,
            "transcribe_plus_rules_130w": 0.61,
            # #67's break-only warm median on the same buckets, to compare.
            "break_only_67_130w": 0.12,
        },
        "cold_start": {},
        "rss_mb": {},
        "samples": {},
    }

    for s in SAMPLES:
        cleaned = rules.clean(s["messy"])
        sents = listbound.split_sentences(cleaned)
        results["samples"][s["id"]] = {
            "bucket": s["bucket"],
            "group": s["id"].split("-")[0],
            "words": len(s["messy"].split()),
            "cleaned": cleaned,
            "sentences": sents,
            "n_sentences": len(sents),
            "asked": listbound.should_ask(sents),
            "reference": REFERENCE[s["id"]],
            "runs": {},
        }

    for name, cfg in CONFIGS.items():
        if not cfg["path"].exists():
            print(f"!! {name}: {cfg['path']} missing, skipping")
            continue
        print(f"== {name} ==")
        with Server(name, cfg["path"], cfg["extra"]) as srv:
            results["cold_start"][name] = round(srv.load_seconds, 2)
            results["rss_mb"][name] = srv.measure_rss()
            print(f"  cold start {srv.load_seconds:.2f}s   rss {srv.rss_mb} MB")
            for s in SAMPLES:
                d = results["samples"][s["id"]]
                if not d["asked"]:
                    continue
                prompt = listbound.build_prompt(d["sentences"])
                times, reply, usage = [], None, None
                for _ in range(REPS):
                    reply, secs, usage = ask(prompt, cfg["extra"])
                    times.append(secs)
                parsed = listbound.parse_reply(reply, d["n_sentences"])
                ref = d["reference"]
                d["runs"][name] = {
                    "reply": reply,
                    "seconds": round(statistics.median(times), 3),
                    "all_seconds": [round(t, 3) for t in times],
                    "tokens": usage,
                    "breaks": parsed["breaks"],
                    "list": parsed["list"],
                    "break_match": parsed["breaks"]["indices"] == ref["breaks"],
                    "list_overlap": round(
                        span_overlap(parsed["list"]["range"], ref["list"]), 2),
                    "list_false_positive": (
                        ref["list"] is None and parsed["list"]["range"] is not None),
                    "rendered": listbound.assemble(
                        d["sentences"], parsed["breaks"]["indices"],
                        parsed["list"]["range"]),
                }
                r = d["runs"][name]
                fp = "  FALSE-POSITIVE LIST" if r["list_false_positive"] else ""
                print(f"  {s['id']:<20} {r['seconds']:.3f}s  "
                      f"breaks={'ok' if r['break_match'] else 'MISS'}  "
                      f"list_overlap={r['list_overlap']}{fp}")

    (OUT / "results.json").write_text(json.dumps(results, indent=2))
    print(f"\nwrote {OUT / 'results.json'}")
    print("FINDINGS.md is not filled in automatically - read results.json and "
          "out/review.html, then write it up.")


if __name__ == "__main__":
    main()
