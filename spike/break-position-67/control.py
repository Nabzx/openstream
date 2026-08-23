#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Control for prompt-example contamination, issue #67.

The main run used one example in the system prompt: `3, 7`. SmolLM2 then opened
with index 3 on all twelve samples and returned exactly [3, 7] on three of them.
That is the signature of a model copying the example rather than reading the
text, and if it is copying then the whole quality result is meaningless.

This varies ONLY the example and re-runs. If the answers track the example, the
model is not choosing breaks. Single rep: this is about which indices come back,
not how fast.
"""
import json, pathlib, subprocess, sys, time, urllib.request
HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "llm-cleanup-latency")); sys.path.insert(0, str(HERE))
import rules, breakpos
from samples import SAMPLES
from bench import CONFIGS, PORT, Server, post_json

BASE = breakpos.SYSTEM_PROMPT
VARIANTS = {
    "example-3-7": BASE,
    "example-4-9": BASE.replace("for example: 3, 7", "for example: 4, 9"),
    "no-example":  BASE.replace(", for example: 3, 7", ""),
}

def ask(prompt, system, extra):
    d = post_json(f"http://127.0.0.1:{PORT}/v1/chat/completions", {
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": prompt}],
        "temperature": 0.0, "top_p": 1.0, "max_tokens": 128,
        "cache_prompt": True, **extra})
    return (d["choices"][0]["message"]["content"] or "").strip()

out = {}
for name in ["smollm2-1.7b", "qwen3-1.7b-nothink"]:
    cfg = CONFIGS[name]
    print(f"== {name} ==")
    with Server(name, cfg["path"], cfg["extra"]):
        for vname, system in VARIANTS.items():
            row = {}
            for s in SAMPLES:
                sents = breakpos.split_sentences(rules.clean(s["messy"]))
                reply = ask(breakpos.build_prompt(sents), system, cfg["extra"])
                row[s["id"]] = breakpos.parse_reply(reply, len(sents))["indices"]
            out.setdefault(name, {})[vname] = row
            print(f"  {vname:14s} " + "  ".join(
                f"{k}={v}" for k, v in list(row.items())[:4]))
(HERE / "out" / "control.json").write_text(json.dumps(out, indent=2))
print("\nwrote out/control.json")
