#!/usr/bin/env python3
"""PROTOTYPE - throwaway. A/B a candidate system prompt against the shipped one.

The #125 run (FINDINGS.md) showed the shipped two-line prompt regresses break
placement and over-triggers lists. This is the harness for iterating on that:
edit VARIANTS, point it at a warm llama-server on PORT, read which sentences
come back. No timing - `bench.py` owns that.

Usage:  python3 promptcmp.py        # server must already be running on PORT
"""
import json
import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "llm-cleanup-latency"))

import rules
import listbound
from samples import SAMPLES
from reference import REFERENCE

PORT = 8092

VARIANTS = {
    # The shipped-then-reverted prompt, kept as the baseline to beat.
    "A-two-line": listbound.SYSTEM_PROMPT,

    # #67's break prompt verbatim + LIST appended as a secondary second line.
    # Fixed the `BREAKS: 1` regression but the model then ignored LIST.
    "B-67-verbatim": (
        "You place paragraph breaks in dictated text. You are given numbered "
        "sentences. Reply with the numbers of the sentences that should START "
        "a new paragraph, as a comma-separated list. Examples of the reply "
        "format: `2, 5, 9` or `4` or `3, 6` or `none`\n"
        "Rules:\n"
        "- Break where the topic shifts, not to make paragraphs even.\n"
        "- Never output sentence 1. Never output a number that was not given.\n"
        "- If the text should stay as one paragraph, reply: none\n"
        "- Reply with ONLY numbers or the word none on the first line, "
        "prefixed 'BREAKS: '.\n"
        "Then a SECOND line: 'LIST: N-M' only if the speaker read out a list "
        "of items (things to buy, steps to follow); otherwise 'LIST: none'."
    ),
}


def ask(system_prompt, user):
    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}/v1/chat/completions",
        data=json.dumps({
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user},
            ],
            "temperature": 0.0, "max_tokens": 48, "cache_prompt": True,
        }).encode(),
        headers={"Content-Type": "application/json"})
    d = json.loads(urllib.request.urlopen(req).read())
    return d["choices"][0]["message"]["content"].strip().replace("\n", "  |  ")


def main():
    for s in SAMPLES:
        sents = listbound.split_sentences(rules.clean(s["messy"]))
        if len(sents) < listbound.MIN_SENTENCES:
            continue
        user = listbound.build_prompt(sents)
        ref = REFERENCE[s["id"]]
        print(f"\n{s['id']}  n={len(sents)}  ref breaks={ref['breaks']} list={ref['list']}")
        for name, prompt in VARIANTS.items():
            print(f"  {name:16} {ask(prompt, user)}")


if __name__ == "__main__":
    main()
