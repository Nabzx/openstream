export type BreakRepair = {
  indices: number[];
  dropped: number[];
  formatValid: boolean;
};

export function repairBreakIndices(reply: unknown, sentenceCount: number): BreakRepair {
  const parsed = parseReply(reply);
  const seen = new Set<number>();
  const indices: number[] = [];
  const dropped: number[] = [];

  for (const index of parsed.indices) {
    if (!Number.isInteger(index) || index <= 1 || index > sentenceCount || seen.has(index)) {
      dropped.push(index);
      continue;
    }
    seen.add(index);
    indices.push(index);
  }

  indices.sort((a, b) => a - b);
  return { indices, dropped, formatValid: parsed.formatValid };
}

export function applyParagraphBreaks(sentences: string[], breakBeforeSentenceIndices: number[]): string {
  const breaks = new Set(breakBeforeSentenceIndices);
  return sentences.reduce((text, sentence, zeroBasedIndex) => {
    const sentenceIndex = zeroBasedIndex + 1;
    if (zeroBasedIndex === 0) return sentence;
    return `${text}${breaks.has(sentenceIndex) ? "\n\n" : " "}${sentence}`;
  }, "");
}

function parseReply(reply: unknown): { indices: number[]; formatValid: boolean } {
  if (Array.isArray(reply)) return { indices: reply.map(Number), formatValid: reply.every(Number.isInteger) };

  if (typeof reply === "string") {
    try {
      const json = JSON.parse(reply) as unknown;
      return parseReply(json);
    } catch {
      const matches = reply.match(/-?\d+/g) ?? [];
      return { indices: matches.map(Number), formatValid: false };
    }
  }

  if (reply && typeof reply === "object") {
    const value =
      (reply as { breakBeforeSentenceNumbers?: unknown }).breakBeforeSentenceNumbers ??
      (reply as { breakBefore?: unknown }).breakBefore ??
      (reply as { breaks?: unknown }).breaks ??
      (reply as { indices?: unknown }).indices;
    if (Array.isArray(value)) return { indices: value.map(Number), formatValid: value.every(Number.isInteger) };
  }

  return { indices: [], formatValid: false };
}
