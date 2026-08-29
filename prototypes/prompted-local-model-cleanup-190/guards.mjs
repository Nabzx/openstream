function parseObject(reply) {
  try {
    const parsed = JSON.parse(reply);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseCleanupReply(reply) {
  const object = parseObject(reply);
  if (!object || !["accept", "fallback"].includes(object.status)) {
    return { ok: false, status: "fallback", text: "", reason: "malformed cleanup JSON" };
  }

  if (object.status === "fallback") {
    return { ok: true, status: "fallback", text: "", reason: String(object.reason || "model fallback") };
  }

  if (typeof object.text !== "string" || !object.text.trim()) {
    return { ok: false, status: "fallback", text: "", reason: "accepted reply has no text" };
  }

  return { ok: true, status: "accept", text: object.text, reason: String(object.reason || "") };
}

export function parseCombinedReply(reply) {
  const object = parseObject(reply);
  const cleanup = parseCleanupReply(reply);
  if (!cleanup.ok) return { ...cleanup, breakSentences: [] };

  if (!Array.isArray(object.breakSentences) || !object.breakSentences.every(Number.isInteger)) {
    return { ok: false, status: "fallback", text: "", reason: "missing or malformed breakSentences", breakSentences: [] };
  }

  return { ...cleanup, breakSentences: object.breakSentences };
}

export function parseBreakReply(reply, sentenceCount) {
  const object = parseObject(reply);
  if (!object || !Array.isArray(object.breakSentences)) {
    return { ok: false, breakSentences: [], reason: "malformed break JSON" };
  }

  const breaks = object.breakSentences;
  const valid = breaks.every(
    (value) => Number.isInteger(value) && value >= 2 && value <= sentenceCount,
  );
  const unique = new Set(breaks).size === breaks.length;
  const sorted = breaks.every((value, index) => index === 0 || breaks[index - 1] < value);
  if (!valid || !unique || !sorted) {
    return { ok: false, breakSentences: [], reason: "invalid break sentence numbers" };
  }

  return { ok: true, breakSentences: breaks, reason: "" };
}

export function normalize(text) {
  return text
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function tokens(text) {
  return text.toLowerCase().match(/[a-z0-9]+(?:['’][a-z0-9]+)*/g) || [];
}

function countsFor(text) {
  const counts = new Map();
  for (const token of tokens(text)) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

export function outputUsesOnlyRawWords(raw, output) {
  const available = countsFor(raw);
  for (const [token, count] of countsFor(output)) {
    if (count > (available.get(token) || 0)) return false;
  }
  return true;
}

export function referenceCanBeRecoveredFromRaw(raw, reference) {
  const available = countsFor(raw);
  for (const [token, count] of countsFor(reference)) {
    if (count > (available.get(token) || 0)) return false;
  }
  return true;
}

export function sentenceCount(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean).length;
}

export function scoreText({ raw, expected, rulesOutput, candidate }) {
  return {
    exactMatch: normalize(candidate) === normalize(expected),
    rulesExactMatch: normalize(rulesOutput) === normalize(expected),
    outputUsesOnlyRawWords: outputUsesOnlyRawWords(raw, candidate),
    referenceCanBeRecoveredFromRaw: referenceCanBeRecoveredFromRaw(raw, expected),
  };
}
