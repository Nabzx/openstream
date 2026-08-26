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
// which this module handles directly) belongs to the dictation coordinator.
// The rewrite model server returns sentence indices and never rewrites text.

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
  // #124: scoped to explicit trigger phrases only, not the ordinal-word
  // heuristic ("first," ... "second," ...) the issue leaves open - that
  // heuristic risks misfiring on ordinary prose ("first, second, and
  // third, I want to say thanks" is one flowing sentence, not a list), and
  // an explicit command is unambiguous the same way #131's emoji triggers
  // are. Also scoped to bullets only, not numbered lists - a "1. 2. 3."
  // marker needs a running counter across matches, a different shape of
  // transformation than this table's stateless single-token replace.
  [/\b(bullet point|new bullet)\b/gi, "\n- "],
  [/\bfull stop\b/gi, "."],
  [/\bperiod\b/gi, "."],
  [/\bcomma\b/gi, ","],
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation (mark|point)\b/gi, "!"],
  [/\bcolon\b/gi, ":"],
  [/\bsemicolon\b/gi, ";"],
  [/\bopen paren(thesis)?\b/gi, "("],
  [/\bclose paren(thesis)?\b/gi, ")"],
  [/[ \t]*\bdash\b[ \t]*/gi, "-"],
  [/[ \t]*\bslash\b[ \t]*/gi, "/"],
];

// Casual messaging emoji (#131). Every trigger ends in the explicit word
// "emoji" - unlike SPOKEN_PUNCT's "period"/"comma", every word here
// ("heart", "fire", "laughing", "hundred") is common in ordinary narrative
// prose on its own, so an unmarked trigger would misfire constantly
// ("my heart is racing", "the fire alarm"). Requiring "emoji" makes every
// match a deliberate, explicit request rather than an ordinary word this
// engine has to guess the intent of.
//
// Unlike a newline (SPOKEN_PUNCT), an emoji is never gated behind
// breakSafe/oneLineBox: a literal newline can submit a form or send a chat
// message early, which is a functional break, not just a style mismatch -
// an emoji character carries no such risk, and requiring the explicit
// "emoji" word already means the user opted in for this specific
// utterance. Gating it the same way newlines are gated would be solving a
// problem this transformation doesn't actually have.
const SPOKEN_EMOJI = [
  [/\b(smiley|smiling) face emoji\b/gi, "🙂"],
  [/\bheart emoji\b/gi, "❤️"],
  [/\bthumbs up emoji\b/gi, "👍"],
  [/\bthumbs down emoji\b/gi, "👎"],
  [/\blaughing emoji\b/gi, "😂"],
  [/\bcrying emoji\b/gi, "😢"],
  [/\bfire emoji\b/gi, "🔥"],
  [/\b(one )?hundred emoji\b/gi, "💯"],
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

function applySpokenPunct(text, { allowNewlines }) {
  for (const [pattern, replacement] of SPOKEN_PUNCT) {
    // Deny-by-default (#45 §3): a spoken newline command - including a
    // bullet marker (#124), which is a newline too - only becomes literal
    // when the frontmost app is on the break-safe allow-list. Same
    // degrade-to-space fallback as new line/new paragraph: outside a
    // break-safe app, "bullet point" just doesn't start a new line, rather
    // than silently dropping the dash into the middle of a sentence.
    const isNewline = replacement === "\n" || replacement === "\n\n" || replacement === "\n- ";
    text = text.replace(pattern, isNewline && !allowNewlines ? " " : replacement);
  }
  // Tidy the space the replaced word left behind: " ." -> "."
  text = text.replace(/\s+([.,!?;:)])/g, "$1");
  // (?<!\n): a dash right after a newline is #124's list marker, which
  // needs its trailing space ("- item") - unlike the hyphen use of "dash"
  // (SPOKEN_PUNCT's own pattern for that already consumes its surrounding
  // whitespace, so this tidy rule matching dash at all is redundant there).
  text = text.replace(/(?<!\n)([(/-])\s+/g, "$1");
  // Same tidy for a newline a spoken "new line"/"new paragraph" just inserted.
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  // whisper often already punctuated the sentence, so a spoken "period" can
  // land next to real punctuation. The mark whisper inferred is the more
  // specific one, so it wins on collision.
  text = text.replace(/\.([?!])/g, "$1");
  text = text.replace(/([?!,;:])\./g, "$1");
  text = text.replace(/([.,!?;:])\1+/g, "$1");
  return text;
}

function applySpokenEmoji(text) {
  for (const [pattern, replacement] of SPOKEN_EMOJI) {
    text = text.replace(pattern, replacement);
  }
  // Tidy doubled spacing an emoji substitution can leave behind - the
  // trigger phrase is usually longer than the emoji it becomes.
  text = text.replace(/[ \t]{2,}/g, " ");
  return text;
}

function stripLeadingFillers(text) {
  const parts = text.split(SENT_BOUNDARY_SPLIT);
  const out = [];
  for (let part of parts) {
    let changed = true;
    while (changed && part) {
      changed = false;
      for (const filler of LEADING_FILLERS) {
        const match = part.match(new RegExp(`^\\s*${filler}\\b[,]?\\s+`, "i"));
        // Never strip if it would leave nothing behind.
        if (match && part.slice(match[0].length).trim()) {
          part = part.slice(match[0].length);
          changed = true;
        }
      }
    }
    out.push(part);
  }
  return out.join("");
}

const RUN_ON_CONNECTIVES = new Set(["so", "and", "but", "because"]);

function segmentSentences(text) {
  // Whisper punctuates short clips well but leaves long dictation as one
  // unbroken run-on, so a conjunction-based split is the highest-value rule
  // for the paragraph bucket. Known weakness (see #45): this can land a
  // boundary mid-clause on long paragraphs.
  if (text.split(/\s+/).filter(Boolean).length < 25) return text;

  const out = [];
  for (const sentence of text.split(SENT_END)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length < 30) {
      out.push(sentence);
      continue;
    }
    const rebuilt = [];
    let run = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const bare = word.replace(/,$/, "").toLowerCase();
      const remainder = words.length - i;
      // Split only when both the run so far AND the remainder are long
      // enough to stand alone, so we never strand a fragment.
      if (RUN_ON_CONNECTIVES.has(bare) && run.length >= 12 && remainder >= 8) {
        rebuilt.push(run.join(" ").replace(/,$/, "") + ".");
        run = [word.replace(/,$/, "")];
      } else {
        run.push(word);
      }
    }
    if (run.length) rebuilt.push(run.join(" "));
    out.push(rebuilt.join(" "));
  }
  return out.join(" ");
}

