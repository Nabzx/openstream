const { cleanup } = require("./cleanup/rules");
const { isBreakSafeApplication } = require("./breakSafety");
const {
  splitSentences,
  repairBreakIndices,
  repairListRange,
  renderStructuredText,
} = require("./paragraphBreaks");

function createDictationIntake(options) {
  const {
    transcription,
    contextDetection,
    breakPlacement,
    delivery,
    onDiagnostic = () => {},
    // #125: the spike found SmolLM2-1.7B over-triggers list detection (a list
    // flagged on 5 of 6 non-lists) and the live prompt is break-only for now,
    // so the model never returns a LIST line in production. The parse still
    // runs and its diagnostics still fire - that's the telemetry a future
    // prompt needs - but the range is only rendered when this is switched on.
    // See spike/list-boundaries-125/FINDINGS.md.
    listDetection = false,
  } = options;

  assertAdapter("transcription", transcription, "transcribe");
  assertAdapter("contextDetection", contextDetection, "getFocusContext");
  assertAdapter("breakPlacement", breakPlacement, "placeParagraphBreaks");
  assertAdapter("delivery", delivery, "deliver");

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
      const transcript = await transcription.transcribe(wavBuffer);
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
        const breaks = repairBreakIndices(reply, sentences.length);
        emitDiagnostic("paragraphBreaks.formatValid", breaks.formatValid);
        emitDiagnostic("paragraphBreaks.repairUsed", breaks.repairUsed);
        // #125: the reply may also carry a list-boundary claim (BREAKS: /
        // LIST: two-line contract). repairListRange fails closed - a range we
        // cannot read cleanly comes back null - and rendering is gated off by
        // default until a prompt exists that the model handles (see above).
        const list = repairListRange(reply, sentences.length);
        emitDiagnostic("listBoundaries.formatValid", list.formatValid);
        emitDiagnostic("listBoundaries.repairUsed", list.repairUsed);
        const listRange = listDetection ? list.range : null;
        if (breaks.indices.length > 0 || listRange) {
          finishedText = renderStructuredText(sentences, {
            breakIndices: breaks.indices,
            listRange,
          });
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
