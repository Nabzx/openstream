const { cleanup } = require("./cleanup/rules");
const { isBreakSafeApplication } = require("./breakSafety");

async function runCompletedDictation(options) {
  const {
    wavBuffer,
    transcription,
    delivery,
    contextDetection = {
      getFocusContext: async () => ({ bundleId: "", isOneLineField: false }),
    },
    setUserVisibleState = () => {},
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

  const finishedText = cleanup(rawText, {
    oneLineBox: focusContext.isOneLineField,
    breakSafe: isBreakSafeApplication(focusContext.bundleId),
  });
  if (!finishedText) {
    setUserVisibleState("idle");
    return { status: "no-speech" };
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
