const test = require("node:test");
const assert = require("node:assert/strict");
const { runCompletedDictation } = require("./dictationCoordinator");

const completedWav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40), Buffer.from([1, 2])]);

function silentLogger() {
  return { error() {} };
}

async function deliveredText({ bundleId, isOneLineField, transcript }) {
  const delivered = [];
  await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => ({ text: transcript }) },
    contextDetection: {
      getFocusContext: async () => ({ bundleId, isOneLineField }),
    },
    delivery: {
      deliver: async (text) => {
        delivered.push(text);
        return { kind: "inserted" };
      },
    },
    logger: silentLogger(),
  });
  return delivered;
}

test("completed recording is transcribed, cleaned, and delivered once", async () => {
  const states = [];
  const delivered = [];

  const transcriptionCalls = [];
  const contextCalls = [];
  const result = await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: {
      transcribe: async (wavBuffer) => {
        transcriptionCalls.push(wavBuffer);
        return { text: "um git hub new line java script" };
      },
    },
    contextDetection: {
      getFocusContext: async () => {
        contextCalls.push(true);
        return { bundleId: "com.apple.TextEdit", isOneLineField: false };
      },
    },
    delivery: {
      deliver: async (text) => {
        delivered.push(text);
        return { kind: "inserted" };
      },
    },
    setUserVisibleState: (state) => states.push(state),
    logger: silentLogger(),
  });

  assert.equal(result.status, "delivered");
  assert.deepEqual(transcriptionCalls, [completedWav]);
  assert.equal(contextCalls.length, 1);
  assert.deepEqual(delivered, ["GitHub\nJavaScript."]);
  assert.deepEqual(states, ["transcribing", "idle"]);
});

test("a known unsafe application never receives spoken line breaks", async () => {
  const delivered = await deliveredText({
    bundleId: "com.apple.Terminal",
    isOneLineField: false,
    transcript: "first line new line second line",
  });

  assert.deepEqual(delivered, ["First line second line."]);
});

test("an unlisted application fails closed for spoken line breaks", async () => {
  const delivered = await deliveredText({
    bundleId: "dev.openstream.UnknownApplication",
    isOneLineField: false,
    transcript: "first line new paragraph second line",
  });

  assert.deepEqual(delivered, ["First line second line."]);
});

test("a one-line field removes line breaks and its final full stop in a break-safe application", async () => {
  const delivered = await deliveredText({
    bundleId: "com.apple.TextEdit",
    isOneLineField: true,
    transcript: "first line new line second line period",
  });

  assert.deepEqual(delivered, ["First line second line"]);
});

test("empty recordings do not call transcription or delivery", async () => {
  let transcribeCalls = 0;
  let deliveryCalls = 0;

  const result = await runCompletedDictation({
    wavBuffer: Buffer.alloc(44),
    transcription: { transcribe: async () => transcribeCalls++ },
    delivery: { deliver: async () => deliveryCalls++ },
    logger: silentLogger(),
  });

  assert.equal(result.status, "empty");
  assert.equal(transcribeCalls, 0);
  assert.equal(deliveryCalls, 0);
});

test("no-speech transcription leaves the target application unchanged", async () => {
  let deliveryCalls = 0;

  const result = await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => ({ text: "   " }) },
    delivery: { deliver: async () => deliveryCalls++ },
    logger: silentLogger(),
  });

  assert.equal(result.status, "no-speech");
  assert.equal(deliveryCalls, 0);
});

test("transcription failure does not insert partial output", async () => {
  let deliveryCalls = 0;

  const result = await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => { throw new Error("server unavailable"); } },
    delivery: { deliver: async () => deliveryCalls++ },
    logger: silentLogger(),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.stage, "transcription");
  assert.equal(deliveryCalls, 0);
});

test("context detection failure leaves the target application unchanged", async () => {
  let deliveryCalls = 0;

  const result = await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => ({ text: "hello world" }) },
    contextDetection: {
      getFocusContext: async () => { throw new Error("accessibility unavailable"); },
    },
    delivery: { deliver: async () => deliveryCalls++ },
    logger: silentLogger(),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.stage, "context");
  assert.equal(deliveryCalls, 0);
});

test("held delivery preserves the complete finished text", async () => {
  const result = await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => ({ text: "hello world" }) },
    delivery: { deliver: async () => ({ kind: "held", reason: "unverified target" }) },
    logger: silentLogger(),
  });

  assert.equal(result.status, "held");
  assert.equal(result.text, "Hello world.");
  assert.equal(result.delivery.reason, "unverified target");
});
