// #140: recording was a plain latch with no recovery if a keyUp was ever
// lost - the native tap disabled at the wrong moment, a dropped IPC line,
// anything. Once stuck true, keyDown's own guard would silently swallow
// every future press, forever, with no error - indistinguishable from "the
// hotkey stopped working" until the app restarted and reset the flag.
const DEFAULT_MAX_RECORDING_MS = 60_000;

function createPushToTalkCoordinator({
  startCapture,
  stopCapture,
  setUserVisibleState,
  now = performance.now.bind(performance),
  setSafetyTimer = setTimeout,
  clearSafetyTimer = clearTimeout,
  maxRecordingMs = DEFAULT_MAX_RECORDING_MS,
  onStuckRecording = () => {},
}) {
  let recording = false;
  let safetyTimer = null;

  function finishRecording() {
    recording = false;
    if (safetyTimer) {
      clearSafetyTimer(safetyTimer);
      safetyTimer = null;
    }
    stopCapture({ releasedAtMs: now() });
    setUserVisibleState("transcribing");
  }

  return {
    keyDown() {
      if (recording) return;
      recording = true;
      startCapture();
      setUserVisibleState("recording");
      // No real dictation runs this long. If maxRecordingMs elapses without
      // a matching keyUp, force a stop rather than leave `recording` stuck
      // true - that's the difference between one bad dictation and every
      // press after it silently doing nothing.
      safetyTimer = setSafetyTimer(() => {
        safetyTimer = null;
        finishRecording();
        onStuckRecording();
      }, maxRecordingMs);
    },

    keyUp() {
      if (!recording) return;
      finishRecording();
    },
  };
}

module.exports = { createPushToTalkCoordinator };
