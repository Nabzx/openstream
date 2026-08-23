"""PROTOTYPE - throwaway. The spike author's own paragraphing, for issue #67.

This is ONE person's judgement, written before any model was run, so the
agreement number below is not contaminated by seeing the answers. It is a
cheap signal, NOT the human judgement the ticket asks for - that comes from a
person driving out/review.html and saying whether the breaks read well.

Indices are sentence numbers that start a new paragraph, over the sentences
that `rules.clean` + `breakpos.split_sentences` actually produce. Chosen from
the boundaries the segmenter offers, because that is the same constraint the
model works under.
"""

REFERENCE = {
    "arch-1":      [3, 6],      # setup / the llama-server worry / the proposal
    "onboard-1":   [2],         # the three prompts / what we should do
    "bug-1":       [3],         # diagnosis / the fix
    "review-1":    [3],         # the two flags / the taste question
    "plan-1":      [3, 5, 7],   # bucket 1 / bucket 2 / bucket 3 / the proposal
    "incident-1":  [3, 5],      # timeline / mechanism + fix / the lesson
    "design-1":    [3, 5],      # the pitch / the indicator / everything else
    "hiring-1":    [4],         # what was strong / where the gap is
    "migration-1": [7, 10],     # today's pain / stages one and two / stage three
    "perf-1":      [3, 8],      # the problem / the four chunks / the proposal
    "product-1":   [5, 8],      # framing critique / the real difference / the risk
    "standup-1":   [4, 8, 12],  # transcription / rules / accessibility / blocked
}
