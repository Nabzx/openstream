const { isBreakSafeApplication } = require("./breakSafety");
const { interpretVoiceEditCommand } = require("./voiceEditCommands");

// Voice-edit intake (#17). The user selected text, held push-to-talk, and
// spoke a command. This transcribes the command, matches it against the
// fixed grammar, applies the deterministic transform to the selection that
// was captured at key-down, and delivers the result in place. No rewrite
// model server call - see #222.
//
// Same ports-and-adapters shape as dictationCoordinator: `transcription`
// and `delivery` are injected and asserted, and completions are queued so
// two edits process strictly FIFO.
function createVoiceEditIntake(options) {
  const { transcription, delivery, onDiagnostic = () => {} } = options;

  assertAdapter("transcription", transcription, "transcribe");
  assertAdapter("delivery", delivery, "deliver");

  let queue = Promise.resolve();

  function complete(wavBuffer, context) {
    const result = queue.then(() => processCompletedEdit(wavBuffer, context));
    queue = result.catch(() => {});
    return result;
  }

  async function processCompletedEdit(wavBuffer, context) {
    if (!wavBuffer || wavBuffer.byteLength <= 44) {
      return { status: "empty" };
    }

    const selection = context && typeof context.selection === "string" ? context.selection : "";
    const focusContext = context && context.focusContext ? context.focusContext : null;
    if (!selection) {
      return failed("selection", new Error("no selection was captured for this voice edit"));
    }
    if (
      !focusContext ||
      typeof focusContext.bundleId !== "string" ||
      typeof focusContext.isOneLineField !== "boolean"
    ) {
      return failed("selection", new Error("voice edit was missing its focus context"));
    }

    let commandText;
    try {
      const transcript = await transcription.transcribe(wavBuffer);
      if (typeof transcript !== "string") {
        throw new Error("transcription adapter returned a non-string transcript");
      }
      commandText = transcript.trim();
    } catch (error) {
      return failed("transcription", error);
    }

    if (!commandText) {
      return { status: "empty" };
    }

    const interpreted = interpretVoiceEditCommand(commandText, selection);
    emitDiagnostic("voiceEdit.command", interpreted.status === "ok" ? interpreted.commandId : interpreted.status);

    if (interpreted.status === "unrecognised") {
      return { status: "unrecognised", command: commandText };
    }
    if (interpreted.status === "declined") {
      return { status: "declined", commandId: interpreted.commandId, reason: interpreted.reason };
    }

    const { commandId, result } = interpreted;

    const needsNewlines = result.includes("\n");
    const targetTakesNewlines =
      isBreakSafeApplication(focusContext.bundleId) && !focusContext.isOneLineField;
    if (needsNewlines && !targetTakesNewlines) {
      return {
        status: "held",
        commandId,
        text: result,
        reason: "this app can't take the line breaks this edit needs",
      };
    }

    try {
      const deliveryResult = await delivery.deliver(result);
      if (deliveryResult?.kind === "inserted") {
        return { status: "delivered", commandId, text: result };
      }
      if (deliveryResult?.kind === "held") {
        return {
          status: "held",
          commandId,
          text: result,
          reason:
            typeof deliveryResult.reason === "string" ? deliveryResult.reason : "delivery could not proceed",
        };
      }
      throw new Error("delivery adapter returned an invalid result");
    } catch (error) {
      const reason = errorMessage(error);
      emitDiagnostic("voiceEdit.deliveryFailure", reason);
      return { status: "held", commandId, text: result, reason };
    }
  }

  function emitDiagnostic(name, value) {
    try {
      onDiagnostic(name, value);
    } catch {
      // Diagnostics must never change the outcome.
    }
  }

  return { complete };
}

function failed(stage, error) {
  return { status: "failed", stage, reason: errorMessage(error) };
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "unknown error";
}

function assertAdapter(name, adapter, method) {
  if (!adapter || typeof adapter[method] !== "function") {
    throw new Error(`Voice-edit intake requires ${name}.${method}()`);
  }
}

module.exports = { createVoiceEditIntake };
