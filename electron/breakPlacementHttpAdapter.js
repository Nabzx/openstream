function createBreakPlacementHttpAdapter(options) {
  const { chatCompletionsUrl, fetchImpl = fetch } = options;
  if (typeof chatCompletionsUrl !== "function") {
    throw new Error("Break-placement HTTP adapter requires a chatCompletionsUrl function");
  }

  async function requestBreakIndices({ systemPrompt, numberedSentences }) {
    const res = await fetchImpl(chatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: numberedSentences },
        ],
        max_tokens: 32,
        temperature: 0,
        stream: false,
      }),
    });

    if (!res.ok) throw new Error(`rewrite model server returned ${res.status}`);

    const body = await res.json();
    const reply = body?.choices?.[0]?.message?.content;
    if (typeof reply !== "string") {
      throw new Error("rewrite model server returned an invalid break-placement reply");
    }
    return { reply: reply.trim() };
  }

  return { requestBreakIndices };
}

module.exports = { createBreakPlacementHttpAdapter };
