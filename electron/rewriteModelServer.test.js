const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rewriteModelServer = require("./rewriteModelServer");

const BIN_PATH = path.join(__dirname, "..", "resources", "bin", "llama-server");
const MODEL_PATH = path.join(__dirname, "..", "resources", "models", "SmolLM2-1.7B-Instruct-Q4_K_M.gguf");
const hasFetchedAssets = fs.existsSync(BIN_PATH) && fs.existsSync(MODEL_PATH);

test("configures the resident rewrite model server on loopback with a 2048-token context", () => {
  let supervisorOptions;
  const events = [];
  const server = rewriteModelServer.createRewriteModelServer({
    root: "/tmp/openstream-resources",
    createSupervisor: (options) => {
      supervisorOptions = options;
      return {
        start: () => events.push("start"),
        stop: () => events.push("stop"),
      };
    },
  });

  server.start();
  server.stop();

  assert.equal(supervisorOptions.roleName, "rewrite model server");
  assert.equal(supervisorOptions.command, "/tmp/openstream-resources/bin/llama-server");
  assert.deepEqual(supervisorOptions.args, [
    "--model", "/tmp/openstream-resources/models/SmolLM2-1.7B-Instruct-Q4_K_M.gguf",
    "--host", "127.0.0.1",
    "--port", "8179",
    "--ctx-size", "2048",
  ]);
  assert.equal(server.chatCompletionsUrl(), "http://127.0.0.1:8179/v1/chat/completions");
  assert.deepEqual(events, ["start", "stop"]);
});

async function waitUntilReady(deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(rewriteModelServer.healthUrl());
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
  "rewrite model server starts and answers a chat completion over HTTP",
  { skip: !hasFetchedAssets && "rewrite model server artifacts are missing - run `npm run prepare:model-artifacts`" },
  async () => {
    rewriteModelServer.start();
    try {
      await waitUntilReady(Date.now() + 60_000);

      const res = await fetch(rewriteModelServer.chatCompletionsUrl(), {
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
      rewriteModelServer.stop();
    }
  }
);
