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

// Fake timer that lets a test fire the callback deterministically instead
// of waiting on a real clock, matching the injected-timer pattern used
// elsewhere in this codebase (e.g. hotkeyHelper.js's restart timer).
function createFakeTimers() {
  let scheduled = null;
  return {
    setSafetyTimer: (callback, delay) => {
      scheduled = { callback, delay };
      return scheduled;
    },
    clearSafetyTimer: (handle) => {
      if (handle === scheduled) scheduled = null;
    },
    fire: () => {
      const pending = scheduled;
      scheduled = null;
      pending.callback();
    },
    isPending: () => scheduled !== null,
  };
}

// #140: a keyUp that never arrives (a lost/dropped event, for whatever
// reason) must not leave `recording` stuck true forever - that would make
// every subsequent keyDown a silent no-op, indistinguishable from "the
// hotkey stopped working".
test("a keyUp that never arrives is force-stopped by the safety timeout, and the next keyDown works again", () => {
  const captureCommands = [];
  const states = [];
  const stuckEvents = [];
  const timers = createFakeTimers();
  const coordinator = createPushToTalkCoordinator({
    startCapture: () => captureCommands.push("start"),
    stopCapture: () => captureCommands.push("stop"),
    setUserVisibleState: (state) => states.push(state),
    setSafetyTimer: timers.setSafetyTimer,
    clearSafetyTimer: timers.clearSafetyTimer,
    maxRecordingMs: 60_000,
    onStuckRecording: () => stuckEvents.push(true),
  });

  coordinator.keyDown();
  assert.equal(timers.isPending(), true);

  // keyUp never comes.
  timers.fire();

  assert.deepEqual(captureCommands, ["start", "stop"]);
  assert.deepEqual(states, ["recording", "transcribing"]);
  assert.equal(stuckEvents.length, 1);

  // The whole point: recording must not be stuck - a fresh press works.
  coordinator.keyDown();
  assert.deepEqual(captureCommands, ["start", "stop", "start"]);
});

test("a normal keyUp cancels the safety timeout instead of double-stopping later", () => {
  const captureCommands = [];
  const stuckEvents = [];
  const timers = createFakeTimers();
  const coordinator = createPushToTalkCoordinator({
    startCapture: () => captureCommands.push("start"),
    stopCapture: () => captureCommands.push("stop"),
    setUserVisibleState: () => {},
    setSafetyTimer: timers.setSafetyTimer,
    clearSafetyTimer: timers.clearSafetyTimer,
    onStuckRecording: () => stuckEvents.push(true),
  });

  coordinator.keyDown();
  coordinator.keyUp();

  assert.equal(timers.isPending(), false);
  assert.deepEqual(captureCommands, ["start", "stop"]);
  assert.equal(stuckEvents.length, 0);
});
