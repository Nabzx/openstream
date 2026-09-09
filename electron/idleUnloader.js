// #257: the model servers sit resident for the app's life - ~1 GB of RAM
// even when nobody has dictated for hours. This is the deliberate trade for
// zero per-dictation load cost (ADR-0002), but a long idle period doesn't
// need it. After `idleMs` without a dictation, `onUnload` is called; the
// next dictation calls `onReload` and pays the one-time warm-up.
//
// Pure and timer-injectable so it can be tested without real time. main.js
// owns the wiring: noteActivity() on key-down and on a finished dictation,
// setIdleMs() when the setting changes, stop() at quit.
function createIdleUnloader({
  idleMs = 0,
  onUnload,
  onReload,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  if (typeof onUnload !== "function" || typeof onReload !== "function") {
    throw new Error("createIdleUnloader needs onUnload and onReload callbacks");
  }

  let currentIdleMs = idleMs;
  let timer = null;
  let unloaded = false;

  function disarm() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function arm() {
    disarm();
    // 0 (or anything not positive) means the feature is off - stay resident.
    if (!(currentIdleMs > 0) || unloaded) return;
    timer = setTimer(() => {
      timer = null;
      unloaded = true;
      onUnload();
    }, currentIdleMs);
  }

  return {
    // A dictation is starting or has just finished. Reload first if we had
    // parked the servers, then restart the idle countdown.
    noteActivity() {
      if (unloaded) {
        unloaded = false;
        onReload();
      }
      arm();
    },
    // The idle-timeout setting changed (minutes, or 0 for off).
    setIdleMs(ms) {
      currentIdleMs = ms;
      arm();
    },
    isUnloaded() {
      return unloaded;
    },
    stop() {
      disarm();
    },
  };
}

module.exports = { createIdleUnloader };
