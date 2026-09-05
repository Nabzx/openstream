const test = require("node:test");
const assert = require("node:assert/strict");
const { createDictationIntake } = require("./dictationCoordinator");

const completedWav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40), Buffer.from([1, 2])]);

function wavWithMarker(marker) {
  return Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40), Buffer.from(marker)]);
}

function createIntake({
  bundleId = "com.apple.TextEdit",
  isOneLineField = false,
  transcript = "hello world",
  breakReply = "none",
  transcribe,
  getFocusContext,
  placeParagraphBreaks,
  deliver,
  vocabulary,
  onDiagnostic,
  listDetection,
  // #375: undefined = no clipboard adapter wired at all.
  clipboardText,
} = {}) {
  const diagnostics = [];
  const delivered = [];
  const breakCalls = [];

  const intake = createDictationIntake({
    transcription: {
      transcribe: transcribe || (async () => transcript),
    },
    contextDetection: {
      getFocusContext: getFocusContext || (async () => ({ bundleId, isOneLineField })),
    },
    breakPlacement: {
      placeParagraphBreaks: placeParagraphBreaks || (async (sentences) => {
        breakCalls.push(sentences);
        return breakReply;
      }),
    },
    delivery: {
      deliver: deliver || (async (text) => {
        delivered.push(text);
        return { kind: "inserted" };
      }),
    },
    vocabulary,
    onDiagnostic: onDiagnostic || ((name, value) => diagnostics.push([name, value])),
    listDetection,
    clipboard: clipboardText !== undefined ? { readText: () => clipboardText } : null,
  });

  return { intake, diagnostics, delivered, breakCalls };
}

async function deliveredText(options) {
  const harness = createIntake(options);
  const result = await harness.intake.complete(completedWav);
  return { result, delivered: harness.delivered, breakCalls: harness.breakCalls };
}

