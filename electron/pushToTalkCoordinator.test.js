const test = require("node:test");
const assert = require("node:assert/strict");
const { createPushToTalkCoordinator } = require("./pushToTalkCoordinator");

test("key down starts capture and exposes recording state until key up", () => {
  const captureCommands = [];
  const states = [];
  const coordinator = createPushToTalkCoordinator({
    startCapture: () => captureCommands.push({ command: "start" }),
    stopCapture: (timing) => captureCommands.push({ command: "stop", timing }),
    setUserVisibleState: (state) => states.push(state),
    now: () => 725.5,
  });

  coordinator.keyDown();
  coordinator.keyUp();

  assert.deepEqual(captureCommands, [
    { command: "start" },
    { command: "stop", timing: { releasedAtMs: 725.5 } },
  ]);
  assert.deepEqual(states, ["recording", "transcribing"]);
});

test("repeated or unmatched key events do not create extra recordings", () => {
  const captureCommands = [];
  const coordinator = createPushToTalkCoordinator({
    startCapture: () => captureCommands.push("start"),
    stopCapture: () => captureCommands.push("stop"),
    setUserVisibleState: () => {},
  });

  coordinator.keyUp();
  coordinator.keyDown();
  coordinator.keyDown();
  coordinator.keyUp();
  coordinator.keyUp();

  assert.deepEqual(captureCommands, ["start", "stop"]);
});
