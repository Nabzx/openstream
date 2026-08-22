// Deterministic prose cleanup for transcribed dictation - the whole cleanup
// path on a normal dictation, per #24/#45. Budget: 0.1-1.0ms, so rules stay
// cheap and stateless. Faithful port of the throwaway spike at
// spike/llm-cleanup-latency/rules.py, which #24 was measured against.
//
// Known limitation carried over from the spike (recorded in #45): run-on
// segmentation splits on conjunctions, which can land a boundary mid-clause
// on long paragraphs. No cleanup layer can repair a mis-transcription -
// that's an STT problem, not this engine's.
//
// Paragraph-break *placement* (as opposed to a spoken "new paragraph",
// which this module handles directly) is decided by the rewrite model
// server per #45 §5, and is deliberately NOT implemented here: #14
// (llama-server plumbing) hasn't landed and #67 (whether the model picks
// sensible breaks at all) hasn't been validated. That's follow-up work
// once both land, not a gap in this engine.

const STANDALONE_FILLERS = ["um", "uh", "erm", "er", "ah", "hmm", "mhm"];

const PHRASE_FILLERS = ["you know", "i mean", "kind of like", "sort of like"];

// Only stripped at the very start of a sentence, where they are almost
// always throat-clearing rather than content.
const LEADING_FILLERS = [
  "so", "okay", "ok", "well", "right", "now", "basically",
  "actually", "literally", "anyway", "like",
];

const SPOKEN_PUNCT = [
  [/\bnew paragraph\b/gi, "\n\n"],
  [/\bnew line\b/gi, "\n"],
  [/\bfull stop\b/gi, "."],
  [/\bperiod\b/gi, "."],
  [/\bcomma\b/gi, ","],
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation (mark|point)\b/gi, "!"],
  [/\bcolon\b/gi, ":"],
  [/\bsemicolon\b/gi, ";"],
  [/\bopen paren(thesis)?\b/gi, "("],
  [/\bclose paren(thesis)?\b/gi, ")"],
  [/\bdash\b/gi, "-"],
  [/\bslash\b/gi, "/"],
];

// Technical vocabulary dictation reliably mangles. A fixed list for now; the
// codebase-vocabulary scanner (#16) is a separate, dynamic source later.
const VOCAB = [
  [/\blama[- ]server\b/gi, "llama-server"],
  [/\bllama server\b/gi, "llama-server"],
  [/\bmacos\b/gi, "macOS"],
  [/\bram\b/gi, "RAM"],
  [/\bhot key\b/gi, "hotkey"],
  [/\bauto update\b/gi, "auto-update"],
  [/\brules based\b/gi, "rules-based"],
  [/\bgit hub\b/gi, "GitHub"],
  [/\bjava script\b/gi, "JavaScript"],
  [/\btype script\b/gi, "TypeScript"],
];

const SENT_END = /(?<=[.!?])\s+/;
const SENT_BOUNDARY_SPLIT = /(\n+|(?<=[.!?])\s+)/;

function stripFillers(text) {
  for (const phrase of PHRASE_FILLERS) {
    text = text.replace(new RegExp(`\\b${phrase}\\b[,]?\\s*`, "gi"), "");
  }
  for (const filler of STANDALONE_FILLERS) {
    // Only as a whole word bounded by whitespace/start-of-string.
    text = text.replace(new RegExp(`(?:(?<=\\s)|(?<=^))${filler}\\b[,]?\\s*`, "gi"), "");
  }
  return text;
}

function collapseRepeats(text) {
  // "the the problem" -> "the problem"; runs repeatedly so triples collapse
  // too. [\w']+ so contractions collapse too ("let's let's" -> "let's").
  let prev = null;
  while (prev !== text) {
    prev = text;
    text = text.replace(/(?<![\w'])([\w']+)(\s+\1)+(?![\w'])/gi, "$1");
  }
  return text;
}

module.exports = {
  STANDALONE_FILLERS,
  PHRASE_FILLERS,
  LEADING_FILLERS,
  SPOKEN_PUNCT,
  VOCAB,
  SENT_END,
  SENT_BOUNDARY_SPLIT,
  stripFillers,
  collapseRepeats,
};
