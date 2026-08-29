const path = require("path");
const { resourcesRoot } = require("./paths");
const { resolveModelPath } = require("./modelStore");
const { createModelSupervisor } = require("./modelSupervisor");

const HOST = "127.0.0.1";
const PORT = 8179;
const CONTEXT_SIZE = 2048;
const MODEL_FILE = "smollm2-1.7b-instruct-q4_k_m.gguf";

function createRewriteModelServer(options = {}) {
  const {
    root = resourcesRoot(),
    createSupervisor = createModelSupervisor,
    port = PORT,
  } = options;
  // llama-server links its dylibs with an @loader_path rpath (see
  // fetch-llama.sh), so it has to run from inside the directory it was
  // extracted into, not just anywhere on disk.
  const binaryPath = path.join(root, "bin", "llama", "llama-server");

  let supervisor = null;

  // The weight path is resolved at start(): a packaged app downloads it to
  // userData on first run (#249), so it may not be in place at module load.
  function ensureSupervisor() {
    if (supervisor) return supervisor;
    supervisor = createSupervisor({
      roleName: "rewrite model server",
      command: binaryPath,
      args: [
        "--model", resolveModelPath(MODEL_FILE, { bundledDir: path.join(root, "models") }),
        "--host", HOST,
        "--port", String(port),
        "--ctx-size", String(CONTEXT_SIZE),
      ],
    });
    return supervisor;
  }

  return {
    start: () => ensureSupervisor().start(),
    stop: () => supervisor?.stop(),
    healthUrl: () => `http://${HOST}:${port}/health`,
    chatCompletionsUrl: () => `http://${HOST}:${port}/v1/chat/completions`,
  };
}

const server = createRewriteModelServer();

module.exports = { ...server, createRewriteModelServer };
