// The break-placement contract, unchanged from #67: numbered sentences in,
// sentence numbers out, never rewritten text (#45, #90). SEVERAL varied
// examples, not one - #67 found a single worked example anchors the first
// break onto its own first digit.
//
// #125 tried to widen this to a second labelled line for list boundaries
// (BREAKS: / LIST:). The spike (spike/list-boundaries-125/) measured that on
// SmolLM2-1.7B and it regressed break placement badly - the model emitted
// `BREAKS: 1` on every sample, which #67's wording reliably suppressed - and
// over-triggered lists on 5 of 6 non-lists. So the live prompt stays
// break-only; the parser and renderer for the two-line reply are kept,
// unit-tested and dormant, in paragraphBreaks.js, behind the coordinator's
// listDetection flag. Turn it back on once a prompt that holds both
// instructions exists.
const SYSTEM_PROMPT = [
  "You place paragraph breaks in dictated text. You are given numbered sentences. Reply with the numbers of the sentences that should START a new paragraph, as a comma-separated list. Examples of the reply format: `2, 5, 9` or `4` or `3, 6` or `none`",
  "Rules:",
  "- Break where the topic shifts, not to make paragraphs even.",
  "- Never output sentence 1. Never output a number that was not given.",
  "- If the text should stay as one paragraph, reply: none",
  "- Reply with ONLY numbers or the word none. No text, no explanation.",
].join("\n");

function createBreakPlacementHttpAdapter(options) {
  const { chatCompletionsUrl, fetchImpl = fetch, requestTimeoutMs = 300 } = options;
  if (typeof chatCompletionsUrl !== "function") {
    throw new Error("Break-placement HTTP adapter requires a chatCompletionsUrl function");
  }

  async function placeParagraphBreaks(sentences) {
    const numberedSentences = sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");
    const response = await fetchImpl(chatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(requestTimeoutMs),
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: numberedSentences },
        ],
        max_tokens: 32,
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) throw new Error(`rewrite model server returned ${response.status}`);

    const body = await response.json();
    const reply = body?.choices?.[0]?.message?.content;
    if (typeof reply !== "string") {
      throw new Error("rewrite model server returned an invalid break-placement reply");
    }
    return reply.trim();
  }

  return { placeParagraphBreaks };
}

module.exports = { createBreakPlacementHttpAdapter };
