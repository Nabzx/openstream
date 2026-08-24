const path = require("path");
const { resourcesRoot } = require("./paths");
const { createModelSupervisor } = require("./modelSupervisor");

// Rewrite model server: supervised by role name so diagnostics follow the
// architecture role rather than the current executable.
const HOST = "127.0.0.1";
const PORT = 8179;

const BIN_PATH = path.join(resourcesRoot(), "bin", "llama", "llama-server");
const MODEL_PATH = path.join(resourcesRoot(), "models", "smollm2-1.7b-instruct-q4_k_m.gguf");

const supervisor = createModelSupervisor({
  roleName: "rewrite model server",
  command: BIN_PATH,
  args: ["--model", MODEL_PATH, "--host", HOST, "--port", String(PORT)],
});

function start() {
  supervisor.start();
}

function stop() {
  supervisor.stop();
}

function healthUrl() {
  return `http://${HOST}:${PORT}/health`;
}

function chatCompletionsUrl() {
  return `http://${HOST}:${PORT}/v1/chat/completions`;
}

module.exports = { start, stop, healthUrl, chatCompletionsUrl };
