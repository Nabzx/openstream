"""PROTOTYPE - throwaway. The two-line structure call, as a pure module.

The liftable part of the spike (prototype skill, LOGIC branch): no server, no
DOM, no timing. Given rules-cleaned text it builds the prompt; given the
model's reply it parses BOTH dimensions and assembles the text.

The contract #125 extends (from #67's single question to two):

    rules cleanup -> numbered sentences -> model -> two lines -> paragraphs + list

    BREAKS: 3, 7      indices of sentences that START a new paragraph, or "none"
    LIST: 5-8         one range of sentences that form a spoken list, or "none"

The model returns positions only, never rewritten text. Both lines fail closed
independently: a line we cannot read cleanly degrades to "no structure on that
dimension" and the text renders as ordinary prose (#90's rule for a bad
paragraph-break reply, applied to the list line too). A wrong list is far more
visible than a missed one.

The system prompt carries #67's validated decision: SEVERAL varied examples,
not one. A single worked example anchors the first break onto its own digits.
Kept byte-identical (modulo the JS list syntax) to
electron/breakPlacementHttpAdapter.js so the spike measures the shipped prompt.
"""
import re

# #45's structural gate: the model is asked only when rules cleanup produced at
# least three sentences. Below that there is nowhere sensible to put a break,
# and a "list" of one or two clauses is not worth the call.
MIN_SENTENCES = 3

SYSTEM_PROMPT = (
    "You structure dictated text. You are given numbered sentences. Reply with "
    "exactly two lines and nothing else:\n"
    "BREAKS: <numbers of the sentences that should START a new paragraph, "
    "comma-separated, or: none>\n"
    "LIST: <one range N-M if sentences N to M are a spoken list of items, or: "
    "none>\n"
    "Rules:\n"
    "- BREAKS: break where the topic shifts, not to make paragraphs even. "
    "Never output sentence 1. Never output a number that was not given.\n"
    "- LIST: only when the speaker is plainly enumerating items - things to "
    "buy, steps to follow, options to weigh. Sentences that merely open with "
    '"first" or "second" as a turn of phrase are not a list.\n'
    "- When unsure, answer none. Never invent structure that was not spoken.\n"
    "- Reply with ONLY the two lines. No prose, no explanation.\n"
    "Examples of the reply format:\n"
    "BREAKS: 2, 5\nLIST: none\n"
    "-\n"
    "BREAKS: none\nLIST: 3-6\n"
    "-\n"
    "BREAKS: 4\nLIST: 7-10\n"
    "-\n"
    "BREAKS: none\nLIST: none"
)

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
_INT = re.compile(r"\d+")
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)
_BREAKS_LINE = re.compile(r"^[^\S\n]*BREAKS[^\S\n]*:?[^\S\n]*(.*)$", re.I | re.M)
_LIST_LINE = re.compile(r"^[^\S\n]*LIST[^\S\n]*:?[^\S\n]*(.*)$", re.I | re.M)
_STRICT_BREAKS = re.compile(
    r"^\s*(?:none|no breaks?)\s*[.!]?\s*$|^\s*\d+(?:\s*,\s*\d+)*\s*[.]?\s*$", re.I)
_RANGE = re.compile(r"(\d+)\s*(?:-|–|—|to|through|thru)\s*(\d+)", re.I)


def split_sentences(text):
    """Rules-cleaned text -> list of sentences. Mirrors rules.py's boundary."""
    return [s.strip() for s in _SENT_SPLIT.split(text.strip()) if s.strip()]


def should_ask(sentences):
    """#45's gate: structural, not a guessed word count."""
    return len(sentences) >= MIN_SENTENCES


def build_prompt(sentences):
    """The user message: numbered sentences, one per line."""
    return "\n".join(f"{i}. {s}" for i, s in enumerate(sentences, 1))


def parse_reply(reply, n_sentences):
    """Model reply -> dict(breaks, list, ...).

    breaks: dict(indices, verdict, strict)      - same shape/semantics as #67
    list:   dict(range, verdict, strict)        - the new dimension

    list verdict is one of:
      ok        - a clean, in-range sentence span came back
      none      - LIST: none, an explicit decline
      absent    - short-form reply, no LIST line, no claim made
      repaired  - a range came back but had to be clamped into the text
      invalid   - a LIST line we could not read -> fail closed to prose

    `range` is always safe to apply: a (start, end) 1-based inclusive tuple with
    2 <= end - start + 1, 1 <= start, end <= n_sentences - or None.
    """
    raw = _THINK.sub("", reply or "").strip()

    return {
        "breaks": _parse_breaks(raw, n_sentences),
        "list": _parse_list(raw, n_sentences),
    }


def _parse_breaks(raw, n):
    m = _BREAKS_LINE.search(raw)
    if m:
        segment = m.group(1).strip()
    elif _LIST_LINE.search(raw):
        segment = ""            # half-followed the contract; do not scavenge
    else:
        segment = raw           # old bare reply, read whole

    strict = bool(_STRICT_BREAKS.match(segment))
    if re.search(r"\bnone\b|\bno breaks?\b", segment, re.I):
        return dict(indices=[], verdict="none", strict=strict)

    found = [int(x) for x in _INT.findall(segment)]
    if not found:
        return dict(indices=[], verdict="invalid" if segment else "none",
                    strict=strict)

    usable = sorted({i for i in found if 2 <= i <= n})
    if not usable:
        return dict(indices=[], verdict="invalid", strict=False)
    return dict(indices=usable,
                verdict="repaired" if found != usable else "ok", strict=strict)


def _parse_list(raw, n):
    m = _LIST_LINE.search(raw)
    if not m:
        return dict(range=None, verdict="absent", strict=False)

    segment = m.group(1).strip()
    strict = bool(re.match(r"^(?:none|no list|\d+\s*-\s*\d+)\s*$", segment, re.I))
    if segment == "":
        return dict(range=None, verdict="invalid", strict=False)
    if re.match(r"^(?:none|no list)\b", segment, re.I):
        return dict(range=None, verdict="none", strict=strict)

    rm = _RANGE.search(segment)
    if not rm:
        return dict(range=None, verdict="invalid", strict=False)

    a, b = int(rm.group(1)), int(rm.group(2))
    raw_start, raw_end = min(a, b), max(a, b)
    start, end = max(1, raw_start), min(n, raw_end)
    if end - start < 1:
        return dict(range=None, verdict="invalid", strict=strict)
    repaired = (start, end) != (raw_start, raw_end)
    return dict(range=(start, end),
                verdict="repaired" if repaired else "ok", strict=strict)


def assemble(sentences, breaks_indices, list_range):
    """Sentences + parsed structure -> the delivered text (one string).

    Mirrors electron/paragraphBreaks.renderStructuredText: with no list range
    this is plain paragraph breaks; with a range those sentences become "- "
    bullets set off by blank lines, and breaks inside the list are dropped.
    """
    if not list_range:
        return _paras(sentences, breaks_indices)

    start, end = list_range
    before = sentences[:start - 1]
    items = sentences[start - 1:end]
    after = sentences[end:]

    blocks = []
    if before:
        blocks.append(_paras(before, breaks_indices))
    blocks.append("\n".join(f"- {s}" for s in items))
    if after:
        after_breaks = [i - end for i in breaks_indices if i > end + 1]
        blocks.append(_paras(after, after_breaks))
    return "\n\n".join(blocks)


def _paras(sentences, indices):
    starts = {i for i in indices if i > 1}
    out = []
    for pos, s in enumerate(sentences, 1):
        if pos > 1:
            out.append("\n\n" if pos in starts else " ")
        out.append(s)
    return "".join(out)
