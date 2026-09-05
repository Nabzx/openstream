const test = require("node:test");
const assert = require("node:assert/strict");
const { createVoiceEditIntake } = require("./voiceEditCoordinator");
const { setBreakSafeApplications, DEFAULT_BREAK_SAFE_BUNDLE_IDS } = require("./breakSafety");

const WAV = Buffer.alloc(200); // > 44 bytes, counts as real audio

function fakeAdapters(overrides = {}) {
  const calls = [];
  return {
    calls,
    transcription: {
      transcribe: async (buf) => {
        calls.push(["transcribe", buf.byteLength]);
        return overrides.transcript ?? "snake case";
      },
    },
    delivery: {
      deliver: async (text) => {
        calls.push(["deliver", text]);
        if (overrides.deliver) return overrides.deliver(text);
        return { kind: "inserted" };
      },
    },
    // #374: omit entirely to test the "no clipboard adapter configured" path.
    clipboard: overrides.noClipboard
      ? undefined
      : {
          writeText: (text) => calls.push(["clipboard.writeText", text]),
        },
    onDiagnostic: (name, value) => calls.push(["diag", name, value]),
  };
}

const ctx = (selection, over = {}) => ({
  selection,
  focusContext: { bundleId: over.bundleId ?? "com.apple.TextEdit", isOneLineField: over.isOneLineField ?? false },
});

test.beforeEach(() => setBreakSafeApplications(DEFAULT_BREAK_SAFE_BUNDLE_IDS));

test("a recognised command transforms the selection and delivers it", async () => {
  const a = fakeAdapters({ transcript: "camel case" });
  const intake = createVoiceEditIntake(a);
  const result = await intake.complete(WAV, ctx("user profile name"));
  assert.deepEqual(result, { status: "delivered", commandId: "camel", text: "userProfileName" });
  assert.deepEqual(a.calls[0], ["transcribe", 200]);
  assert.deepEqual(a.calls[1], ["diag", "voiceEdit.command", "camel"]);
  assert.deepEqual(a.calls[2], ["deliver", "userProfileName"]);
});

test("an unrecognised command returns unrecognised and never calls deliver", async () => {
  const a = fakeAdapters({ transcript: "make this sound nicer" });
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("some text"));
  assert.equal(result.status, "unrecognised");
  assert.equal(result.command, "make this sound nicer");
  assert.ok(!a.calls.some((c) => c[0] === "deliver"));
});

test("a declined command (prose given to an identifier case) never calls deliver", async () => {
  const a = fakeAdapters({ transcript: "snake case" });
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("The build is broken again, sadly."));
  assert.equal(result.status, "declined");
  assert.equal(result.commandId, "snake");
  assert.ok(!a.calls.some((c) => c[0] === "deliver"));
});

test("#374: copy that writes the selection to the clipboard and never calls deliver", async () => {
  const a = fakeAdapters({ transcript: "copy that" });
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("the quick brown fox"));
  assert.deepEqual(result, { status: "copied", commandId: "copy", text: "the quick brown fox" });
  assert.deepEqual(a.calls.find((c) => c[0] === "clipboard.writeText"), ["clipboard.writeText", "the quick brown fox"]);
  assert.ok(!a.calls.some((c) => c[0] === "deliver"), "copy never injects");
});

test("#374: copy works in an app that isn't break-safe, since nothing is injected", async () => {
  // The newline / break-safe gate below is about what can land in the
  // document - copy never reaches it, because it never writes anything.
  const a = fakeAdapters({ transcript: "copy this" });
  const result = await createVoiceEditIntake(a).complete(
    WAV,
    ctx("some code\nwith a line break", { bundleId: "com.apple.Terminal" }),
  );
  assert.equal(result.status, "copied");
});

test("#374: copy without a clipboard adapter configured fails cleanly", async () => {
  const a = fakeAdapters({ transcript: "copy that", noClipboard: true });
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("hello"));
  assert.equal(result.status, "failed");
  assert.equal(result.stage, "copy");
});

