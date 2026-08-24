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

  const result = await adapter.requestBreakIndices({
    systemPrompt: "Return break indices only.",
    numberedSentences: "1. First.\n2. Second.\n3. Third.",
  });

  assert.deepEqual(result, { reply: "3, 7" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8179/v1/chat/completions");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    messages: [
      { role: "system", content: "Return break indices only." },
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
    () => adapter.requestBreakIndices({ systemPrompt: "indices", numberedSentences: "1. One." }),
    /rewrite model server returned 503/
  );
});

test("rejects a malformed break-placement response", async () => {
  const adapter = createBreakPlacementHttpAdapter({
    chatCompletionsUrl: () => "http://127.0.0.1:8179/v1/chat/completions",
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }),
  });

  await assert.rejects(
    () => adapter.requestBreakIndices({ systemPrompt: "indices", numberedSentences: "1. One." }),
    /invalid break-placement reply/
  );
});
