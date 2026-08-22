#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Deterministic rule-based dictation cleanup.

This is the "near-zero latency" arm of the comparison, so it is deliberately a
serious attempt rather than a strawman: filler removal, stutter/repeat collapse,
spoken-punctuation commands, sentence segmentation, capitalisation, and a small
technical-vocabulary fixup pass. If the LLM cleanup cannot clearly beat this,
the LLM does not earn its latency.
"""
import re

# Discourse-marker fillers. Only stripped when they act as fillers, never when
# they carry meaning ("I like it", "sort of the same" are left alone by the
# boundary conditions below).
STANDALONE_FILLERS = ["um", "uh", "erm", "er", "ah", "hmm", "mhm"]

PHRASE_FILLERS = [
    "you know",
    "i mean",
    "kind of like",
    "sort of like",
]

# Fillers only removed at the very start of a sentence, where they are almost
# always throat-clearing rather than content.
LEADING_FILLERS = ["so", "okay", "ok", "well", "right", "now", "basically",
                   "actually", "literally", "anyway", "like"]

SPOKEN_PUNCT = [
    (r"\bnew paragraph\b", "\n\n"),
    (r"\bnew line\b", "\n"),
    (r"\bfull stop\b", "."),
    (r"\bperiod\b", "."),
    (r"\bcomma\b", ","),
    (r"\bquestion mark\b", "?"),
    (r"\bexclamation (mark|point)\b", "!"),
    (r"\bcolon\b", ":"),
    (r"\bsemicolon\b", ";"),
    (r"\bopen paren(thesis)?\b", "("),
    (r"\bclose paren(thesis)?\b", ")"),
    (r"\bdash\b", "-"),
    (r"\bslash\b", "/"),
]

# Technical vocabulary that dictation reliably mangles. A real implementation
# would source these from the open repo (see the codebase-vocabulary roadmap
# item); a fixed list is enough to make the comparison fair.
VOCAB = [
    (r"\blama[- ]server\b", "llama-server"),
    (r"\bllama server\b", "llama-server"),
    (r"\bmacos\b", "macOS"),
    (r"\bram\b", "RAM"),
    (r"\bhot key\b", "hotkey"),
    (r"\bauto update\b", "auto-update"),
    (r"\brules based\b", "rules-based"),
    (r"\bgit hub\b", "GitHub"),
    (r"\bjava script\b", "JavaScript"),
    (r"\btype script\b", "TypeScript"),
]

_SENT_END = re.compile(r"(?<=[.!?])\s+")


def _strip_fillers(text: str) -> str:
    for phrase in PHRASE_FILLERS:
        text = re.sub(rf"\b{phrase}\b[,]?\s*", "", text, flags=re.I)
    for f in STANDALONE_FILLERS:
        # Only as a whole word bounded by whitespace/punctuation.
        text = re.sub(rf"(?:(?<=\s)|(?<=^)){f}\b[,]?\s*", "", text, flags=re.I)
    return text


def _collapse_repeats(text: str) -> str:
    # "the the problem" -> "the problem"; "is is" -> "is". Runs repeatedly so
    # triples collapse too. Case-insensitive, keeps the first occurrence.
    prev = None
    while prev != text:
        prev = text
        # [\w']+ so contractions collapse too ("let's let's" -> "let's").
        text = re.sub(r"(?<![\w'])([\w']+)(\s+\1)+(?![\w'])", r"\1", text, flags=re.I)
    return text


def _apply_spoken_punct(text: str) -> str:
    for pat, repl in SPOKEN_PUNCT:
        text = re.sub(pat, repl, text, flags=re.I)
    # Tidy the space the replaced word left behind: " ." -> "."
    text = re.sub(r"\s+([.,!?;:)])", r"\1", text)
    text = re.sub(r"([(/-])\s+", r"\1", text)
    # Whisper often already punctuated the sentence, so a spoken "period" can
    # land next to real punctuation ("again period?" -> "again.?"). The mark
    # whisper inferred is the more specific one, so it wins.
    text = re.sub(r"\.([?!])", r"\1", text)
    text = re.sub(r"([?!,;:])\.", r"\1", text)
    text = re.sub(r"([.,!?;:])\1+", r"\1", text)
    return text


def _segment_sentences(text: str) -> str:
    """Insert sentence breaks where a long run has none.

    Whisper punctuates short clips well but leaves long dictation as one
    unbroken run-on, so a conjunction-based split is the highest-value rule
    for the paragraph bucket.
    """
    if len(text.split()) < 25:
        return text
    out = []
    for sent in _SENT_END.split(text):
        words = sent.split()
        if len(words) < 30:
            out.append(sent)
            continue
        # Split before a discourse connective that starts a new clause, but
        # only once the current run is already long enough to stand alone.
        rebuilt, run = [], []
        for i, w in enumerate(words):
            bare = w.strip(",").lower()
            # Split only when both the run so far AND the remainder are long
            # enough to stand alone, so we never strand a fragment.
            remainder = len(words) - i
            if bare in ("so", "and", "but", "because") and len(run) >= 12 \
                    and remainder >= 8:
                rebuilt.append(" ".join(run).rstrip(",") + ".")
                run = [w.strip(",")]
            else:
                run.append(w)
        if run:
            rebuilt.append(" ".join(run))
        out.append(" ".join(rebuilt))
    return " ".join(out)


def _capitalise(text: str) -> str:
    text = re.sub(r"\bi\b", "I", text)
    text = re.sub(r"\bi'(m|ve|ll|d)\b", lambda m: "I'" + m.group(1), text)
    parts = re.split(r"(\n+|(?<=[.!?])\s+)", text)
    parts = [p[0].upper() + p[1:] if p and p[0].isalpha() else p for p in parts]
    return "".join(parts)


def _terminal_punct(text: str) -> str:
    text = text.rstrip()
    if text and text[-1] not in ".!?:":
        text += "."
    return text


def _strip_leading_fillers(text: str) -> str:
    parts = re.split(r"(\n+|(?<=[.!?])\s+)", text)
    out = []
    for p in parts:
        changed = True
        while changed and p:
            changed = False
            for f in LEADING_FILLERS:
                m = re.match(rf"\s*{f}\b[,]?\s+", p, flags=re.I)
                # Never strip if it would leave nothing behind.
                if m and p[m.end():].strip():
                    p = p[m.end():]
                    changed = True
        out.append(p)
    return "".join(out)


def clean(text: str) -> str:
    text = text.strip()
    # whisper-server hard-wraps its output; those line breaks are an artifact of
    # the STT layer, not the speech, and must go before anything else runs.
    text = re.sub(r"\s*\n\s*", " ", text)
    text = _strip_fillers(text)
    text = _collapse_repeats(text)
    text = _apply_spoken_punct(text)
    text = _strip_leading_fillers(text)
    text = _segment_sentences(text)
    for pat, repl in VOCAB:
        text = re.sub(pat, repl, text, flags=re.I)
    text = _capitalise(text)
    text = _terminal_punct(text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


if __name__ == "__main__":
    import json
    import pathlib
    samples = json.loads((pathlib.Path(__file__).parent / "samples.json").read_text())
    for s in samples:
        print(f"--- {s['id']} ---")
        print("IN :", s["messy"])
        print("OUT:", clean(s["messy"]))
        print()