test("completed recording is transcribed, cleaned, and delivered once", async () => {
  const transcriptionCalls = [];
  const contextCalls = [];
  const harness = createIntake({
    transcript: "um git hub new line java script",
    transcribe: async (wavBuffer) => {
      transcriptionCalls.push(wavBuffer);
      return "um git hub new line java script";
    },
    getFocusContext: async () => {
      contextCalls.push(true);
      return { bundleId: "com.apple.TextEdit", isOneLineField: false };
    },
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, { status: "delivered", text: "GitHub\nJavaScript." });
  assert.deepEqual(transcriptionCalls, [completedWav]);
  assert.equal(contextCalls.length, 1);
  assert.deepEqual(harness.delivered, ["GitHub\nJavaScript."]);
});

test("#16: the vocabulary adapter's prompt is passed to transcribe", async () => {
  const transcriptionCalls = [];
  const harness = createIntake({
    transcribe: async (wavBuffer, prompt) => {
      transcriptionCalls.push(prompt);
      return "hello world";
    },
    vocabulary: { getPrompt: () => "useEffect, useState" },
  });

  await harness.intake.complete(completedWav);

  assert.deepEqual(transcriptionCalls, ["useEffect, useState"]);
});

test("#16: with no vocabulary adapter configured, transcribe gets an empty prompt", async () => {
  const transcriptionCalls = [];
  const harness = createIntake({
    transcribe: async (wavBuffer, prompt) => {
      transcriptionCalls.push(prompt);
      return "hello world";
    },
  });

  await harness.intake.complete(completedWav);

  assert.deepEqual(transcriptionCalls, [""]);
});

test("a known unsafe application never receives spoken line breaks", async () => {
  const { result, delivered } = await deliveredText({
    bundleId: "com.apple.Terminal",
    transcript: "first line new line second line",
  });

  assert.deepEqual(result, { status: "delivered", text: "First line second line." });
  assert.deepEqual(delivered, ["First line second line."]);
});

test("an unlisted application fails closed for spoken line breaks", async () => {
  const { result, delivered } = await deliveredText({
    bundleId: "dev.openstream.UnknownApplication",
    transcript: "first line new paragraph second line",
  });

  assert.deepEqual(result, { status: "delivered", text: "First line second line." });
  assert.deepEqual(delivered, ["First line second line."]);
});

test("a one-line field removes line breaks and its final full stop in a break-safe application", async () => {
  const { result, delivered } = await deliveredText({
    isOneLineField: true,
    transcript: "first line new line second line period",
  });

  assert.deepEqual(result, { status: "delivered", text: "First line second line" });
  assert.deepEqual(delivered, ["First line second line"]);
});

test("a not-AX-ready context (#181) delivers as one paragraph and records the fallback", async () => {
  let breakCalls = 0;
  const harness = createIntake({
    transcript: "first topic. still first topic. second topic. more on the second topic.",
    getFocusContext: async () => ({ bundleId: "com.apple.TextEdit", isOneLineField: true, axReady: false }),
    placeParagraphBreaks: async () => {
      breakCalls++;
      return "3";
    },
  });

  const result = await harness.intake.complete(completedWav);

  // isOneLineField:true is only a guess when axReady is false, so it no
  // longer drives automatic break placement - that stays off (breakCalls
  // 0) - and with no spoken break command in the transcript there are no
  // line breaks to emit anyway.
  assert.equal(breakCalls, 0);
  assert.equal(result.status, "delivered");
  assert.ok(!result.text.includes("\n"));
  assert.ok(harness.diagnostics.some(([name, value]) => name === "context.axReady" && value === false));
});

test("#307: a spoken break command survives an AX guess in a break-safe app", async () => {
  const harness = createIntake({
    // The Notes repro: the body isn't AX-ready yet, so isOneLineField is a
    // guessed "true". Notes is break-safe, so an explicit spoken command
    // must still land rather than degrade to a space.
    transcript: "hi my name is Nabil new paragraph my name is Bob",
    getFocusContext: async () => ({ bundleId: "com.apple.Notes", isOneLineField: true, axReady: false }),
  });

  const result = await harness.intake.complete(completedWav);

  assert.equal(result.status, "delivered");
  assert.ok(result.text.includes("\n\n"), `expected a paragraph break, got ${JSON.stringify(result.text)}`);
  assert.ok(
    harness.diagnostics.some(
      ([name, value]) => name === "context.oneLineGuessOverridden" && value === "com.apple.Notes",
    ),
  );
});

test("#307: a real one-line field (axReady) still strips a spoken break command", async () => {
  const harness = createIntake({
    // axReady true means isOneLineField is a real role read, not a guess -
    // a genuine single-line box, so the break must not land.
    transcript: "hi my name is Nabil new paragraph my name is Bob",
    getFocusContext: async () => ({ bundleId: "com.apple.Notes", isOneLineField: true, axReady: true }),
  });

  const result = await harness.intake.complete(completedWav);

  assert.equal(result.status, "delivered");
  assert.ok(!result.text.includes("\n"));
  assert.ok(
    !harness.diagnostics.some(([name]) => name === "context.oneLineGuessOverridden"),
  );
});

test("eligible long dictation sends cleaned sentences once and applies returned break indices", async () => {
  const harness = createIntake({
    transcript: "first topic. still first topic. second topic. more on the second topic.",
    breakReply: "3",
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(harness.breakCalls, [[
    "First topic.",
    "Still first topic.",
    "Second topic.",
    "More on the second topic.",
  ]]);
  assert.deepEqual(result, {
    status: "delivered",
    text: "First topic. Still first topic.\n\nSecond topic. More on the second topic.",
  });
  assert.deepEqual(harness.delivered, [
    "First topic. Still first topic.\n\nSecond topic. More on the second topic.",
  ]);
});

test("short, break-unsafe, one-line, and explicit-break dictations skip break placement", async () => {
  let calls = 0;
  const breakPlacement = async () => {
    calls++;
    return "2";
  };

  const short = createIntake({
    transcript: "first sentence. second sentence.",
    placeParagraphBreaks: breakPlacement,
  });
  const unsafe = createIntake({
    bundleId: "com.apple.Terminal",
    transcript: "first sentence. second sentence. third sentence.",
    placeParagraphBreaks: breakPlacement,
  });
  const oneLine = createIntake({
    isOneLineField: true,
    transcript: "first sentence. second sentence. third sentence.",
    placeParagraphBreaks: breakPlacement,
  });
  const explicit = createIntake({
    transcript: "first sentence new paragraph second sentence. third sentence. fourth sentence.",
    placeParagraphBreaks: breakPlacement,
  });

  await short.intake.complete(completedWav);
  await unsafe.intake.complete(completedWav);
  await oneLine.intake.complete(completedWav);
  const explicitResult = await explicit.intake.complete(completedWav);

  assert.equal(calls, 0);
  assert.deepEqual(explicitResult, {
    status: "delivered",
    text: "First sentence\n\nSecond sentence. Third sentence. Fourth sentence.",
  });
});

test("repairs malformed break indices without retrying and records format and repair separately", async () => {
  let calls = 0;
  const harness = createIntake({
    transcript: "first sentence. second sentence. third sentence. fourth sentence.",
    placeParagraphBreaks: async () => {
      calls++;
      return "Break before -2, 3.5, 1, 3, 3, and 99.";
    },
  });

  const result = await harness.intake.complete(completedWav);

  assert.equal(calls, 1);
  assert.deepEqual(result, {
    status: "delivered",
    text: "First sentence. Second sentence.\n\nThird sentence. Fourth sentence.",
  });
  assert.deepEqual(harness.diagnostics, [
    ["vocabulary.promptLength", 0],
    ["context.bundleId", "com.apple.TextEdit"],
    ["context.axReady", true],
    ["context.breakSafe", true],
    ["context.oneLineField", false],
    ["paragraphBreaks.formatValid", false],
    ["paragraphBreaks.repairUsed", true],
    ["listBoundaries.formatValid", true],
    ["listBoundaries.repairUsed", false],
  ]);
});

test("a break reply with no usable indices falls back to one paragraph", async () => {
  const { result, delivered } = await deliveredText({
    transcript: "first sentence. second sentence. third sentence.",
    breakReply: "-2, 2.5, 1, 9, 9",
  });

  assert.deepEqual(result, {
    status: "delivered",
    text: "First sentence. Second sentence. Third sentence.",
  });
  assert.deepEqual(delivered, ["First sentence. Second sentence. Third sentence."]);
});

test("break-placement failure falls back to one paragraph without retrying", async () => {
  let calls = 0;
  const { result, delivered } = await deliveredText({
    transcript: "first sentence. second sentence. third sentence.",
    placeParagraphBreaks: async () => {
      calls++;
      throw new Error("rewrite server unavailable");
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, {
    status: "delivered",
    text: "First sentence. Second sentence. Third sentence.",
  });
  assert.deepEqual(delivered, ["First sentence. Second sentence. Third sentence."]);
});

test("a flagged spoken list renders as bullets set off from the surrounding prose", async () => {
  const harness = createIntake({
    listDetection: true,
    transcript: "here is my shopping list. buy milk. buy eggs. buy bread.",
    breakReply: "BREAKS: none\nLIST: 2-4",
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, {
    status: "delivered",
    text: "Here is my shopping list.\n\n- Buy milk.\n- Buy eggs.\n- Buy bread.",
  });
  assert.deepEqual(harness.diagnostics, [
    ["vocabulary.promptLength", 0],
    ["context.bundleId", "com.apple.TextEdit"],
    ["context.axReady", true],
    ["context.breakSafe", true],
    ["context.oneLineField", false],
    ["paragraphBreaks.formatValid", true],
    ["paragraphBreaks.repairUsed", false],
    ["listBoundaries.formatValid", true],
    ["listBoundaries.repairUsed", false],
  ]);
});

test("an out-of-range list range is clamped into the text and recorded as repaired", async () => {
  const harness = createIntake({
    listDetection: true,
    transcript: "first sentence. second sentence. third sentence. fourth sentence.",
    breakReply: "BREAKS: none\nLIST: 2-99",
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, {
    status: "delivered",
    text: "First sentence.\n\n- Second sentence.\n- Third sentence.\n- Fourth sentence.",
  });
  assert.deepEqual(harness.diagnostics, [
    ["vocabulary.promptLength", 0],
    ["context.bundleId", "com.apple.TextEdit"],
    ["context.axReady", true],
    ["context.breakSafe", true],
    ["context.oneLineField", false],
    ["paragraphBreaks.formatValid", true],
    ["paragraphBreaks.repairUsed", false],
    ["listBoundaries.formatValid", true],
    ["listBoundaries.repairUsed", true],
  ]);
});

test("a malformed LIST line fails closed to prose without dropping paragraph breaks", async () => {
  const harness = createIntake({
    listDetection: true,
    transcript: "first sentence. second sentence. third sentence. fourth sentence.",
    breakReply: "BREAKS: 3\nLIST: the middle bit",
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, {
    status: "delivered",
    text: "First sentence. Second sentence.\n\nThird sentence. Fourth sentence.",
  });
  assert.deepEqual(harness.diagnostics, [
    ["vocabulary.promptLength", 0],
    ["context.bundleId", "com.apple.TextEdit"],
    ["context.axReady", true],
    ["context.breakSafe", true],
    ["context.oneLineField", false],
    ["paragraphBreaks.formatValid", true],
    ["paragraphBreaks.repairUsed", false],
    ["listBoundaries.formatValid", false],
    ["listBoundaries.repairUsed", false],
  ]);
});

test("list detection is off by default: a valid range is parsed and reported but not rendered", async () => {
  const harness = createIntake({
    transcript: "here is my shopping list. buy milk. buy eggs. buy bread.",
    breakReply: "BREAKS: none\nLIST: 2-4",
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, {
    status: "delivered",
    text: "Here is my shopping list. Buy milk. Buy eggs. Buy bread.",
  });
  assert.deepEqual(harness.diagnostics, [
    ["vocabulary.promptLength", 0],
    ["context.bundleId", "com.apple.TextEdit"],
    ["context.axReady", true],
    ["context.breakSafe", true],
    ["context.oneLineField", false],
    ["paragraphBreaks.formatValid", true],
    ["paragraphBreaks.repairUsed", false],
    ["listBoundaries.formatValid", true],
    ["listBoundaries.repairUsed", false],
  ]);
});

test("empty recordings do not call transcription or delivery", async () => {
  let transcribeCalls = 0;
  let deliveryCalls = 0;
  const harness = createIntake({
    transcribe: async () => {
      transcribeCalls++;
      return "unexpected";
    },
    deliver: async () => {
      deliveryCalls++;
      return { kind: "inserted" };
    },
  });

  const result = await harness.intake.complete(Buffer.alloc(44));

  assert.deepEqual(result, { status: "empty" });
  assert.equal(transcribeCalls, 0);
  assert.equal(deliveryCalls, 0);
});

test("no-speech transcription leaves the target application unchanged", async () => {
  let deliveryCalls = 0;
  const harness = createIntake({
    transcribe: async () => "   ",
    deliver: async () => {
      deliveryCalls++;
      return { kind: "inserted" };
    },
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, { status: "no-speech" });
  assert.equal(deliveryCalls, 0);
});

test("transcription failure does not insert partial output", async () => {
  let deliveryCalls = 0;
  const harness = createIntake({
    transcribe: async () => {
      throw new Error("server unavailable");
    },
    deliver: async () => {
      deliveryCalls++;
      return { kind: "inserted" };
    },
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, {
    status: "failed",
    stage: "transcription",
    reason: "server unavailable",
  });
  assert.equal(deliveryCalls, 0);
});

test("context detection failure holds the transcript instead of dropping it (#227)", async () => {
  let deliveryCalls = 0;
  const harness = createIntake({
    getFocusContext: async () => {
      throw new Error("accessibility unavailable");
    },
    deliver: async () => {
      deliveryCalls++;
      return { kind: "inserted" };
    },
  });

  const result = await harness.intake.complete(completedWav);

  // We have the words, we just don't know where they go - that's "held",
  // not a silent failure. Cleaned with the safe defaults (no line breaks).
  assert.equal(result.status, "held");
  assert.equal(result.text, "Hello world.");
  assert.match(result.reason, /couldn't read the focused field: accessibility unavailable/);
  assert.equal(deliveryCalls, 0, "a context failure never reaches delivery");
  assert.ok(
    harness.diagnostics.some(([name, value]) => name === "context.failure" && value === "accessibility unavailable"),
  );
});

test("#355: a different frontmost app than record start holds instead of delivering", async () => {
  let deliveryCalls = 0;
  const harness = createIntake({
    bundleId: "com.apple.Terminal",
    deliver: async () => {
      deliveryCalls++;
      return { kind: "inserted" };
    },
  });

  const result = await harness.intake.complete(completedWav, "com.apple.TextEdit");

  // The lazygit case: the words are innocent, the destination isn't - held,
  // not delivered into whatever is frontmost now.
  assert.equal(result.status, "held");
  assert.equal(result.text, "Hello world.");
  assert.match(
    result.reason,
    /the frontmost app changed while you were dictating \(was com\.apple\.TextEdit, now com\.apple\.Terminal\)/,
  );
  assert.equal(deliveryCalls, 0, "a mid-dictation app switch never reaches delivery");
  assert.ok(
    harness.diagnostics.some(
      ([name, value]) => name === "context.appSwitchedDuringDictation" && value === "com.apple.TextEdit -> com.apple.Terminal",
    ),
  );
});

test("#355: the same frontmost app at record start and at delivery proceeds normally", async () => {
  const harness = createIntake({ bundleId: "com.apple.TextEdit" });

  const result = await harness.intake.complete(completedWav, "com.apple.TextEdit");

  assert.equal(result.status, "delivered");
  assert.deepEqual(harness.delivered, ["Hello world."]);
});

test("#355: no record-start bundle id means the check is skipped entirely", async () => {
  const harness = createIntake({ bundleId: "com.apple.Terminal" });

  const result = await harness.intake.complete(completedWav);

  assert.equal(result.status, "delivered", "existing callers that don't track record start are unaffected");
});

test("#355: delivery gets the bundle id just confirmed as frontmost", async () => {
  const receivedArgs = [];
  const harness = createIntake({
    bundleId: "com.apple.Notes",
    deliver: async (...args) => {
      receivedArgs.push(args);
      return { kind: "inserted" };
    },
  });

  await harness.intake.complete(completedWav, "com.apple.Notes");

  assert.deepEqual(receivedArgs, [["Hello world.", "com.apple.Notes"]]);
});

test("#375: a bare \"paste\" puts the clipboard at the cursor, not the word", async () => {
  const args = [];
  const harness = createIntake({
    transcript: "paste",
    clipboardText: "text from the clipboard",
    deliver: async (...a) => {
      args.push(a);
      return { kind: "inserted" };
    },
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, { status: "pasted", text: "text from the clipboard" });
  assert.deepEqual(args, [["text from the clipboard", "com.apple.TextEdit"]]);
});

test("#375: the aliases match; extra words do not", async () => {
  for (const spoken of ["paste", "Paste.", "paste that", "paste the clipboard"]) {
    const harness = createIntake({ transcript: spoken, clipboardText: "x" });
    assert.equal((await harness.intake.complete(completedWav)).status, "pasted", spoken);
  }
  const dictated = createIntake({ transcript: "paste the report into the doc", clipboardText: "x" });
  const result = await dictated.intake.complete(completedWav);
  assert.equal(result.status, "delivered", "a sentence with 'paste' in it is ordinary dictation");
  assert.deepEqual(dictated.delivered, ["Paste the report into the doc."]);
});

test("#375: multi-line clipboard is held in a non-break-safe app, delivered in a break-safe one", async () => {
  let deliveries = 0;
  const held = createIntake({
    transcript: "paste",
    bundleId: "com.apple.Terminal",
    clipboardText: "line one\nline two",
    deliver: async () => {
      deliveries++;
      return { kind: "inserted" };
    },
  });
  const heldResult = await held.intake.complete(completedWav);
  assert.equal(heldResult.status, "held");
  assert.equal(heldResult.text, "line one\nline two");
  assert.match(heldResult.reason, /line break there could run a command/);
  assert.equal(deliveries, 0);

  const ok = createIntake({ transcript: "paste", bundleId: "com.apple.TextEdit", clipboardText: "line one\nline two" });
  assert.equal((await ok.intake.complete(completedWav)).status, "pasted");
});

test("#375: a single-line clipboard pastes even in a terminal", async () => {
  const harness = createIntake({
    transcript: "paste",
    bundleId: "com.apple.Terminal",
    clipboardText: "npm run build",
  });
  assert.equal((await harness.intake.complete(completedWav)).status, "pasted");
});

test("#375: nothing or too much on the clipboard is a message, not a paste", async () => {
  const empty = createIntake({ transcript: "paste", clipboardText: "" });
  const emptyResult = await empty.intake.complete(completedWav);
  assert.equal(emptyResult.status, "info");
  assert.match(emptyResult.message, /Nothing on the clipboard/);

  const huge = createIntake({ transcript: "paste", clipboardText: "x".repeat(10001) });
  const hugeResult = await huge.intake.complete(completedWav);
  assert.equal(hugeResult.status, "info");
  assert.match(hugeResult.message, /too big/);
});

test("#375: with no clipboard adapter, \"paste\" is just dictation", async () => {
  const harness = createIntake({ transcript: "paste" });
  const result = await harness.intake.complete(completedWav);
  assert.equal(result.status, "delivered");
  assert.deepEqual(harness.delivered, ["Paste."]);
});

test("delivery failure holds the complete finished text without retrying delivery", async () => {
  let deliveryCalls = 0;
  const harness = createIntake({
    deliver: async () => {
      deliveryCalls++;
      throw new Error("accessibility helper timed out");
    },
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, {
    status: "held",
    text: "Hello world.",
    reason: "accessibility helper timed out",
  });
  assert.equal(deliveryCalls, 1);
});

test("held delivery preserves the complete finished text without retrying delivery", async () => {
  const delivered = [];
  const harness = createIntake({
    deliver: async (text) => {
      delivered.push(text);
      return { kind: "held", reason: "unverified target" };
    },
  });

  const result = await harness.intake.complete(completedWav);

  assert.deepEqual(result, {
    status: "held",
    text: "Hello world.",
    reason: "unverified target",
  });
  assert.deepEqual(delivered, ["Hello world."]);
});

test("completed recordings are processed and delivered in FIFO order", async () => {
  const firstTranscription = {};
  const firstTranscriptionReady = new Promise((resolve) => {
    firstTranscription.release = resolve;
  });
  const order = [];
  const harness = createIntake({
    transcribe: async (wavBuffer) => {
      const label = String.fromCharCode(wavBuffer[44]);
      order.push(`transcribe:${label}`);
      if (label === "a") await firstTranscriptionReady;
      return label === "a" ? "first result" : "second result";
    },
    deliver: async (text) => {
      order.push(`deliver:${text}`);
      return { kind: "inserted" };
    },
  });
  const firstWav = wavWithMarker("a");
  const secondWav = wavWithMarker("b");

  const first = harness.intake.complete(firstWav);
  const second = harness.intake.complete(secondWav);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(order, ["transcribe:a"]);
  firstTranscription.release();
  const results = await Promise.all([first, second]);

  assert.deepEqual(results, [
    { status: "delivered", text: "First result." },
    { status: "delivered", text: "Second result." },
  ]);
  assert.deepEqual(order, [
    "transcribe:a",
    "deliver:First result.",
    "transcribe:b",
    "deliver:Second result.",
  ]);
});

test("a failed recording does not stop later queued recordings", async () => {
  const transcribeCalls = [];
  const harness = createIntake({
    transcribe: async (wavBuffer) => {
      const label = String.fromCharCode(wavBuffer[44]);
      transcribeCalls.push(label);
      if (label === "a") throw new Error("first server failure");
      return "second result";
    },
  });
  const firstWav = wavWithMarker("a");
  const secondWav = wavWithMarker("b");

  const results = await Promise.all([
    harness.intake.complete(firstWav),
    harness.intake.complete(secondWav),
  ]);

  assert.deepEqual(transcribeCalls, ["a", "b"]);
  assert.deepEqual(results, [
    { status: "failed", stage: "transcription", reason: "first server failure" },
    { status: "delivered", text: "Second result." },
  ]);
});
