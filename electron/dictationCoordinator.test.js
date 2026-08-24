const test = require("node:test");
const assert = require("node:assert/strict");
const { runCompletedDictation } = require("./dictationCoordinator");

const completedWav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40), Buffer.from([1, 2])]);

function silentLogger() {
  return { error() {} };
}

async function deliveredText({ bundleId, isOneLineField, transcript, breakPlacement }) {
  const delivered = [];
  await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => ({ text: transcript }) },
    contextDetection: {
      getFocusContext: async () => ({ bundleId, isOneLineField }),
    },
    breakPlacement,
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

test("eligible long dictation sends cleaned sentences once and applies returned break indices", async () => {
  const calls = [];
  const delivered = await deliveredText({
    bundleId: "com.apple.TextEdit",
    isOneLineField: false,
    transcript: "first topic. still first topic. second topic. more on the second topic.",
    breakPlacement: {
      placeParagraphBreaks: async (sentences) => {
        calls.push(sentences);
        return "3";
      },
    },
  });

  assert.deepEqual(calls, [[
    "First topic.",
    "Still first topic.",
    "Second topic.",
    "More on the second topic.",
  ]]);
  assert.deepEqual(delivered, [
    "First topic. Still first topic.\n\nSecond topic. More on the second topic.",
  ]);
});

test("short, break-unsafe, one-line, and explicit-break dictations skip break placement", async () => {
  let calls = 0;
  const breakPlacement = {
    placeParagraphBreaks: async () => {
      calls++;
      return "2";
    },
  };

  await deliveredText({
    bundleId: "com.apple.TextEdit",
    isOneLineField: false,
    transcript: "first sentence. second sentence.",
    breakPlacement,
  });
  await deliveredText({
    bundleId: "com.apple.Terminal",
    isOneLineField: false,
    transcript: "first sentence. second sentence. third sentence.",
    breakPlacement,
  });
  await deliveredText({
    bundleId: "com.apple.TextEdit",
    isOneLineField: true,
    transcript: "first sentence. second sentence. third sentence.",
    breakPlacement,
  });
  const explicit = await deliveredText({
    bundleId: "com.apple.TextEdit",
    isOneLineField: false,
    transcript: "first sentence new paragraph second sentence. third sentence. fourth sentence.",
    breakPlacement,
  });

  assert.equal(calls, 0);
  assert.deepEqual(explicit, ["First sentence\n\nSecond sentence. Third sentence. Fourth sentence."]);
});

test("repairs malformed break indices without retrying and records format and repair separately", async () => {
  let calls = 0;
  const diagnostics = [];
  const delivered = [];
  await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: {
      transcribe: async () => ({ text: "first sentence. second sentence. third sentence. fourth sentence." }),
    },
    contextDetection: {
      getFocusContext: async () => ({ bundleId: "com.apple.TextEdit", isOneLineField: false }),
    },
    breakPlacement: {
      placeParagraphBreaks: async () => {
        calls++;
        return "Break before -2, 3.5, 1, 3, 3, and 99.";
      },
    },
    delivery: {
      deliver: async (text) => {
        delivered.push(text);
        return { kind: "inserted" };
      },
    },
    recordDiagnostic: (name, value) => diagnostics.push([name, value]),
    logger: silentLogger(),
  });

  assert.equal(calls, 1);
  assert.deepEqual(delivered, [
    "First sentence. Second sentence.\n\nThird sentence. Fourth sentence.",
  ]);
  assert.deepEqual(diagnostics, [
    ["paragraphBreaks.formatValid", false],
    ["paragraphBreaks.repairUsed", true],
  ]);
});

test("a break reply with no usable indices falls back to one paragraph", async () => {
  const delivered = await deliveredText({
    bundleId: "com.apple.TextEdit",
    isOneLineField: false,
    transcript: "first sentence. second sentence. third sentence.",
    breakPlacement: {
      placeParagraphBreaks: async () => "-2, 2.5, 1, 9, 9",
    },
  });

  assert.deepEqual(delivered, ["First sentence. Second sentence. Third sentence."]);
});

test("break-placement failure falls back to one paragraph without retrying", async () => {
  let calls = 0;
  const delivered = await deliveredText({
    bundleId: "com.apple.TextEdit",
    isOneLineField: false,
    transcript: "first sentence. second sentence. third sentence.",
    breakPlacement: {
      placeParagraphBreaks: async () => {
        calls++;
        throw new Error("rewrite server unavailable");
      },
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(delivered, ["First sentence. Second sentence. Third sentence."]);
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

test("delivery failure holds the complete finished text without retrying delivery", async () => {
  let deliveryCalls = 0;
  const states = [];
  const result = await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => ({ text: "hello world" }) },
    delivery: {
      deliver: async () => {
        deliveryCalls++;
        throw new Error("accessibility helper timed out");
      },
    },
    setUserVisibleState: (state, details) => states.push([state, details]),
    logger: silentLogger(),
  });

  assert.equal(result.status, "held");
  assert.equal(result.text, "Hello world.");
  assert.equal(result.delivery.reason, "accessibility helper timed out");
  assert.equal(deliveryCalls, 1);
  assert.deepEqual(states, [
    ["transcribing", undefined],
    ["held", { text: "Hello world.", reason: "accessibility helper timed out" }],
  ]);
});

test("held delivery preserves the complete finished text without retrying delivery", async () => {
  const delivered = [];
  const states = [];
  const result = await runCompletedDictation({
    wavBuffer: completedWav,
    transcription: { transcribe: async () => ({ text: "hello world" }) },
    delivery: {
      deliver: async (text) => {
        delivered.push(text);
        return { kind: "held", reason: "unverified target" };
      },
    },
    setUserVisibleState: (state, details) => states.push([state, details]),
    logger: silentLogger(),
  });

  assert.equal(result.status, "held");
  assert.equal(result.text, "Hello world.");
  assert.equal(result.delivery.reason, "unverified target");
  assert.deepEqual(delivered, ["Hello world."]);
  assert.deepEqual(states, [
    ["transcribing", undefined],
    ["held", { text: "Hello world.", reason: "unverified target" }],
  ]);
});
