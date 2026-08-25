function createPushToTalkCoordinator({ startCapture, stopCapture, setUserVisibleState, now = performance.now.bind(performance) }) {
  let recording = false;

  return {
    keyDown() {
      if (recording) return;
      recording = true;
      startCapture();
      setUserVisibleState("recording");
    },

    keyUp() {
      if (!recording) return;
      recording = false;
      stopCapture({ releasedAtMs: now() });
      setUserVisibleState("transcribing");
    },
  };
}

module.exports = { createPushToTalkCoordinator };
