const test = require("node:test");
const assert = require("node:assert/strict");
const { createMediaPause } = require("./mediaPause");

function fake(overrides = {}) {
  const calls = [];
  const diagnostics = [];
  const mediaPause = createMediaPause({
    runAppleScript: async (script) => {
      calls.push(script);
      if (typeof overrides.reply === "function") return overrides.reply(script, calls.length);
      return overrides.reply ?? "";
    },
    onDiagnostic: (name, value) => diagnostics.push([name, value]),
  });
  return { mediaPause, calls, diagnostics };
}

test("pauses nothing when no controllable app is playing", async () => {
  const { mediaPause, calls, diagnostics } = fake({ reply: "" });
  await mediaPause.pauseForRecording();
  assert.equal(calls.length, 1);
  await mediaPause.resumeAfterRecording();
  // No resume script runs when nothing was paused.
  assert.equal(calls.length, 1);
  assert.deepEqual(diagnostics, []);
});

test("pauses the playing apps and resumes exactly those", async () => {
  const { mediaPause, calls, diagnostics } = fake({ reply: "Music, Spotify" });
  await mediaPause.pauseForRecording();
  await mediaPause.resumeAfterRecording();

  assert.equal(calls.length, 2);
  assert.match(calls[1], /application "Music" to play/);
  assert.match(calls[1], /application "Spotify" to play/);
  assert.deepEqual(diagnostics, [
    ["mediaPause.paused", "Music,Spotify"],
    ["mediaPause.resumed", "Music,Spotify"],
  ]);
});

test("ignores unknown names in the AppleScript output", async () => {
  const { mediaPause, calls } = fake({ reply: "Music, VLC, " });
  await mediaPause.pauseForRecording();
  await mediaPause.resumeAfterRecording();
  assert.match(calls[1], /application "Music" to play/);
  assert.doesNotMatch(calls[1], /VLC/);
});

test("a second pause while one is already held is a no-op", async () => {
  const { mediaPause, calls } = fake({ reply: "Music" });
  await mediaPause.pauseForRecording();
  await mediaPause.pauseForRecording();
  assert.equal(calls.length, 1);
});

test("an osascript failure is swallowed, not thrown", async () => {
  const { mediaPause, diagnostics } = fake({
    reply: () => {
      throw new Error("osascript: not authorised");
    },
  });
  await assert.doesNotReject(mediaPause.pauseForRecording());
  assert.deepEqual(diagnostics, [["mediaPause.error", "osascript: not authorised"]]);
});

test("resume after a failed pause does nothing", async () => {
  const { mediaPause, calls } = fake({
    reply: () => {
      throw new Error("nope");
    },
  });
  await mediaPause.pauseForRecording();
  await mediaPause.resumeAfterRecording();
  assert.equal(calls.length, 1);
});