function applyVocab(text) {
  for (const [pattern, replacement] of VOCAB) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function capitalise(text) {
  text = text.replace(/\bi\b/g, "I");
  text = text.replace(/\bi'(m|ve|ll|d)\b/g, (_match, suffix) => "I'" + suffix);
  const parts = text.split(SENT_BOUNDARY_SPLIT);
  return parts
    .map((part) => {
      // A #124 bullet marker sits before the sentence-start letter, not on
      // it - "- milk" should capitalise to "- Milk", not leave the marker's
      // dash mistaken for the first character.
      const marker = part.match(/^-\s+/);
      const prefix = marker ? marker[0] : "";
      const rest = part.slice(prefix.length);
      return rest && /[a-zA-Z]/.test(rest[0]) ? prefix + rest[0].toUpperCase() + rest.slice(1) : part;
    })
    .join("");
}

function terminalPunct(text) {
  text = text.replace(/\s+$/, "");
  if (text && !".!?:".includes(text[text.length - 1])) {
    text += ".";
  }
  return text;
}

/**
 * @param {string} text - raw transcript from whisper-server.
 * @param {object} [options]
 * @param {boolean} [options.oneLineBox] - AXTextField-style single-line
 *   field (#45 §2): no sentence breaks, no final full stop, no newline.
 * @param {boolean} [options.breakSafe] - frontmost app is on the break-safe
 *   allow-list (#45 §3). Deny-by-default: unknown/unlisted apps get no
 *   literal newlines even when the user says "new line"/"new paragraph".
 */
function cleanup(text, options = {}) {
  const oneLineBox = Boolean(options.oneLineBox);
  // A one-line field cannot hold a newline at all, regardless of the
  // allow-list - that modifier takes precedence.
  const allowNewlines = Boolean(options.breakSafe) && !oneLineBox;

  text = text.trim();
  // whisper-server hard-wraps its output; that's an STT-layer artifact, not
  // something the speaker said, and must go before anything else runs.
  text = text.replace(/\s*\n\s*/g, " ");

  text = stripFillers(text);
  text = collapseRepeats(text);
  text = applySpokenPunct(text, { allowNewlines });
  text = applySpokenEmoji(text);
  text = stripLeadingFillers(text);
  if (!oneLineBox) {
    text = segmentSentences(text);
  }
  text = capitalise(text);
  // Apply fixed casing after sentence capitalisation so names such as macOS
  // keep their settled spelling even at the start of a dictation.
  text = applyVocab(text);
  text = oneLineBox ? text.replace(/\.\s*$/, "").replace(/\s+$/, "") : terminalPunct(text);
  text = text.replace(/[ \t]{2,}/g, " ");

  return text.trim();
}

module.exports = {
  cleanup,
  STANDALONE_FILLERS,
  PHRASE_FILLERS,
  LEADING_FILLERS,
  SPOKEN_PUNCT,
  SPOKEN_EMOJI,
  VOCAB,
  SENT_END,
  SENT_BOUNDARY_SPLIT,
  stripFillers,
  collapseRepeats,
  applySpokenPunct,
  applySpokenEmoji,
  stripLeadingFillers,
  segmentSentences,
  applyVocab,
  capitalise,
  terminalPunct,
};
