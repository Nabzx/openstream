const { spawn } = require("child_process");
const path = require("path");
const { resourcesRoot } = require("./paths");

// Transcription model server: resident for the life of the app, restarted
// if it crashes. See #29 - a per-dictation subprocess would pay the model
// load cost (0.38s) on every dictation, and this is not that.
const HOST = "127.0.0.1";
const PORT = 8178;
const RESTART_DELAY_MS = 1000;

const BIN_PATH = path.join(resourcesRoot(), "bin", "whisper-server");
const MODEL_PATH = path.join(resourcesRoot(), "models", "ggml-base.en.bin");

let child = null;
let stopping = false;

function start() {
  stopping = false;
  child = spawn(BIN_PATH, [
    "--model", MODEL_PATH,
    "--host", HOST,
    "--port", String(PORT),
  ]);

  child.stdout.on("data", (data) => process.stdout.write(`[whisper-server] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[whisper-server] ${data}`));

  child.on("exit", (code) => {
    child = null;
    if (stopping) return;
    console.error(`[whisper-server] exited unexpectedly (code ${code}), restarting in ${RESTART_DELAY_MS}ms`);
    setTimeout(start, RESTART_DELAY_MS);
  });
}

function stop() {
  stopping = true;
  if (child) child.kill();
}

function inferenceUrl() {
  return `http://${HOST}:${PORT}/inference`;
}

module.exports = { start, stop, inferenceUrl };
