const test = require("node:test");
const assert = require("node:assert/strict");
const { createBreakPlacementHttpAdapter } = require("./breakPlacementHttpAdapter");

test("posts numbered sentences to the local two-line structure contract", async () => {
  const calls = [];
  const adapter = createBreakPlacementHttpAdapter({
    chatCompletionsUrl: () => "http://127.0.0.1:8179/v1/chat/completions",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "BREAKS: 3, 7\nLIST: none" } }] }),
      };
    },
  });

  const result = await adapter.placeParagraphBreaks(["First.", "Second.", "Third."]);

  assert.equal(result, "BREAKS: 3, 7\nLIST: none");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8179/v1/chat/completions");
  assert.equal(calls[0].options.method, "POST");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 48);
  assert.equal(body.messages[1].role, "user");
  assert.equal(body.messages[1].content, "1. First.\n2. Second.\n3. Third.");

  const systemPrompt = body.messages[0].content;
  assert.equal(body.messages[0].role, "system");
  assert.match(systemPrompt, /exactly two lines/);
  assert.match(systemPrompt, /^BREAKS: <numbers of the sentences/m);
  assert.match(systemPrompt, /^LIST: <one range N-M/m);
  // #67: several varied examples, never one - a lone example anchors the
  // first break onto its own digits.
  assert.ok((systemPrompt.match(/^BREAKS: /gm) || []).length >= 3);
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
