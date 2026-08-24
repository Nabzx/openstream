export type CleanupOptions = {
  breakSafe: boolean;
  oneLine: boolean;
};

export type CleanupResult = {
  text: string;
  sentences: string[];
  hasExplicitBreakCommand: boolean;
};

const FILLERS = new Set(["um", "uh", "erm", "ah", "hmm"]);

const VOCABULARY_FIXES: Array<[RegExp, string]> = [
  [/\bmac\s+os\b/gi, "macOS"],
  [/\bgithub\b/gi, "GitHub"],
  [/\bjava\s*script\b/gi, "JavaScript"],
  [/\btype\s*script\b/gi, "TypeScript"],
  [/\bopen\s*stream\b/gi, "OpenStream"],
];

export function cleanupDictation(raw: string, options: CleanupOptions): CleanupResult {
  let text = raw.replace(/\r\n?/g, "\n");
  text = removeServerHardWraps(text);
  text = normalizeWhitespace(text);
  text = removeFillers(text);
  text = collapseRepeatedWords(text);

  const punctuation = applySpokenPunctuation(text, options.breakSafe && !options.oneLine);
  text = punctuation.text;

  text = normalizePunctuationSpacing(text);
  text = applyVocabularyFixes(text);
  text = capitalizeText(text);
  text = options.oneLine ? forceOneLine(text) : text;
  text = options.oneLine ? trimTerminalFullStopForOneLine(text) : ensureTerminalPunctuation(text);
  text = normalizeParagraphWhitespace(text);

  return {
    text,
    sentences: splitSentences(text),
    hasExplicitBreakCommand: punctuation.hasExplicitBreakCommand,
  };
}

function removeServerHardWraps(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " "))
    .join("\n\n");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/[\t ]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

function removeFillers(text: string): string {
  return text
    .split(/(\s+)/)
    .filter((part) => !FILLERS.has(part.toLowerCase().replace(/^\W+|\W+$/g, "")))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function collapseRepeatedWords(text: string): string {
  const tokens = text.split(/(\s+)/);
  const out: string[] = [];
  let previousWord = "";

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (out.length > 0 && !/^\s+$/.test(out[out.length - 1])) out.push(token);
      continue;
    }

    const word = token.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/gi, "");
    if (word && word === previousWord) {
      if (out.length > 0 && /^\s+$/.test(out[out.length - 1])) out.pop();
      continue;
    }
    out.push(token);
    if (word) previousWord = word;
  }

  return out.join("").replace(/\s{2,}/g, " ").trim();
}

function applySpokenPunctuation(text: string, allowBreaks: boolean): { text: string; hasExplicitBreakCommand: boolean } {
  let hasExplicitBreakCommand = false;
  const replacements: Array<[RegExp, string]> = [
    [/\b(question mark)\b/gi, "?"],
    [/\b(exclamation point|exclamation mark)\b/gi, "!"],
    [/\b(full stop|period)\b/gi, "."],
    [/\bcomma\b/gi, ","],
    [/\bcolon\b/gi, ":"],
    [/\bsemicolon\b/gi, ";"],
    [/\bdash\b/gi, " — "],
    [/\bopen paren\b/gi, "("],
    [/\bclose paren\b/gi, ")"],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/\bnew paragraph\b/gi, () => {
    hasExplicitBreakCommand = true;
    return allowBreaks ? "\n\n" : " ";
  });
  text = text.replace(/\bnew line\b/gi, () => {
    hasExplicitBreakCommand = true;
    return allowBreaks ? "\n" : " ";
  });

  return { text, hasExplicitBreakCommand };
}

function normalizePunctuationSpacing(text: string): string {
  return text
    .replace(/[ \t]+([,.;:?!])/g, "$1")
    .replace(/([,;:])([^\s\n])/g, "$1 $2")
    .replace(/([?!\.])([^\s\n])/g, "$1 $2")
    .replace(/\([ \t]+/g, "(")
    .replace(/[ \t]+\)/g, ")")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function applyVocabularyFixes(text: string): string {
  for (const [pattern, replacement] of VOCABULARY_FIXES) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function capitalizeText(text: string): string {
  let nextLetterStartsSentence = true;
  return text.replace(/[A-Za-z']+/g, (word, offset, whole) => {
    const startsSentence = nextLetterStartsSentence;
    nextLetterStartsSentence = /^\s*([.!?]|\n\n)/.test(whole.slice(offset + word.length));

    if (word.toLowerCase() === "i") return "I";
    if (startsSentence) return word[0].toUpperCase() + word.slice(1);
    return word;
  });
}

function forceOneLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

function trimTerminalFullStopForOneLine(text: string): string {
  return text.replace(/\.$/, "");
}

function ensureTerminalPunctuation(text: string): string {
  if (!text || /[.!?…]$/.test(text) || /[.!?…][”")\]]$/.test(text)) return text;
  return `${text}.`;
}

function normalizeParagraphWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
