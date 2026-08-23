const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const llamaServer = require("./llamaServer");

const BIN_PATH = path.join(__dirname, "..", "resources", "bin", "llama", "llama-server");
const MODEL_PATH = path.join(__dirname, "..", "resources", "models", "smollm2-1.7b-instruct-q4_k_m.gguf");
const hasFetchedAssets = fs.existsSync(BIN_PATH) && fs.existsSync(MODEL_PATH);

async function waitUntilReady(deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(llamaServer.healthUrl());
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("llama-server did not become ready in time");
}

// Confirms the #14 round trip for real: starts the fetched llama-server
// against the fetched model, and gets an actual completion back over HTTP.
// Skipped when `npm run build:llama` hasn't fetched the assets (e.g. a
// clean checkout that hasn't run postinstall).
test(
  "llama-server starts and answers a chat completion over HTTP",
  { skip: !hasFetchedAssets && "resources/bin/llama or the GGUF model is missing - run `npm run build:llama`" },
  async () => {
    llamaServer.start();
    try {
      await waitUntilReady(Date.now() + 60_000);

      const res = await fetch(llamaServer.chatCompletionsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Reply with the single word: banana" }],
          max_tokens: 16,
          temperature: 0,
        }),
      });
      assert.equal(res.status, 200);

      const body = await res.json();
      const content = body.choices[0].message.content;
      assert.match(content, /banana/i);
    } finally {
      llamaServer.stop();
    }
  }
);
