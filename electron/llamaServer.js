const { spawn } = require("child_process");
const path = require("path");
const { resourcesRoot } = require("./paths");

// Plumbing only (#14): fetches and can start llama-server, but nothing
// calls start() yet. #17 (voice-driven editing) is the feature that
// consumes this - wiring it into app startup before that exists would
// hold ~1GB resident for no consumer. See whisperServer.js for the
// resident-subprocess shape this will take once #17 lands.
const HOST = "127.0.0.1";
const PORT = 8179;
const RESTART_DELAY_MS = 1000;

const BIN_PATH = path.join(resourcesRoot(), "bin", "llama", "llama-server");
const MODEL_PATH = path.join(resourcesRoot(), "models", "smollm2-1.7b-instruct-q4_k_m.gguf");

let child = null;
let stopping = false;

function start() {
  stopping = false;
  child = spawn(BIN_PATH, [
    "--model", MODEL_PATH,
    "--host", HOST,
    "--port", String(PORT),
  ]);

  child.stdout.on("data", (data) => process.stdout.write(`[llama-server] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[llama-server] ${data}`));

  child.on("exit", (code) => {
    child = null;
    if (stopping) return;
    console.error(`[llama-server] exited unexpectedly (code ${code}), restarting in ${RESTART_DELAY_MS}ms`);
    setTimeout(start, RESTART_DELAY_MS);
  });
}

function stop() {
  stopping = true;
  if (child) child.kill();
}

function healthUrl() {
  return `http://${HOST}:${PORT}/health`;
}

function chatCompletionsUrl() {
  return `http://${HOST}:${PORT}/v1/chat/completions`;
}

module.exports = { start, stop, healthUrl, chatCompletionsUrl };
