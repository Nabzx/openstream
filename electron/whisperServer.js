const path = require("path");
const { resourcesRoot } = require("./paths");
const { createModelSupervisor } = require("./modelSupervisor");

// Transcription model server: resident for the life of the app, supervised
// by role name so the app vocabulary does not depend on the current model.
const HOST = "127.0.0.1";
const PORT = 8178;

const BIN_PATH = path.join(resourcesRoot(), "bin", "whisper-server");
const MODEL_PATH = path.join(resourcesRoot(), "models", "ggml-base.en.bin");

const supervisor = createModelSupervisor({
  roleName: "transcription model server",
  command: BIN_PATH,
  args: ["--model", MODEL_PATH, "--host", HOST, "--port", String(PORT)],
});

function start() {
  supervisor.start();
}

function stop() {
  supervisor.stop();
}

function inferenceUrl() {
  return `http://${HOST}:${PORT}/inference`;
}

function healthUrl() {
  return `http://${HOST}:${PORT}/`;
}

module.exports = { start, stop, inferenceUrl, healthUrl };
