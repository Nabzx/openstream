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
  // #128: symbols, same table shape as the punctuation above them. Each
  // self-trims whitespace on whichever side it naturally attaches to in
  // real usage, matching how open/close paren already do this
  // asymmetrically rather than uniformly - "fifty percent" -> "50%" (no
  // space before the mark), "dollar sign fifty" -> "$50" (none after),
  // "at sign" attaches on both sides like dash does.
  [/[ \t]*\bpercent\b/gi, "%"],
  [/\bdollar sign\b[ \t]*/gi, "$"],
  [/[ \t]*\bat sign\b[ \t]*/gi, "@"],
  [/\bhashtag\b[ \t]*/gi, "#"],
  // #129: code-structure symbols, exact same shape as open/close paren
  // above - the general-punctuation tidy-up below (applySpokenPunct)
  // already handles the surrounding-whitespace trim for both bracket
  // types, same as it does for parens.
  //
  // Case conversion ("snake case get user name" -> get_user_name) is left
  // out here - a pattern-based rewrite closer to applyVocab's shape than
  // this table's literal substitution, and the issue itself asks whether
  // it belongs in this ticket or its own.
  [/\bopen brace\b/gi, "{"],
  [/\bclose brace\b/gi, "}"],
  [/\bopen bracket\b/gi, "["],
  [/\bclose bracket\b/gi, "]"],
  // "Tab"/"indent" insert whitespace the same way "new line" does, so they
  // reuse the same allowNewlines gate below rather than firing
  // unconditionally like the braces/brackets above. This reuses the
  // general break-safe list as a first cut rather than the narrower
  // code-editor-only sub-list the previous #129 pass flagged as an open
  // question - that sub-list still doesn't exist, and blocking on it means
  // never shipping "tab" at all.
  //
  // Unlike open brace/bracket, "tab" is an ordinary, very common noun
  // ("switch to the other tab", "pick up the tab") - a bare \btab\b would
  // misfire constantly. Gated to only fire right at the start of a clause
  // (start of input, or straight after ./!/?/,/{/[/( or a newline already
  // inserted by an earlier rule in this same pass) - where indentation
  // actually belongs and "switch to the other tab" never lands, since that
  // phrasing always has words before "tab" in the same clause.
  [/(?:^|(?<=[.!?,{[(\n]))[ \t]*\b(?:tab|indent)\b[ \t]*/gi, "\t"],
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

// Self-correction (#127): "scratch that"/"delete that" means the clause
// immediately before it should be discarded, not just the trigger phrase -
// stripping only the phrase (as PHRASE_FILLERS would) leaves both versions
// in the output ("buy milk buy oat milk"). The lookahead requires the
// trigger to be followed by a pause (punctuation or end of input), not more
// words in the same breath, so "delete that file"/"delete that branch" -
// very plausible content in a dev-focused dictation tool - are left alone.
//
// Scope: only the clause in the same comma/sentence run as the trigger.
// Reaching back across an already-finished earlier sentence ("no wait, I
// meant the second one") isn't reliably regex-matchable; per #127 that's a
// future #125-shaped follow-up (ask the rewrite model which sentence a
// correction refers to). Until then, a trigger with nothing to delete in
// its own run (e.g. it lands right after a full stop) is simply dropped as
// a safe no-op rather than guessing which earlier sentence it means.
const SELF_CORRECTION =
  /(?:^|(?<=[.!?,]\s))[^.!?,]*?,?\s*\b(?:scratch|delete) that\b(?=[.,!?]|\s*$)[.,!?]?\s*/gi;

function applySelfCorrection(text) {
  return text.replace(SELF_CORRECTION, "");
}

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
    // bullet marker (#124) and "tab"/"indent" (#129), which insert
    // whitespace the same way - only becomes literal when the frontmost
    // app is on the break-safe allow-list. Same degrade-to-space fallback
    // as new line/new paragraph: outside a break-safe app, "bullet point"
    // or "tab" just doesn't insert, rather than silently landing in the
    // middle of a sentence.
    const isNewline =
      replacement === "\n" || replacement === "\n\n" || replacement === "\n- " || replacement === "\t";
    text = text.replace(pattern, isNewline && !allowNewlines ? " " : replacement);
  }
  // Tidy the space the replaced word left behind: " ." -> "." - ] and }
  // (#129) get the same treatment as the ) they're modelled on. Plain
  // spaces only, not \s generally: a "{"/"}" can legitimately sit right
  // next to a newline or tab (#129) it was dictated alongside ("open brace
  // new line tab ..."), and that whitespace must survive this tidy pass.
  text = text.replace(/ +([.,!?;:)\]}])/g, "$1");
  // (?<!\n): a dash right after a newline is #124's list marker, which
  // needs its trailing space ("- item") - unlike the hyphen use of "dash"
  // (SPOKEN_PUNCT's own pattern for that already consumes its surrounding
  // whitespace, so this tidy rule matching dash at all is redundant there).
  // [ and { (#129) get the same leading-side trim as the ( they're modelled
  // on. Plain spaces only, same reasoning as above.
  text = text.replace(/(?<!\n)([(/\-[{]) +/g, "$1");
  // Same tidy for a newline a spoken "new line"/"new paragraph" just
  // inserted. Spaces only, not tabs: a tab (#129) right after a newline is
  // deliberate indentation, not leftover whitespace from a replaced word -
  // and the tab/indent rule above already trims its own surrounding
  // whitespace inline, so it doesn't need a pass here.
  text = text.replace(/ +\n/g, "\n").replace(/\n +/g, "\n");
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
  // trigger phrase is usually longer than the emoji it becomes. Spaces
  // only, not tabs: a doubled "tab tab" (#129) is a deliberate double
  // indent, not doubled whitespace to squeeze down to one.
  text = text.replace(/ {2,}/g, " ");
  return text;
}

// #128: "quote ... end quote" wraps the spoken span in "...". Unlike a
// newline, a quotation mark carries no functional risk in any app - it
// can't submit a form or send a message - so this is never gated behind
// breakSafe/oneLineBox, the same reasoning SPOKEN_EMOJI already uses.
// Non-greedy + the g flag: "quote a end quote and quote b end quote"
// matches each pair separately rather than spanning from the first
// "quote" to the last "end quote".
//
// Scoped to quoting only, not "bold ... end bold" or similar markdown
// emphasis - #128 itself flags that literal **markdown** characters are
// meaningful in Slack or a markdown editor but wrong in a plain-text field
// or code file, which needs its own app-context gate this repo doesn't
// have yet (breakSafeApps governs newline safety, a different concern).
// Left as a follow-up rather than guessing at that gate here.
function applyQuoteMarkers(text) {
  return text.replace(/\bquote\b\s+(.+?)\s+\bend quote\b/gi, (_match, inner) => `"${inner}"`);
}

// #130: numeric entities. Scoped to currency only - the one category the
// issue treats as relatively clear-cut ("unit-anchored patterns"). Phone
// numbers/confirmation codes and dates/times are deliberately not
// implemented here: the issue's own methodology is to measure what whisper
// already renders correctly on real dictation samples before assuming a
// gap exists (whisper often already emits digit sequences, not words), and
// for dates it explicitly flags "leave it as prose, don't guess" as a
// likely-correct outcome rather than a gap to fill. Neither of those is
// something this change can verify without real audio samples, so both
// are left as follow-ups rather than guessed at.
const NUMBER_WORDS = {
  // "a"/"an" as a number word only ever means one - "a hundred dollars",
  // "a dollar" - the same idiom that already lets English speakers say
  // "a hundred" instead of "one hundred".
  a: 1, an: 1,
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Parses a run of spoken number words (up to the thousands) into an
// integer, standard English number-word grammar. Returns null on anything
// unrecognised rather than guessing - a caller only substitutes the digit
// form when this parses cleanly.
function parseNumberWords(phrase) {
  const words = phrase.toLowerCase().split(/[\s-]+/).filter((word) => word && word !== "and");
  if (words.length === 0) return null;

  let total = 0;
  let current = 0;
  for (const word of words) {
    if (word in NUMBER_WORDS) {
      current += NUMBER_WORDS[word];
    } else if (word === "hundred") {
      current = (current || 1) * 100;
    } else if (word === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else {
      return null;
    }
  }
  return total + current;
}

const NUMBER_WORD_PATTERN =
  "(?:a|an|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|" +
  "sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|" +
  "thousand|and)";
const NUMBER_PHRASE_PATTERN = `${NUMBER_WORD_PATTERN}(?:[\\s-]+${NUMBER_WORD_PATTERN})*`;

function applyCurrency(text) {
  // Combined form first, so a standalone "cents" pass below can't run on a
  // span this pass already consumed.
  text = text.replace(
    new RegExp(`\\b(${NUMBER_PHRASE_PATTERN})\\s+dollars?\\s+and\\s+(${NUMBER_PHRASE_PATTERN})\\s+cents?\\b`, "gi"),
    (match, dollarsWords, centsWords) => {
      const dollars = parseNumberWords(dollarsWords);
      const cents = parseNumberWords(centsWords);
      if (dollars === null || cents === null || cents > 99) return match;
      return `$${dollars}.${String(cents).padStart(2, "0")}`;
    }
  );
  text = text.replace(new RegExp(`\\b(${NUMBER_PHRASE_PATTERN})\\s+dollars?\\b`, "gi"), (match, words) => {
    const dollars = parseNumberWords(words);
    return dollars === null ? match : `$${dollars}`;
  });
  text = text.replace(new RegExp(`\\b(${NUMBER_PHRASE_PATTERN})\\s+cents?\\b`, "gi"), (match, words) => {
    const cents = parseNumberWords(words);
    return cents === null || cents > 99 ? match : `$0.${String(cents).padStart(2, "0")}`;
  });
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
      // A #124 bullet marker, a #128 opening quote, and/or #129 indentation
      // can sit before the sentence-start letter without being it -
      // "- milk" should capitalise to "- Milk", a quote opening a sentence
      // ("hello) to ("Hello, and an indented line (\treturn y) to
      // \tReturn y - not leave the marker/quote/tab mistaken for the first
      // character.
      const prefix = part.match(/^\t*(-\s+)?"?/)[0];
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

  text = applySelfCorrection(text);
  text = stripFillers(text);
  text = collapseRepeats(text);
  text = applySpokenPunct(text, { allowNewlines });
  text = applySpokenEmoji(text);
  text = applyQuoteMarkers(text);
  text = applyCurrency(text);
  text = stripLeadingFillers(text);
  if (!oneLineBox) {
    text = segmentSentences(text);
  }
  text = capitalise(text);
  // Apply fixed casing after sentence capitalisation so names such as macOS
  // keep their settled spelling even at the start of a dictation.
  text = applyVocab(text);
  text = oneLineBox ? text.replace(/\.\s*$/, "").replace(/\s+$/, "") : terminalPunct(text);
  // Spaces only, not [ \t]: a doubled "tab tab" (#129) is a deliberate
  // double indent, not doubled whitespace to squeeze down to one.
  text = text.replace(/ {2,}/g, " ");

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
  SELF_CORRECTION,
  applySelfCorrection,
  stripFillers,
  collapseRepeats,
  applySpokenPunct,
  applySpokenEmoji,
  applyQuoteMarkers,
  parseNumberWords,
  applyCurrency,
  stripLeadingFillers,
  segmentSentences,
  applyVocab,
  capitalise,
  terminalPunct,
};
