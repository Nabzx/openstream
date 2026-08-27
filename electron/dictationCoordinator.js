const { cleanup } = require("./cleanup/rules");
const { isBreakSafeApplication } = require("./breakSafety");
const { splitSentences, repairBreakIndices, applyParagraphBreaks } = require("./paragraphBreaks");

function createDictationIntake(options) {
  const {
    transcription,
    contextDetection,
    breakPlacement,
    delivery,
    // #16: optional on purpose - most callers (and all of history before
    // #16) have no project vocabulary configured at all. Defaults to a
    // no-op that biases nothing, rather than forcing every caller/test to
    // know about vocabulary scanning.
    vocabulary = { getPrompt: () => "" },
    onDiagnostic = () => {},
  } = options;

  assertAdapter("transcription", transcription, "transcribe");
  assertAdapter("contextDetection", contextDetection, "getFocusContext");
  assertAdapter("breakPlacement", breakPlacement, "placeParagraphBreaks");
  assertAdapter("delivery", delivery, "deliver");
  assertAdapter("vocabulary", vocabulary, "getPrompt");

  let queue = Promise.resolve();

  function complete(wavBuffer) {
    const result = queue.then(() => processCompletedDictation(wavBuffer));
    // An unexpected programming error must reject its own call without
    // preventing later completed recordings from leaving the queue.
    queue = result.catch(() => {});
    return result;
  }

  async function processCompletedDictation(wavBuffer) {
    if (!wavBuffer || wavBuffer.byteLength <= 44) {
      return { status: "empty" };
    }

    let rawText;
    try {
      const transcript = await transcription.transcribe(wavBuffer, vocabulary.getPrompt());
      if (typeof transcript !== "string") {
        throw new Error("transcription adapter returned a non-string transcript");
      }
      rawText = transcript.trim();
    } catch (error) {
      return failed("transcription", error);
    }

    if (!rawText) {
      return { status: "no-speech" };
    }

    let focusContext;
    try {
      focusContext = await contextDetection.getFocusContext();
      if (
        !focusContext ||
        typeof focusContext.bundleId !== "string" ||
        typeof focusContext.isOneLineField !== "boolean"
      ) {
        throw new Error("context adapter returned an invalid focus context");
      }
    } catch (error) {
      return failed("context", error);
    }

    const breakSafe = isBreakSafeApplication(focusContext.bundleId);
    let finishedText = cleanup(rawText, {
      oneLineBox: focusContext.isOneLineField,
      breakSafe,
    });
    if (!finishedText) {
      return { status: "no-speech" };
    }

    const sentences = splitSentences(finishedText);
    const hasExplicitBreakCommand = /\bnew (?:line|paragraph)\b/i.test(rawText);
    const eligibleForBreakPlacement =
      breakSafe && !focusContext.isOneLineField && !hasExplicitBreakCommand && sentences.length >= 3;

    if (eligibleForBreakPlacement) {
      try {
        const reply = await breakPlacement.placeParagraphBreaks(sentences);
        if (typeof reply !== "string") {
          throw new Error("break-placement adapter returned a non-string reply");
        }
        const repair = repairBreakIndices(reply, sentences.length);
        emitDiagnostic("paragraphBreaks.formatValid", repair.formatValid);
        emitDiagnostic("paragraphBreaks.repairUsed", repair.repairUsed);
        if (repair.indices.length > 0) {
          finishedText = applyParagraphBreaks(sentences, repair.indices);
        }
      } catch (error) {
        emitDiagnostic("paragraphBreaks.failure", errorMessage(error));
      }
    }

    try {
      const deliveryResult = await delivery.deliver(finishedText);
      if (deliveryResult?.kind === "inserted") {
        return { status: "delivered", text: finishedText };
      }
      if (deliveryResult?.kind === "held") {
        return {
          status: "held",
          text: finishedText,
          reason: typeof deliveryResult.reason === "string" ? deliveryResult.reason : "delivery could not proceed",
        };
      }
      throw new Error("delivery adapter returned an invalid result");
    } catch (error) {
      const reason = errorMessage(error);
      emitDiagnostic("delivery.failure", reason);
      return { status: "held", text: finishedText, reason };
    }
  }

  function emitDiagnostic(name, value) {
    try {
      onDiagnostic(name, value);
    } catch {
      // Diagnostics must never change the Dictation outcome.
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
    throw new Error(`Dictation intake requires ${name}.${method}()`);
  }
}

module.exports = { createDictationIntake };
