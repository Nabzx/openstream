#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Can the first-break anchoring be prompted away? Issue #67.

The shuffle test showed the model DOES read the text: break count and placement
move with content, and move the right way (incoherent text -> more breaks). The
residual defect is narrower than first thought - the FIRST index anchors on the
single worked example's first digit (3 -> 3, 4 -> 4), and removing the example
entirely breaks format compliance.

So the fix to test is not "no example" but "several examples with varied
indices": enough to teach the format, too varied to anchor to.
"""
import json, pathlib, sys
from collections import Counter
HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "llm-cleanup-latency")); sys.path.insert(0, str(HERE))
import rules, breakpos
from samples import SAMPLES
from bench import CONFIGS, PORT, Server, post_json
from reference import REFERENCE

BASE = breakpos.SYSTEM_PROMPT
MULTI = BASE.replace(
    "as a comma-separated list, for example: 3, 7",
    "as a comma-separated list. Examples of the reply format: `2, 5, 9` or "
    "`4` or `3, 6` or `none`")

VARIANTS = {"single-example (3, 7)": BASE, "multi-example": MULTI}

def ask(prompt, system, extra):
    d = post_json(f"http://127.0.0.1:{PORT}/v1/chat/completions", {
        "messages": [{"role":"system","content":system},
                     {"role":"user","content":prompt}],
        "temperature":0.0,"top_p":1.0,"max_tokens":128,"cache_prompt":True,**extra})
    return (d["choices"][0]["message"]["content"] or "").strip()

out={}
for name in ["smollm2-1.7b","qwen3-1.7b-nothink"]:
    cfg=CONFIGS[name]; print(f"== {name} ==")
    with Server(name,cfg["path"],cfg["extra"]):
        for vname,system in VARIANTS.items():
            row={}
            for s in SAMPLES:
                sents=breakpos.split_sentences(rules.clean(s["messy"]))
                p=breakpos.parse_reply(ask(breakpos.build_prompt(sents),system,cfg["extra"]),len(sents))
                row[s["id"]]={"indices":p["indices"],"strict":p["strict"],
                              "verdict":p["verdict"],"n":len(sents)}
            out.setdefault(name,{})[vname]=row
            firsts=Counter(v["indices"][0] for v in row.values() if v["indices"])
            empty=sum(1 for v in row.values() if not v["indices"])
            strict=sum(v["strict"] for v in row.values())
            every=sum(1 for v in row.values() if len(v["indices"])>=5
                      and v["indices"]==list(range(2,max(v["indices"])+1)))
            agree=sum(1 for sid,v in row.items() if v["indices"]==REFERENCE[sid])
            print(f"  {vname:24s} first-index={dict(firsts)}  unusable={empty}/12  "
                  f"format={strict}/12  break-every={every}/12  agrees={agree}/12")
(HERE/"out"/"multiexample.json").write_text(json.dumps(out,indent=2))
print("\nwrote out/multiexample.json")
