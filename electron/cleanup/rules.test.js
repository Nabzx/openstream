const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanup } = require("./rules");
const samples = require("../../spike/llm-cleanup-latency/samples.json");

test("removes standalone and phrase fillers", () => {
  assert.equal(
    cleanup("um can you just uh run the test suite again"),
    "Can you just run the test suite again."
  );
  assert.equal(
    cleanup("I mean basically what I want is to ship it"),
    "What I want is to ship it."
  );
});

test("does not strip filler words that carry meaning", () => {
  assert.equal(cleanup("I like it a lot"), "I like it a lot.");
});

test("collapses stutters and repeats, including contractions", () => {
  assert.equal(cleanup("the the problem is is real"), "The problem is real.");
  assert.equal(cleanup("let's let's hold off"), "Let's hold off.");
  assert.equal(cleanup("we're we're optimizing early"), "We're optimizing early.");
});

test("converts spoken punctuation commands", () => {
  const cases = [
    ["run the tests period", "Run the tests."],
    ["run the tests full stop", "Run the tests."],
    ["is that right question mark", "Is that right?"],
    ["great work exclamation point", "Great work!"],
    ["great work exclamation mark", "Great work!"],
    ["wait comma really", "Wait, really."],
    ["items colon one semicolon two", "Items: one; two."],
    ["call open paren now close paren", "Call (now)."],
    ["alpha dash beta", "Alpha-beta."],
    ["path slash value", "Path/value."],
  ];

  for (const [raw, expected] of cases) {
    assert.equal(cleanup(raw), expected, raw);
  }
});

test("lets whisper's own inferred punctuation win on collision", () => {
  assert.equal(cleanup("are you sure period?"), "Are you sure?");
});

test("normalises whisper-server's hard line wraps", () => {
  assert.equal(cleanup("first part\nsecond part\nthird part"), "First part second part third part.");
});

test("applies technical vocabulary fixups", () => {
  const cases = [
    ["start the lama server", "Start the llama-server."],
    ["start the llama server", "Start the llama-server."],
    ["macos uses ram", "macOS uses RAM."],
    ["press the hot key", "Press the hotkey."],
    ["disable auto update", "Disable auto-update."],
    ["use rules based cleanup", "Use rules-based cleanup."],
    ["open git hub", "Open GitHub."],
    ["check the java script file", "Check the JavaScript file."],
    ["check the type script file", "Check the TypeScript file."],
  ];

  for (const [raw, expected] of cases) {
    assert.equal(cleanup(raw), expected, raw);
  }
});

test("capitalises sentence starts and bare i", () => {
  assert.equal(cleanup("i think i am ready"), "I think I am ready.");
});

test("adds a final full stop only when one isn't already there", () => {
  assert.equal(cleanup("is this ready question mark"), "Is this ready?");
  assert.equal(cleanup("needs a stop"), "Needs a stop.");
});

test("squeezes doubled whitespace", () => {
  assert.equal(cleanup("too    many     spaces"), "Too many spaces.");
});

test("one-line box: no sentence breaks, no final stop, no newline", () => {
  const out = cleanup("search for the config file new line", { oneLineBox: true });
  assert.equal(out, "Search for the config file");
  assert.ok(!out.includes("\n"));
  assert.ok(!out.endsWith("."));
});

test("break-safe deny-by-default: spoken newlines become spaces", () => {
  assert.equal(cleanup("first line new line second line"), "First line second line.");
  assert.equal(cleanup("first line new line second line", { breakSafe: false }), "First line second line.");
});

test("break-safe allow: spoken newlines become literal newlines", () => {
  const out = cleanup("first line new line second line", { breakSafe: true });
  assert.equal(out, "First line\nSecond line.");
});

test("one-line box overrides break-safe: still no newline", () => {
  const out = cleanup("first line new line second line", { breakSafe: true, oneLineBox: true });
  assert.ok(!out.includes("\n"));
});

test("segments long run-ons on conjunctions", () => {
  const out = cleanup(samples.find((s) => s.id === "sent-3").messy);
  assert.ok(out.includes(". "), "expected at least one inserted sentence break");
});

test("stays within the 0.1-1.0ms budget (#24/#45) on the longest sample", () => {
  const longest = samples.reduce((a, b) => (b.messy.length > a.messy.length ? b : a));
  for (let i = 0; i < 50; i++) cleanup(longest.messy); // warm up

  const iterations = 200;
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) cleanup(longest.messy);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6 / iterations;

  // Generous ceiling vs. the ~0.15ms measured locally, to absorb slower CI
  // hardware without being flaky - this guards against a real regression,
  // not against machine variance.
  assert.ok(elapsedMs < 5, `cleanup() averaged ${elapsedMs.toFixed(3)}ms, expected < 5ms`);
});

test("sweep over the spike sample set: coarse invariants hold", () => {
  for (const sample of samples) {
    const out = cleanup(sample.messy);
    assert.match(out, /^[A-Z]/, `${sample.id}: should start capitalised`);
    assert.match(out, /[.!?:]$/, `${sample.id}: should end with terminal punctuation`);
    assert.doesNotMatch(out, /\b(um|uh|erm)\b/i, `${sample.id}: filler word survived`);
    assert.doesNotMatch(out, /\b(\w+)\s+\1\b/i, `${sample.id}: doubled word survived`);
  }
});
