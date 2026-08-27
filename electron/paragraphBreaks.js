const STRICT_REPLY = /^\s*(?:none|no breaks?)\s*[.!]?\s*$|^\s*\d+(?:\s*,\s*\d+)*\s*[.]?\s*$/i;

// #125 extended the break-placement contract to a two-line reply:
//
//   BREAKS: 3, 7
//   LIST: 5-8
//
// Each line independently allows `none`. The two dimensions are parsed and
// repaired separately (see repairBreakIndices / repairListRange) so a botched
// LIST line can never corrupt paragraph breaks and vice versa. Older bare
// "3, 7" replies - the #67 single-purpose contract - are still read whole, so
// the model dropping back to the short form only costs list detection, not
// paragraph breaks.
const BREAKS_LINE = /^[^\S\n]*BREAKS[^\S\n]*:?[^\S\n]*(.*)$/im;
const LIST_LINE = /^[^\S\n]*LIST[^\S\n]*:?[^\S\n]*(.*)$/im;

function splitSentences(text) {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function repairBreakIndices(reply, sentenceCount) {
  const full = typeof reply === "string" ? reply.trim() : "";
  const lineMatch = full.match(BREAKS_LINE);
  // With a BREAKS line, parse only that line so digits from the LIST line
  // cannot leak in as paragraph breaks. With a LIST line but no BREAKS line
  // the model half-followed the contract - treat breaks as absent rather than
  // scavenging the LIST range. Otherwise it is an old bare reply, read whole.
  const raw = lineMatch
    ? lineMatch[1].trim()
    : LIST_LINE.test(full)
      ? ""
      : full;
  const formatValid = STRICT_REPLY.test(raw);
  const noBreaks = /\bnone\b|\bno breaks?\b/i.test(raw);
  const found = noBreaks
    ? []
    : [...raw.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g)].map((match) => Number(match[0]));
  const indices = [...new Set(
    found.filter((index) => Number.isInteger(index) && index > 1 && index <= sentenceCount),
  )].sort((a, b) => a - b);
  const repairUsed = found.length > 0 && (
    indices.length !== found.length || indices.some((index, position) => index !== found[position])
  );

  return { indices, formatValid, repairUsed };
}

// The list dimension of the #125 contract. Fail-closed by design (#90's rule
// for a bad paragraph-break reply, applied here): anything we cannot read as a
// clean sentence range degrades to `range: null`, and the caller renders
// ordinary prose. A wrong list is far more visible than a missed one.
function repairListRange(reply, sentenceCount) {
  const full = typeof reply === "string" ? reply : "";
  const lineMatch = full.match(LIST_LINE);
  if (!lineMatch) {
    // Short-form reply, no list claim made. Nothing to malform.
    return { range: null, formatValid: true, repairUsed: false };
  }

  const segment = lineMatch[1].trim();
  if (segment === "") {
    return { range: null, formatValid: false, repairUsed: false };
  }
  if (/^(?:none|no list)\b/i.test(segment)) {
    return { range: null, formatValid: true, repairUsed: false };
  }

  const rangeMatch = segment.match(/(\d+)\s*(?:-|–|—|to|through|thru)\s*(\d+)/i);
  if (!rangeMatch) {
    return { range: null, formatValid: false, repairUsed: false };
  }

  const first = Number(rangeMatch[1]);
  const second = Number(rangeMatch[2]);
  const rawStart = Math.min(first, second);
  const rawEnd = Math.max(first, second);
  const start = Math.max(1, rawStart);
  const end = Math.min(sentenceCount, rawEnd);
  if (end - start < 1) {
    // Fewer than two items once clamped into range - not a list.
    return { range: null, formatValid: true, repairUsed: false };
  }

  const repairUsed = start !== rawStart || end !== rawEnd;
  return { range: [start, end], formatValid: true, repairUsed };
}

function applyParagraphBreaks(sentences, breakBeforeSentenceIndices) {
  const breaks = new Set(breakBeforeSentenceIndices);
  return sentences
    .map((sentence, index) => `${index > 0 && breaks.has(index + 1) ? "\n\n" : index > 0 ? " " : ""}${sentence}`)
    .join("");
}

// Renders paragraph breaks and - when the model flagged one - a spoken list.
// With no list range this is exactly applyParagraphBreaks. With a range
// [start, end] (1-based, inclusive) those sentences become `- ` bullets - the
// marker #124 settled on - set off by blank lines, and paragraph breaks are
// applied only to the prose on either side. Breaks that fall inside the list
// are dropped: the bullets already separate the items.
function renderStructuredText(sentences, { breakIndices = [], listRange = null } = {}) {
  if (!listRange) {
    return applyParagraphBreaks(sentences, breakIndices);
  }

  const [start, end] = listRange;
  const before = sentences.slice(0, start - 1);
  const items = sentences.slice(start - 1, end);
  const after = sentences.slice(end);

  const blocks = [];
  if (before.length) {
    blocks.push(applyParagraphBreaks(before, breakIndices));
  }
  blocks.push(items.map((sentence) => `- ${sentence}`).join("\n"));
  if (after.length) {
    // Re-base the surviving break indices onto the trailing slice; a break at
    // end + 1 is already covered by the blank line after the list.
    const afterBreaks = breakIndices
      .filter((index) => index > end + 1)
      .map((index) => index - end);
    blocks.push(applyParagraphBreaks(after, afterBreaks));
  }
  return blocks.join("\n\n");
}

module.exports = {
  splitSentences,
  repairBreakIndices,
  repairListRange,
  applyParagraphBreaks,
  renderStructuredText,
};
