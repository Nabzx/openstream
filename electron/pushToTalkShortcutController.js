const { createHotkeyHelper } = require("./hotkeyHelper");
const { validateNewShortcut } = require("./settingsStore");

const UNAVAILABLE_MESSAGE = "Shortcut unavailable. Choose another shortcut.";
const INTERNAL_FAILURE_MESSAGE = "Unable to change the Push-to-talk shortcut.";

function copyShortcut(shortcut) {
  return { keyCode: shortcut.keyCode, modifiers: [...shortcut.modifiers] };
}

function failure(kind, message) {
  return { ok: false, kind, message };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createPushToTalkShortcutController({
  settingsStore,
  createHelper = createHotkeyHelper,
  onKeyDown = () => {},
  onKeyUp = () => {},
  onDiagnostic = () => {},
} = {}) {
  let activeShortcut = copyShortcut(settingsStore.get().hotkey);
  let activeHelper = createHelper({ hotkey: activeShortcut, restartOnFailure: true });
  let started = false;
  let stopped = false;
  let pendingCandidate = null;
  let replacementPromise = null;

  function wireActiveEvents(helper) {
    helper.onKeyDown(() => {
      if (activeHelper === helper) onKeyDown();
    });
    helper.onKeyUp(() => {
      if (activeHelper === helper) onKeyUp();
    });
  }

  function reportDiagnostic(message, error) {
    onDiagnostic(`${message}: ${errorMessage(error)}`);
  }

  function stopQuietly(helper) {
    try {
      helper.stop();
      return null;
    } catch (error) {
      return error;
    }
  }

  function unsupportedResult() {
    return failure("unsupported", "Unsupported key");
  }

  function unavailableResult() {
    return failure("unavailable", UNAVAILABLE_MESSAGE);
  }

  function internalFailureResult() {
    return failure("internal-failure", INTERNAL_FAILURE_MESSAGE);
  }

  function restoreActiveHelper(helper, shortcut) {
    activeHelper = helper;
    activeShortcut = copyShortcut(shortcut);
    wireActiveEvents(helper);
  }

  function activateCandidate(candidate, candidateShortcut) {
    candidate.enableAutomaticRestart();
    wireActiveEvents(candidate);
    activeHelper = candidate;
    activeShortcut = copyShortcut(candidateShortcut);
  }

  async function prepareCandidate(candidate) {
    try {
      await candidate.start();
      if (
        stopped ||
        (typeof candidate.isReady === "function" && !candidate.isReady()) ||
        (typeof candidate.isRunning === "function" && !candidate.isRunning())
      ) {
        throw new Error("candidate helper stopped before activation");
      }
      return null;
    } catch (error) {
      return error;
    }
  }

  function saveCandidate(candidateShortcut) {
    try {
      return { settings: settingsStore.setShortcut(copyShortcut(candidateShortcut)) };
    } catch (error) {
      return { error };
    }
  }

  async function replaceInternal(candidateShortcut) {
    try {
      validateNewShortcut(candidateShortcut);
    } catch {
      return unsupportedResult();
    }

    if (stopped) return internalFailureResult();

    const previousHelper = activeHelper;
    const previousShortcut = copyShortcut(activeShortcut);
    let candidate;
    try {
      candidate = createHelper({ hotkey: copyShortcut(candidateShortcut), restartOnFailure: false });
    } catch (error) {
      reportDiagnostic("shortcut candidate could not be created", error);
      return unavailableResult();
    }

    pendingCandidate = candidate;
    let replacementSucceeded = false;
    try {
      const preparationError = await prepareCandidate(candidate);
      if (preparationError) {
        reportDiagnostic("shortcut candidate could not start", preparationError);
        return stopped ? internalFailureResult() : unavailableResult();
      }

      try {
        activateCandidate(candidate, candidateShortcut);
      } catch (error) {
        reportDiagnostic("shortcut candidate could not become active", error);
        return internalFailureResult();
      }

      // The candidate is ready before this write. The old saved value stays
      // in place until the candidate has become the active event source.
      const saveResult = saveCandidate(candidateShortcut);
      if (saveResult.error) {
        reportDiagnostic("shortcut candidate could not be saved", saveResult.error);
        return internalFailureResult();
      }

      if (started) {
        const stopError = stopQuietly(previousHelper);
        if (stopError) reportDiagnostic("previous shortcut helper could not stop", stopError);
      }
      replacementSucceeded = true;
      return { ok: true, settings: saveResult.settings };
    } finally {
      if (!replacementSucceeded) {
        if (activeHelper === candidate) restoreActiveHelper(previousHelper, previousShortcut);
        const stopError = stopQuietly(candidate);
        if (stopError) reportDiagnostic("shortcut candidate could not stop", stopError);
      }
      if (pendingCandidate === candidate) pendingCandidate = null;
    }
  }

  wireActiveEvents(activeHelper);

  return {
    start() {
      if (stopped) return Promise.reject(new Error("Push-to-talk shortcut controller is stopped"));
      started = true;
      return activeHelper.start();
    },
    stop() {
      stopped = true;
      if (pendingCandidate) stopQuietly(pendingCandidate);
      stopQuietly(activeHelper);
    },
    replace(candidateShortcut) {
      if (replacementPromise) return Promise.resolve(internalFailureResult());
      replacementPromise = replaceInternal(candidateShortcut).finally(() => {
        replacementPromise = null;
      });
      return replacementPromise;
    },
    getActiveShortcut() {
      return copyShortcut(activeShortcut);
    },
  };
}

module.exports = {
  createPushToTalkShortcutController,
  UNAVAILABLE_MESSAGE,
  INTERNAL_FAILURE_MESSAGE,
};
