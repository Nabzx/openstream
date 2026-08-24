const { cleanup } = require("./cleanup/rules");
const { isBreakSafeApplication } = require("./breakSafety");
const { splitSentences, repairBreakIndices, applyParagraphBreaks } = require("./paragraphBreaks");

async function runCompletedDictation(options) {
  const {
    wavBuffer,
    transcription,
    delivery,
    contextDetection = {
      getFocusContext: async () => ({ bundleId: "", isOneLineField: false }),
    },
    breakPlacement,
    setUserVisibleState = () => {},
    recordDiagnostic = () => {},
    logger = console,
  } = options;

  if (!wavBuffer || wavBuffer.byteLength <= 44) {
    setUserVisibleState("idle");
    return { status: "empty" };
  }

  setUserVisibleState("transcribing");

  let transcript;
  try {
    transcript = await transcription.transcribe(wavBuffer);
  } catch (err) {
    logger.error("[dictation] transcription failed:", err);
    setUserVisibleState("idle");
    return { status: "failed", stage: "transcription", error: err };
  }

  const rawText = (transcript.text || "").trim();
  if (!rawText) {
    setUserVisibleState("idle");
    return { status: "no-speech" };
  }

  let focusContext;
  try {
    focusContext = await contextDetection.getFocusContext();
  } catch (err) {
    logger.error("[dictation] context detection failed:", err);
    setUserVisibleState("idle");
    return { status: "failed", stage: "context", error: err };
  }

  const breakSafe = isBreakSafeApplication(focusContext.bundleId);
  let finishedText = cleanup(rawText, {
    oneLineBox: focusContext.isOneLineField,
    breakSafe,
  });
  if (!finishedText) {
    setUserVisibleState("idle");
    return { status: "no-speech" };
  }

  const sentences = splitSentences(finishedText);
  const hasExplicitBreakCommand = /\bnew (?:line|paragraph)\b/i.test(rawText);
  const eligibleForBreakPlacement =
    breakSafe && !focusContext.isOneLineField && !hasExplicitBreakCommand && sentences.length >= 3;

  if (eligibleForBreakPlacement && breakPlacement) {
    try {
      const reply = await breakPlacement.placeParagraphBreaks(sentences);
      const repair = repairBreakIndices(reply, sentences.length);
      recordDiagnostic("paragraphBreaks.formatValid", repair.formatValid);
      recordDiagnostic("paragraphBreaks.repairUsed", repair.repairUsed);
      if (repair.indices.length > 0) {
        finishedText = applyParagraphBreaks(sentences, repair.indices);
      }
    } catch (err) {
      recordDiagnostic("paragraphBreaks.failure", err instanceof Error ? err.message : String(err));
    }
  }

  try {
    const deliveryResult = await delivery.deliver(finishedText);
    setUserVisibleState("idle");
    if (deliveryResult.kind === "inserted") {
      return { status: "delivered", text: finishedText, delivery: deliveryResult };
    }
    if (deliveryResult.kind === "held") {
      return { status: "held", text: finishedText, delivery: deliveryResult };
    }
    return { status: "failed", stage: "delivery", text: finishedText, delivery: deliveryResult };
  } catch (err) {
    logger.error("[dictation] injection failed:", err);
    setUserVisibleState("idle");
    return { status: "failed", stage: "delivery", text: finishedText, error: err };
  }
}

module.exports = { runCompletedDictation };
