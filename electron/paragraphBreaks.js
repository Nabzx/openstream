const STRICT_REPLY = /^\s*(?:none|no breaks?)\s*[.!]?\s*$|^\s*\d+(?:\s*,\s*\d+)*\s*[.]?\s*$/i;

function splitSentences(text) {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function repairBreakIndices(reply, sentenceCount) {
  const raw = typeof reply === "string" ? reply.trim() : "";
  const formatValid = STRICT_REPLY.test(raw);
  const found = [...raw.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const indices = [...new Set(found.filter((index) => index > 1 && index <= sentenceCount))].sort((a, b) => a - b);
  const repairUsed = found.length > 0 && (
    indices.length !== found.length || indices.some((index, position) => index !== found[position])
  );

  return { indices, formatValid, repairUsed };
}

function applyParagraphBreaks(sentences, breakBeforeSentenceIndices) {
  const breaks = new Set(breakBeforeSentenceIndices);
  return sentences
    .map((sentence, index) => `${index > 0 && breaks.has(index + 1) ? "\n\n" : index > 0 ? " " : ""}${sentence}`)
    .join("");
}

module.exports = { splitSentences, repairBreakIndices, applyParagraphBreaks };
