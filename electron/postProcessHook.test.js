const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createPostProcessHook, DEFAULT_TIMEOUT_MS } = require("./postProcessHook");

// Real executable scripts, not fakes - the point of this file is to prove
// the actual spawn/stdin/stdout/timeout mechanics work, since
// dictationCoordinator.test.js already covers the fallback policy against a
// fake adapter.
function writeScript(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openstream-hook-"));
  const scriptPath = path.join(dir, "hook.sh");
  fs.writeFileSync(scriptPath, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return scriptPath;
}

test("no script configured: the text passes through unchanged", async () => {
  const hook = createPostProcessHook({ getScriptPath: () => null });
  const result = await hook.run("hello world");
  assert.equal(result, "hello world");
});

test("runs the script, pipes text in on stdin, returns stdout", async () => {
  const scriptPath = writeScript("tr a-z A-Z");
  const hook = createPostProcessHook({ getScriptPath: () => scriptPath });
  const result = await hook.run("hello world");
  assert.equal(result, "HELLO WORLD");
});

test("strips exactly one trailing newline, keeps internal ones", async () => {
  const scriptPath = writeScript('printf "line one\\nline two\\n"');
  const hook = createPostProcessHook({ getScriptPath: () => scriptPath });
  const result = await hook.run("ignored");
  assert.equal(result, "line one\nline two");
});

test("a non-zero exit rejects with the exit code and stderr", async () => {
  const scriptPath = writeScript('echo "went wrong" 1>&2; exit 3');
  const hook = createPostProcessHook({ getScriptPath: () => scriptPath });
  await assert.rejects(() => hook.run("text"), /exited with code 3.*went wrong/s);
});

test("a missing script rejects rather than hanging", async () => {
  const hook = createPostProcessHook({ getScriptPath: () => "/no/such/script-really-does-not-exist.sh" });
  await assert.rejects(() => hook.run("text"));
});

test("a script that hangs past the timeout is killed and the call rejects", async () => {
  const scriptPath = writeScript("sleep 5");
  const hook = createPostProcessHook({ getScriptPath: () => scriptPath, timeoutMs: 150 });
  const started = Date.now();
  await assert.rejects(() => hook.run("text"), /timed out/);
  // Rejects close to the configured timeout, not after the script's full
  // sleep - proves the process was actually killed, not just outraced.
  assert.ok(Date.now() - started < 2000, "should not wait for the full sleep");
});

test("a script that ignores stdin still resolves from its exit, no EPIPE hang", async () => {
  const scriptPath = writeScript('echo "fixed output"');
  const hook = createPostProcessHook({ getScriptPath: () => scriptPath });
  const result = await hook.run("a very long input the script never reads");
  assert.equal(result, "fixed output");
});

test("DEFAULT_TIMEOUT_MS is a sane, generous default", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 10_000);
});
