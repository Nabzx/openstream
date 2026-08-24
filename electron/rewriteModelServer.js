const path = require("path");
const { resourcesRoot } = require("./paths");
const { createModelSupervisor } = require("./modelSupervisor");

const HOST = "127.0.0.1";
const PORT = 8179;
const CONTEXT_SIZE = 2048;

function createRewriteModelServer(options = {}) {
  const {
    root = resourcesRoot(),
    createSupervisor = createModelSupervisor,
  } = options;
  const binaryPath = path.join(root, "bin", "llama-server");
  const modelPath = path.join(root, "models", "SmolLM2-1.7B-Instruct-Q4_K_M.gguf");
  const supervisor = createSupervisor({
    roleName: "rewrite model server",
    command: binaryPath,
    args: [
      "--model", modelPath,
      "--host", HOST,
      "--port", String(PORT),
      "--ctx-size", String(CONTEXT_SIZE),
    ],
  });

  return {
    start: () => supervisor.start(),
    stop: () => supervisor.stop(),
    healthUrl: () => `http://${HOST}:${PORT}/health`,
    chatCompletionsUrl: () => `http://${HOST}:${PORT}/v1/chat/completions`,
  };
}

const server = createRewriteModelServer();

module.exports = { ...server, createRewriteModelServer, CONTEXT_SIZE };
