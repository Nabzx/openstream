const { spawn } = require("child_process");

// #259: an optional, user-supplied script the cleaned, finished text is
// piped through (stdin) right before delivery - a shell hook rather than a
// second LLM path, since a script can call out to anything (a local LLM
// CLI included) and needs no new process-execution surface of its own.
//
// This module only knows how to run one script and enforce a timeout - it
// never decides what a failure means for the dictation. That policy
// ("fall back to the un-hooked text, never block delivery") lives in
// dictationCoordinator.js, which is what actually gets unit-tested against
// a fake; this file is what gets tested against real child processes.
const DEFAULT_TIMEOUT_MS = 10_000;

function createPostProcessHook({ getScriptPath, timeoutMs = DEFAULT_TIMEOUT_MS, spawnFn = spawn }) {
  async function run(text) {
    const scriptPath = getScriptPath();
    if (!scriptPath) return text;
    return runScript(spawnFn, scriptPath, text, timeoutMs);
  }

  return { run };
}

function runScript(spawnFn, scriptPath, text, timeoutMs) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(scriptPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`post-process hook timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    // A script that isn't executable, or doesn't exist, fires this rather
    // than "close" - covers the "the script got moved or deleted" case.
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = stderr.trim();
        reject(new Error(`post-process hook exited with code ${code}${detail ? `: ${detail}` : ""}`));
        return;
      }
      // A CLI convention, not part of the dictation - a script that prints
      // with `echo`/`puts`/`print` adds exactly one trailing newline that
      // was never something the user said.
      resolve(stdout.replace(/\n$/, ""));
    });

    child.stdin.on("error", () => {
      // A script that closes stdin early (reads nothing, e.g. `cat /dev/null`)
      // would otherwise throw EPIPE on this write - "close" above still
      // fires and decides the outcome from the exit code.
    });
    child.stdin.write(text);
    child.stdin.end();
  });
}

module.exports = { createPostProcessHook, DEFAULT_TIMEOUT_MS };
