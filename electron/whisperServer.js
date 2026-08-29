const path = require("path");
const { resourcesRoot } = require("./paths");
const { resolveModelPath } = require("./modelStore");
const { createModelSupervisor } = require("./modelSupervisor");

// Transcription model server: resident for the life of the app, supervised
// by role name so the app vocabulary does not depend on the current model.
const HOST = "127.0.0.1";
const PORT = 8178;

const BIN_PATH = path.join(resourcesRoot(), "bin", "whisper-server");

let supervisor = null;

// The weight path is resolved at start(), not at module load: a packaged
// app downloads it to userData on first run (#249), so it may not exist
// when this module is first required.
function start() {
  if (!supervisor) {
    supervisor = createModelSupervisor({
      roleName: "transcription model server",
      command: BIN_PATH,
      args: ["--model", resolveModelPath("ggml-base.en.bin"), "--host", HOST, "--port", String(PORT)],
    });
  }
  supervisor.start();
}

function stop() {
  supervisor?.stop();
}

function inferenceUrl() {
  return `http://${HOST}:${PORT}/inference`;
}

function healthUrl() {
  return `http://${HOST}:${PORT}/`;
}

module.exports = { start, stop, inferenceUrl, healthUrl };
