const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const rewriteModelServer = require("./rewriteModelServer");

const RESOURCES_ROOT = path.join(__dirname, "..", "resources");
const LLAMA_DIR = path.join(RESOURCES_ROOT, "bin", "llama");
const BIN_PATH = path.join(LLAMA_DIR, "llama-server");
const MODEL_PATH = path.join(RESOURCES_ROOT, "models", "smollm2-1.7b-instruct-q4_k_m.gguf");
const INTEGRATION_TEST_PORT = 18179;
const hasRewriteModelBinary = process.platform === "darwin" && fs.existsSync(BIN_PATH);
const hasRewriteModelAssets = hasRewriteModelBinary && fs.existsSync(MODEL_PATH);
const binarySkipReason = hasRewriteModelBinary
  ? undefined
  : "rewrite model server binary is missing - run `npm run build:llama`";
const assetSkipReason = hasRewriteModelAssets
  ? undefined
  : "rewrite model server artifacts are missing - run `npm run build:llama`";

test("bundled rewrite model server launches without an unavailable macOS RDMA dependency", {
  skip: binarySkipReason,
}, () => {
  assert.doesNotThrow(() =>
    execFileSync(BIN_PATH, ["--help"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
});

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
  assert.equal(supervisorOptions.command, "/tmp/openstream-resources/bin/llama/llama-server");
  assert.deepEqual(supervisorOptions.args, [
    "--model", "/tmp/openstream-resources/models/smollm2-1.7b-instruct-q4_k_m.gguf",
    "--host", "127.0.0.1",
    "--port", "8179",
    "--ctx-size", "2048",
  ]);
  assert.equal(server.chatCompletionsUrl(), "http://127.0.0.1:8179/v1/chat/completions");
  assert.deepEqual(events, ["start", "stop"]);
});

async function waitUntilReady(healthUrl, deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("rewrite model server did not become ready in time");
}

// Confirms the #14 round trip for real: starts the fetched rewrite model server
// against the fetched model, and gets an actual completion back over HTTP.
// Skipped when `npm run build:llama` hasn't fetched the assets (e.g. a
// clean checkout that hasn't run postinstall).
test(
  "rewrite model server starts and answers a chat completion over HTTP",
  { skip: assetSkipReason },
  async () => {
    const server = rewriteModelServer.createRewriteModelServer({ port: INTEGRATION_TEST_PORT });
    server.start();
    try {
      await waitUntilReady(server.healthUrl(), Date.now() + 60_000);

      const res = await fetch(server.chatCompletionsUrl(), {
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
      server.stop();
    }
  }
);