test("a newline result into a non-break-safe app is held, not delivered", async () => {
  const a = fakeAdapters({ transcript: "bullet list" });
  const result = await createVoiceEditIntake(a).complete(
    WAV,
    ctx("milk, eggs and bread", { bundleId: "com.apple.Terminal" }),
  );
  assert.equal(result.status, "held");
  assert.equal(result.text, "- milk\n- eggs\n- bread");
  assert.ok(!a.calls.some((c) => c[0] === "deliver"));
});

test("a newline result into a one-line field is held even in a break-safe app", async () => {
  const a = fakeAdapters({ transcript: "bullet list" });
  const result = await createVoiceEditIntake(a).complete(
    WAV,
    ctx("milk, eggs and bread", { bundleId: "com.apple.TextEdit", isOneLineField: true }),
  );
  assert.equal(result.status, "held");
});

test("a newline result into a break-safe multi-line app is delivered", async () => {
  const a = fakeAdapters({ transcript: "bullet list" });
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("milk, eggs and bread"));
  assert.equal(result.status, "delivered");
  assert.equal(result.text, "- milk\n- eggs\n- bread");
});

test("a single-line result is fine anywhere, break-safe or not", async () => {
  const a = fakeAdapters({ transcript: "wrap in backticks" });
  const result = await createVoiceEditIntake(a).complete(
    WAV,
    ctx("npm test", { bundleId: "com.apple.Terminal" }),
  );
  assert.deepEqual(result, { status: "delivered", commandId: "wrap-backtick", text: "`npm test`" });
});

test("a delivery that reports held propagates as held with the result text", async () => {
  const a = fakeAdapters({ transcript: "upper case", deliver: () => ({ kind: "held", reason: "focus moved" }) });
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("hello"));
  assert.deepEqual(result, { status: "held", commandId: "upper", text: "HELLO", reason: "focus moved" });
});

test("a delivery that throws is caught and held", async () => {
  const a = fakeAdapters({
    transcript: "upper case",
    deliver: () => {
      throw new Error("helper crashed");
    },
  });
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("hello"));
  assert.equal(result.status, "held");
  assert.equal(result.reason, "helper crashed");
});

test("a transcription failure is a failed outcome with the stage", async () => {
  const a = fakeAdapters();
  a.transcription.transcribe = async () => {
    throw new Error("whisper down");
  };
  const result = await createVoiceEditIntake(a).complete(WAV, ctx("x"));
  assert.deepEqual(result, { status: "failed", stage: "transcription", reason: "whisper down" });
});

test("no audio is empty", async () => {
  const result = await createVoiceEditIntake(fakeAdapters()).complete(Buffer.alloc(20), ctx("x"));
  assert.deepEqual(result, { status: "empty" });
});

test("an empty transcript is empty", async () => {
  const result = await createVoiceEditIntake(fakeAdapters({ transcript: "  " })).complete(WAV, ctx("x"));
  assert.deepEqual(result, { status: "empty" });
});

test("a missing selection is a failed outcome", async () => {
  const a = fakeAdapters();
  const result = await createVoiceEditIntake(a).complete(WAV, { selection: "", focusContext: { bundleId: "x", isOneLineField: false } });
  assert.equal(result.status, "failed");
  assert.equal(result.stage, "selection");
  assert.ok(!a.calls.some((c) => c[0] === "transcribe"));
});

test("completions process strictly FIFO", async () => {
  const order = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const a = fakeAdapters({ transcript: "upper case" });
  let first = true;
  a.transcription.transcribe = async () => {
    if (first) {
      first = false;
      await gate;
      order.push("first");
    } else {
      order.push("second");
    }
    return "upper case";
  };
  const intake = createVoiceEditIntake(a);
  const p1 = intake.complete(WAV, ctx("a"));
  const p2 = intake.complete(WAV, ctx("b"));
  release();
  await Promise.all([p1, p2]);
  assert.deepEqual(order, ["first", "second"]);
});

test("constructing without a transcription adapter throws", () => {
  assert.throws(() => createVoiceEditIntake({ delivery: { deliver: () => {} } }), /transcription\.transcribe/);
});
