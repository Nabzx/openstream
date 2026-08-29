const { createHotkeyHelper } = require("./hotkeyHelper");
const { STANDALONE_FN_KEY_CODE } = require("./hotkeyDefinitions");

const FN_HOTKEY = Object.freeze({ keyCode: STANDALONE_FN_KEY_CODE, modifiers: [] });

function copyHotkey(hotkey) {
  return { keyCode: hotkey.keyCode, modifiers: [...hotkey.modifiers] };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createFnShortcutCapture({
  createHelper = createHotkeyHelper,
  onCaptured = () => {},
  onDiagnostic = () => {},
} = {}) {
  let activeHelper = null;

  function stop() {
    const helper = activeHelper;
    activeHelper = null;
    if (!helper) return;

    try {
      helper.stop();
    } catch (error) {
      onDiagnostic(`Fn shortcut capture could not stop: ${errorMessage(error)}`);
    }
  }

  async function start() {
    stop();

    let helper;
    try {
      helper = createHelper({ hotkey: copyHotkey(FN_HOTKEY), restartOnFailure: false });
    } catch (error) {
      onDiagnostic(`Fn shortcut capture could not be created: ${errorMessage(error)}`);
      return false;
    }

    activeHelper = helper;
    helper.onKeyDown(() => {
      if (activeHelper !== helper) return;
      stop();
      onCaptured(copyHotkey(FN_HOTKEY));
    });

    try {
      await helper.start();
    } catch (error) {
      if (activeHelper === helper) {
        activeHelper = null;
        try {
          helper.stop();
        } catch (stopError) {
          onDiagnostic(`Fn shortcut capture could not stop: ${errorMessage(stopError)}`);
        }
        onDiagnostic(`Fn shortcut capture could not start: ${errorMessage(error)}`);
      }
      return false;
    }

    if (activeHelper !== helper) return false;
    if (typeof helper.isReady === "function" && !helper.isReady()) {
      stop();
      onDiagnostic("Fn shortcut capture stopped before becoming ready");
      return false;
    }
    if (typeof helper.isRunning === "function" && !helper.isRunning()) {
      stop();
      onDiagnostic("Fn shortcut capture stopped before becoming usable");
      return false;
    }
    return true;
  }

  return { start, stop };
}

module.exports = { createFnShortcutCapture, FN_HOTKEY };
