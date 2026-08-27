const test = require("node:test");
const assert = require("node:assert/strict");
const { createBreakPlacementHttpAdapter } = require("./breakPlacementHttpAdapter");

test("posts numbered sentences to the local break-placement contract", async () => {
  const calls = [];
  const adapter = createBreakPlacementHttpAdapter({
    chatCompletionsUrl: () => "http://127.0.0.1:8179/v1/chat/completions",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "  3, 7  " } }] }),
      };
    },
  });

  const result = await adapter.placeParagraphBreaks(["First.", "Second.", "Third."]);

  assert.equal(result, "3, 7");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8179/v1/chat/completions");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    messages: [
      {
        role: "system",
        content: [
          "You place paragraph breaks in dictated text. You are given numbered sentences. Reply with the numbers of the sentences that should START a new paragraph, as a comma-separated list. Examples of the reply format: `2, 5, 9` or `4` or `3, 6` or `none`",
          "Rules:",
          "- Break where the topic shifts, not to make paragraphs even.",
          "- Never output sentence 1. Never output a number that was not given.",
          "- If the text should stay as one paragraph, reply: none",
          "- Reply with ONLY numbers or the word none. No text, no explanation.",
        ].join("\n"),
      },
      { role: "user", content: "1. First.\n2. Second.\n3. Third." },
    ],
    max_tokens: 32,
    temperature: 0,
    stream: false,
  });
});

test("fails clearly when the rewrite model server rejects break placement", async () => {
  const adapter = createBreakPlacementHttpAdapter({
    chatCompletionsUrl: () => "http://127.0.0.1:8179/v1/chat/completions",
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });

  await assert.rejects(
    () => adapter.placeParagraphBreaks(["One."]),
    /rewrite model server returned 503/
  );
});

test("bounds a break-placement request by the dictation latency headroom", async () => {
  const adapter = createBreakPlacementHttpAdapter({
    chatCompletionsUrl: () => "http://127.0.0.1:8179/v1/chat/completions",
    requestTimeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
    }),
  });

  await assert.rejects(
    () => adapter.placeParagraphBreaks(["One.", "Two.", "Three."]),
    { name: "TimeoutError" }
  );
});

test("rejects a malformed break-placement response", async () => {
  const adapter = createBreakPlacementHttpAdapter({
    chatCompletionsUrl: () => "http://127.0.0.1:8179/v1/chat/completions",
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }),
  });

  await assert.rejects(
    () => adapter.placeParagraphBreaks(["One."]),
    /invalid break-placement reply/
  );
});
