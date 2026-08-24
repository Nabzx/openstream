#!/usr/bin/env python3
"""PROTOTYPE - throwaway. RSS at the context cap #52 already decided. Issue #67.

bench.py ran at -c 4096, but #52 capped the rewrite model server's context at
2048 after measuring SmolLM2's KV cache at 192 KiB/token (no grouped-query
attention). Max prompt here is 490 tokens for a 300-word dictation, so the cap
is ample for break placement - this checks what it costs and what it saves.
"""
import json, pathlib, statistics, subprocess, sys, time, urllib.request
HERE=pathlib.Path(__file__).parent
sys.path.insert(0,str(HERE.parent/"llm-cleanup-latency")); sys.path.insert(0,str(HERE))
import rules, breakpos
from samples import SAMPLES
from bench import CONFIGS, PORT, post_json, ask_breaks

MODEL=CONFIGS["smollm2-1.7b"]["path"]
out={}
for ctx in (4096, 2048, 1024):
    p=subprocess.Popen(["llama-server","-m",str(MODEL),"--port",str(PORT),
        "--host","127.0.0.1","-c",str(ctx),"-ngl","99","--no-webui"],
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    while True:
        try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health",timeout=2).read(); break
        except Exception:
            if p.poll() is not None: raise RuntimeError("exited")
            time.sleep(0.25)
    ask_breaks("1. A b.\n2. C d.\n3. E f.", {}); ask_breaks("1. A b.\n2. C d.\n3. E f.", {})
    rss=int(subprocess.run(["ps","-o","rss=","-p",str(p.pid)],
        capture_output=True,text=True).stdout.strip())/1024
    times=[]
    for s in SAMPLES:
        if s["bucket"]!="300": continue
        sents=breakpos.split_sentences(rules.clean(s["messy"]))
        for _ in range(3):
            _,secs,_=ask_breaks(breakpos.build_prompt(sents),{}); times.append(secs)
    out[ctx]={"rss_mb":round(rss,1),"med_300w_seconds":round(statistics.median(times),3)}
    print(f"  ctx {ctx:5d}  rss {rss:7.1f} MB   300-word median {statistics.median(times):.3f}s")
    p.terminate(); p.wait(timeout=10)
(HERE/"out"/"ctxcap.json").write_text(json.dumps(out,indent=2))
w=241
print(f"\n  with whisper base.en ({w} MB):")
for c,v in out.items(): print(f"    ctx {c:5d}  total {v['rss_mb']+w:.0f} MB")
