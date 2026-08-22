#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Recompute the rules arm against stored transcripts.

Rules cleanup is deterministic and sub-millisecond, so iterating on rules.py
does not need a fresh 20-minute model run. Re-times it too.
"""
import importlib
import json
import pathlib
import statistics
import time

import rules

importlib.reload(rules)

HERE = pathlib.Path(__file__).parent
path = HERE / "out" / "results.json"
r = json.loads(path.read_text())

for sid, d in r["samples"].items():
    d["rules_from_messy"] = rules.clean(d["messy"])
    for w in ["base.en", "small.en"]:
        t = d.get(f"transcript_{w}")
        if t:
            d[f"rules_from_{w}"] = rules.clean(t)
    times = []
    for _ in range(50):
        t0 = time.perf_counter()
        rules.clean(d.get("transcript_base.en") or d["messy"])
        times.append(time.perf_counter() - t0)
    d["rules_seconds"] = round(statistics.median(times), 6)
    print(f"{sid:10s} {d['rules_seconds']*1000:6.3f} ms  {d['rules_from_base.en'][:70]}")

path.write_text(json.dumps(r, indent=2))
print(f"\nupdated {path}")
