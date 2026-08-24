const test = require("node:test");
const assert = require("node:assert/strict");
const { runCompletedDictation } = require("./dictationCoordinator");

const samples = new Int16Array([1, -1, 2, -2]);

function silentLogger() {
  return { error() {} };
}

test("completed recording is transcribed, cleaned, and delivered once", async () => {
  const states = [];
  const delivered = [];

  const result = await runCompletedDictation({
    int16Samples: samples,
    transcription: { transcribe: async () => ({ text: "um git hub new line java script" }) },
    delivery: {
      inject: async (text) => {
        delivered.push(text);
        return { status: "delivered", method: "paste", verified: true };
      },
    },
    context: { breakSafe: true, oneLineBox: false },
    setUserVisibleState: (state) => states.push(state),
    logger: silentLogger(),
  });

  assert.equal(result.status, "delivered");
  assert.deepEqual(delivered, ["GitHub\nJavaScript."]);
  assert.deepEqual(states, ["transcribing", "idle"]);
});

test("empty recordings do not call transcription or delivery", async () => {
  let transcribeCalls = 0;
  let deliveryCalls = 0;

  const result = await runCompletedDictation({
    int16Samples: new Int16Array(),
    transcription: { transcribe: async () => transcribeCalls++ },
    delivery: { inject: async () => deliveryCalls++ },
    logger: silentLogger(),
  });

  assert.equal(result.status, "empty");
  assert.equal(transcribeCalls, 0);
  assert.equal(deliveryCalls, 0);
});

test("no-speech transcription leaves the target application unchanged", async () => {
  let deliveryCalls = 0;

  const result = await runCompletedDictation({
    int16Samples: samples,
    transcription: { transcribe: async () => ({ text: "   " }) },
    delivery: { inject: async () => deliveryCalls++ },
    logger: silentLogger(),
  });

  assert.equal(result.status, "no-speech");
  assert.equal(deliveryCalls, 0);
});

test("transcription failure does not insert partial output", async () => {
  let deliveryCalls = 0;

  const result = await runCompletedDictation({
    int16Samples: samples,
    transcription: { transcribe: async () => { throw new Error("server unavailable"); } },
    delivery: { inject: async () => deliveryCalls++ },
    logger: silentLogger(),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.stage, "transcription");
  assert.equal(deliveryCalls, 0);
});

test("held delivery preserves the complete finished text", async () => {
  const result = await runCompletedDictation({
    int16Samples: samples,
    transcription: { transcribe: async () => ({ text: "hello world" }) },
    delivery: { inject: async () => ({ status: "held", reason: "unverified target" }) },
    logger: silentLogger(),
  });

  assert.equal(result.status, "held");
  assert.equal(result.text, "Hello world.");
  assert.equal(result.delivery.reason, "unverified target");
});
