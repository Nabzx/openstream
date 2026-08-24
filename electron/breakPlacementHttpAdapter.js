const SYSTEM_PROMPT = [
  "You place paragraph breaks in dictated text. You are given numbered sentences.",
  "Reply with the numbers of the sentences that should START a new paragraph, as a comma-separated list.",
  "Examples of the reply format: `2, 5, 9` or `4` or `3, 6` or `none`.",
  "Break where the topic shifts, not to make paragraphs even.",
  "Never output sentence 1 or a number that was not given.",
  "If the text should stay as one paragraph, reply: none.",
  "Reply with ONLY numbers or the word none. No text, no explanation.",
].join("\n");

function createBreakPlacementHttpAdapter(options) {
  const { chatCompletionsUrl, fetchImpl = fetch } = options;
  if (typeof chatCompletionsUrl !== "function") {
    throw new Error("Break-placement HTTP adapter requires a chatCompletionsUrl function");
  }

  async function placeParagraphBreaks(sentences) {
    const numberedSentences = sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");
    const response = await fetchImpl(chatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
