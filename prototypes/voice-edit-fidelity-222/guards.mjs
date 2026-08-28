// The deterministic guards from #17's decision comment. They can only
// reject an obviously-broken edit - they cannot judge faithfulness, which
// is what the human review page is for. Returns { ok, reason, cleaned }.

const CHATTER_PREFIXES = [
  /^here('?s| is)\b/i,
  /^sure[,!.]/i,
  /^(the )?(edited|revised|updated|corrected|shortened) (text|version)\b/i,
  /^okay[,!.]/i,
  /^certainly[,!.]/i,
];

function stripWrappers(text) {
  let t = text.trim();
  // one layer of code fence
  const fence = t.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (fence) t = fence[1].trim();
  // matching surrounding quotes
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  return t;
}

export function applyGuards(rawOutput, selection) {
  const cleaned = stripWrappers(rawOutput);

  if (cleaned.length === 0) {
    return { ok: false, reason: "empty", cleaned };
  }
  if (cleaned.length > selection.length * 3 + 40) {
    return { ok: false, reason: "far longer than the selection", cleaned };
  }
  for (const pattern of CHATTER_PREFIXES) {
    if (pattern.test(cleaned)) {
      return { ok: false, reason: "starts with model chatter", cleaned };
    }
  }
  return { ok: true, reason: null, cleaned };
}
