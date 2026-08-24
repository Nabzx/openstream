const { encodeWav } = require("./wav");
const { cleanup } = require("./cleanup/rules");

async function runCompletedDictation(options) {
  const {
    int16Samples,
    transcription,
    delivery,
    context = { oneLineBox: false, breakSafe: false },
    setUserVisibleState = () => {},
    logger = console,
  } = options;

  if (!int16Samples || int16Samples.length === 0) {
    setUserVisibleState("idle");
    return { status: "empty" };
  }

  setUserVisibleState("transcribing");

  let transcript;
  try {
    const wavBuffer = encodeWav(int16Samples);
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

  const finishedText = cleanup(rawText, context);
  if (!finishedText) {
    setUserVisibleState("idle");
    return { status: "no-speech" };
  }

  try {
    const deliveryResult = await delivery.inject(finishedText);
    setUserVisibleState("idle");
    if (deliveryResult.status === "delivered") {
      return { status: "delivered", text: finishedText, delivery: deliveryResult };
    }
    if (deliveryResult.status === "held") {
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
