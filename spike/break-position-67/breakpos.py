"""PROTOTYPE - throwaway. The break-position call, as a pure module.

The system prompt below carries a validated decision: SEVERAL varied examples,
not one. A single worked example anchors the model's first break onto that
example's first digit, and removing examples entirely destroys format
compliance. Several varied examples keep format compliance at 12/12 and
eliminate Qwen3's degenerate break-at-every-sentence behaviour. See FINDINGS.md.

This is the liftable part of the spike (prototype skill, LOGIC branch): no
server, no DOM, no timing. Given rules-cleaned text it builds the prompt, and
given the model's reply it parses indices and assembles paragraphs.

The contract is the one #45 decided:

    rules cleanup  ->  numbered sentences  ->  model  ->  "3, 7"  ->  paragraphs

The model returns break positions, never text. An index is the number of a
sentence that STARTS a new paragraph, so `3, 7` on nine sentences means three
paragraphs: 1-2, 3-6, 7-9. Sentence 1 is never a valid index (every text
already starts a paragraph) and neither is anything past the last sentence.
"""
import re

# #45's structural gate: the model is asked only when rules cleanup produced at
# least three sentences. Below that there is nowhere sensible to put a break.
MIN_SENTENCES = 3

SYSTEM_PROMPT = (
    "You place paragraph breaks in dictated text. You are given numbered "
    "sentences. Reply with the numbers of the sentences that should START a "
    "new paragraph, as a comma-separated list. Examples of the reply "
    "format: `2, 5, 9` or `4` or `3, 6` or `none`\n"
    "Rules:\n"
    "- Break where the topic shifts, not to make paragraphs even.\n"
    "- Never output sentence 1. Never output a number that was not given.\n"
    "- If the text should stay as one paragraph, reply: none\n"
    "- Reply with ONLY numbers or the word none. No text, no explanation."
)

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
_INT = re.compile(r"\d+")
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def split_sentences(text):
    """Rules-cleaned text -> list of sentences. Mirrors rules.py's own boundary."""
    return [s.strip() for s in _SENT_SPLIT.split(text.strip()) if s.strip()]


def should_ask(sentences):
    """#45's gate: structural, not a guessed word count."""
    return len(sentences) >= MIN_SENTENCES


def build_prompt(sentences):
    """The user message: numbered sentences, one per line."""
    return "\n".join(f"{i}. {s}" for i, s in enumerate(sentences, 1))


_STRICT = re.compile(r"^\s*(?:none|no breaks?)\s*[.!]?\s*$|^\s*\d+(?:\s*,\s*\d+)*\s*[.]?\s*$", re.I)


def parse_reply(reply, n_sentences):
    """Model reply -> dict(indices, verdict, strict).

    `verdict` is one of:
      ok       - usable indices came back
      none     - a "no breaks" answer
      repaired - numbers came back but some were unusable and were dropped
      invalid  - nothing usable came back at all

    `strict` records separately whether the reply obeyed the output format
    exactly (numbers only, or the word none). A reply we can scavenge numbers
    out of still counts as a format failure, because the whole latency case
    rests on the output being a handful of tokens - a model that explains
    itself first is both slower and off-contract. Collapsing the two would
    hide exactly the failure this spike is looking for.

    `indices` is always safe to apply: sorted, unique, in range, never 1.
    """
    raw = _THINK.sub("", reply or "").strip()
    strict = bool(_STRICT.match(raw))
    if not raw:
        return dict(indices=[], verdict="invalid", strict=False)

    found = [int(m) for m in _INT.findall(raw)]
    if not found:
        no_breaks = re.search(r"\bnone\b|\bno breaks?\b", raw, re.I)
        return dict(indices=[], verdict="none" if no_breaks else "invalid",
                    strict=strict)

    usable = sorted({i for i in found if 2 <= i <= n_sentences})
    if not usable:
        return dict(indices=[], verdict="invalid", strict=False)
    dropped = found != usable
    return dict(indices=usable, verdict="repaired" if dropped else "ok",
                strict=strict)


def assemble(sentences, indices):
    """Sentences + break indices -> paragraphs (list of strings)."""
    starts = [1] + [i for i in indices if 1 < i <= len(sentences)]
    paras = []
    for a, b in zip(starts, starts[1:] + [len(sentences) + 1]):
        paras.append(" ".join(sentences[a - 1:b - 1]))
    return [p for p in paras if p]
