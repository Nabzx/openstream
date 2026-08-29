const CLEANUP_RULES = [
  "You are the transcription-cleaning model for a local dictation app.",
  "The input is raw speech-recognition output, not a request for general writing help.",
  "Return JSON only with this shape: {\"status\":\"accept\" or \"fallback\",\"text\":\"...\",\"reason\":\"...\"}.",
  "Use accept only when the result preserves the speaker's wording and intended meaning.",
  "When status is fallback, text must be an empty string.",
  "Remove only clear non-lexical fillers, clear false starts, accidental repetitions, and clear self-corrections when the replacement was spoken.",
  "Convert approved spoken punctuation commands when their meaning is clear.",
  "Preserve names, technical identifiers, numbers, negation, questions, emphasis, and every other dictated word.",
  "Never guess a transcription, fix a name from outside knowledge, answer a question, summarize, paraphrase, or invent text.",
  "If the raw transcription does not support a safe cleanup, return fallback.",
  "Do not use markdown, code fences, or an explanation outside the JSON object.",
].join("\n");

const FEW_SHOT = [
  "Example 1:",
  'Raw: "Um, send the staging build, no, send the production build, period."',
  'JSON: {"status":"accept","text":"Send the production build.","reason":""}',
  "Example 2:",
  'Raw: "This is very, very important."',
  'JSON: {"status":"accept","text":"This is very, very important.","reason":""}',
].join("\n");

const COMBINED_RULES = [
  CLEANUP_RULES,
  "Also return a 1-based breakSentences array in the same JSON object.",
  "breakSentences contains only sentence numbers that should start a new paragraph.",
  "The array must be empty when no paragraph break is clearly justified.",
  "Do not put newline characters in text. Break placement is represented only by sentence numbers.",
].join("\n");

const BREAK_RULES = [
  "You choose paragraph breaks for already-cleaned dictated text.",
  "Return JSON only with this shape: {\"breakSentences\":[2,5]}.",
  "The input contains numbered sentences. Return only 1-based sentence numbers that should start a new paragraph.",
  "Never return sentence 1, never return a number that was not given, and return an empty array when the text should remain one paragraph.",
  "Break on topic changes, not to make paragraphs evenly sized.",
  "Do not rewrite, summarize, answer, or add any text.",
].join("\n");

function rawTurn(raw) {
  return `Raw transcription:\n${raw}\n\nReturn the JSON object now.`;
}

export function buildCleanupMessages(raw, { fewShot = false } = {}) {
  return [
    { role: "system", content: fewShot ? `${CLEANUP_RULES}\n${FEW_SHOT}` : CLEANUP_RULES },
    { role: "user", content: rawTurn(raw) },
  ];
}

export function buildCombinedMessages(raw) {
  return [
    { role: "system", content: `${COMBINED_RULES}\n${FEW_SHOT}` },
    { role: "user", content: rawTurn(raw) },
  ];
}

function numberSentences(text) {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");
}

export function buildBreakMessages(text) {
  return [
    { role: "system", content: BREAK_RULES },
    {
      role: "user",
      content: `Cleaned text:\n${numberSentences(text)}\n\nReturn the JSON object now.`,
    },
  ];
}

export const REQUEST_OPTIONS = {
  max_tokens: 512,
  temperature: 0,
  stream: false,
  response_format: { type: "json_object" },
};
