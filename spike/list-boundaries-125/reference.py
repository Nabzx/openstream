"""PROTOTYPE - throwaway. One author's read of the expected structure per
sample, for an automated agreement number only. NOT the human judgement the
ticket asks for - that comes from a person driving out/review.html.

Each entry:
    breaks  list of sentence numbers that should start a new paragraph ([] = none)
    list    (start, end) 1-based inclusive sentence span that is a spoken list,
            or None

Sentence numbers are against the RULES-CLEANED text (run bench.py, which prints
the numbering per sample). They were read off the numbering committed here on
2026-08-27; if rules.py's run-on splitter changes, re-check them.

Pre-run note that matters (see FINDINGS.md): rules.py's splitter (a known #45
weakness) merges several of these lists' items into one run-on sentence, so a
sentence-index contract physically cannot mark them item-by-item. Where that
happened the `list` span still covers the sentences the list content falls in,
and the review page is where a human decides whether the bulleted result is
acceptable anyway.
"""

REFERENCE = {
    # --- genuine lists ---------------------------------------------------
    # Items milk / eggs+bread / coffee / washing-up liquid, over s2-s4;
    # the splitter fused the first three items into s2.
    "list-groceries":     dict(breaks=[], list=(2, 4)),

    # Only 2 sentences after cleanup -> below MIN_SENTENCES, never asked.
    "list-standup":       dict(breaks=[], list=None),

    # Lead-in fused with the first item (passports) into s1; items run s1-s6.
    "list-packing":       dict(breaks=[], list=(2, 6)),

    # Clean: s1 lead-in, s2-s6 the steps, s7 a caveat. The good case.
    "list-deploy-steps":  dict(breaks=[], list=(2, 6)),

    # s1 lead-in, s2-s6 the three candidates (candidate 1 split across s2-s3),
    # s7 the conclusion.
    "list-candidates":    dict(breaks=[], list=(2, 6)),

    # --- lists trapped inside one sentence (the structural gap) ---------
    # Only 2 sentences -> never asked; and the items are sub-sentence anyway.
    "inline-shop":        dict(breaks=[], list=None),

    # 3 sentences, but budget / hiring plan / office move all sit inside
    # s1-s2. The contract cannot express a sub-sentence span; correct answer
    # is LIST: none. If the model flags a range here that is a false positive.
    "inline-agenda":      dict(breaks=[], list=None),

    # --- decoys: ordinal words, no list -------------------------------
    "decoy-thanks":       dict(breaks=[], list=None),
    "decoy-argument":     dict(breaks=[], list=None),
    "decoy-story":        dict(breaks=[], list=None),

    # --- carried from #67: breaks-dimension regression check -----------
    "carry-arch-1":       dict(breaks=[3, 6], list=None),
    "carry-onboard-1":    dict(breaks=[2], list=None),
}
