// #125 widened this contract from #67's single question (paragraph breaks) to
// two, answered on two labelled lines. The model still returns positions only,
// never rewritten text (#45, #90). SEVERAL varied examples, not one: #67 found
// a single worked example anchors the first break onto its own first digit;
// varied examples stay neutral for SmolLM2 and stop Qwen3 breaking at every
// sentence.
const SYSTEM_PROMPT = [
  "You structure dictated text. You are given numbered sentences. Reply with exactly two lines and nothing else:",
  "BREAKS: <numbers of the sentences that should START a new paragraph, comma-separated, or: none>",
  "LIST: <one range N-M if sentences N to M are a spoken list of items, or: none>",
  "Rules:",
  "- BREAKS: break where the topic shifts, not to make paragraphs even. Never output sentence 1. Never output a number that was not given.",
  "- LIST: only when the speaker is plainly enumerating items - things to buy, steps to follow, options to weigh. Sentences that merely open with \"first\" or \"second\" as a turn of phrase are not a list.",
  "- When unsure, answer none. Never invent structure that was not spoken.",
  "- Reply with ONLY the two lines. No prose, no explanation.",
  "Examples of the reply format:",
  "BREAKS: 2, 5",
  "LIST: none",
  "-",
  "BREAKS: none",
  "LIST: 3-6",
  "-",
  "BREAKS: 4",
  "LIST: 7-10",
  "-",
  "BREAKS: none",
  "LIST: none",
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
        // Two short labelled lines - a handful of tokens either way. #67
        // measured the break line alone at a median of 8 output tokens.
        max_tokens: 48,
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
