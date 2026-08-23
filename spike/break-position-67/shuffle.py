#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Does break placement respond to CONTENT? Issue #67.

The example-variation control showed the first index is anchored on the prompt's
worked example. But the model is not reproducing any fixed rule either: it
matches a cheap every-k rule exactly on only 1 of 12, and it breaks less often
on longer texts, which a positional rule would not do.

So the sharper question: hold sentence COUNT fixed and change only the ORDER,
which destroys the topic structure while leaving every positional cue intact.
If the indices move, the model is reading the text. If they do not, it is not.
"""
import json, pathlib, random, sys
HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "llm-cleanup-latency")); sys.path.insert(0, str(HERE))
import rules, breakpos
from samples import SAMPLES
from bench import CONFIGS, PORT, Server, post_json

def ask(prompt, extra):
    d = post_json(f"http://127.0.0.1:{PORT}/v1/chat/completions", {
        "messages": [{"role":"system","content":breakpos.SYSTEM_PROMPT},
                     {"role":"user","content":prompt}],
        "temperature":0.0,"top_p":1.0,"max_tokens":128,"cache_prompt":True,**extra})
    return (d["choices"][0]["message"]["content"] or "").strip()

out={}
name="smollm2-1.7b"; cfg=CONFIGS[name]
with Server(name,cfg["path"],cfg["extra"]):
    for s in SAMPLES:
        sents = breakpos.split_sentences(rules.clean(s["messy"]))
        n=len(sents)
        orig = breakpos.parse_reply(ask(breakpos.build_prompt(sents),cfg["extra"]),n)["indices"]
        shuf=[]
        for seed in (1,2,3):
            rnd=random.Random(seed); perm=sents[:]; rnd.shuffle(perm)
            shuf.append(breakpos.parse_reply(
                ask(breakpos.build_prompt(perm),cfg["extra"]),n)["indices"])
        same=sum(1 for x in shuf if x==orig)
        out[s["id"]]={"n":n,"original":orig,"shuffled":shuf,"unchanged":same}
        print(f"  {s['id']:12s} n={n:2d} orig={str(orig):18s} shuffled={shuf}  unchanged {same}/3")
(HERE/"out"/"shuffle.json").write_text(json.dumps(out,indent=2))
tot=sum(v["unchanged"] for v in out.values())
print(f"\n  identical despite reordered content: {tot}/{len(out)*3}")
