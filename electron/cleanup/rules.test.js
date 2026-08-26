const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanup, parseNumberWords } = require("./rules");
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

test("converts explicit spoken emoji commands", () => {
  const cases = [
    ["that is great heart emoji", "That is great ❤️."],
    ["nice one thumbs up emoji", "Nice one 👍."],
    ["thumbs down emoji not for me", "👎 not for me."],
    ["that is so funny laughing emoji", "That is so funny 😂."],
    ["that movie made me cry crying emoji", "That movie made me cry 😢."],
    ["that party was fire emoji", "That party was 🔥."],
    ["we hit a hundred emoji nice", "We hit a 💯 nice."],
    ["one hundred emoji all round", "💯 all round."],
    ["smiley face emoji see you soon", "🙂 see you soon."],
    ["smiling face emoji good morning", "🙂 good morning."],
  ];

  for (const [raw, expected] of cases) {
    assert.equal(cleanup(raw), expected, raw);
  }
});

test("does not convert emoji words used as ordinary vocabulary", () => {
  // #131's whole design: every trigger requires the explicit word "emoji",
  // precisely because these words are common enough in ordinary narrative
  // prose that an unmarked trigger would misfire constantly.
  assert.equal(cleanup("my heart is racing right now"), "My heart is racing right now.");
  assert.equal(cleanup("the fire alarm went off"), "The fire alarm went off.");
  assert.equal(cleanup("she was laughing the whole time"), "She was laughing the whole time.");
  assert.equal(cleanup("he gave a thumbs up gesture"), "He gave a thumbs up gesture.");
  // "a hundred dollars" is correctly converted to "$100" by #130's currency
  // rule - a separate, later feature. That's the right behavior now, not a
  // regression: this test's job is only to confirm "hundred" alone never
  // becomes 💯 without the explicit word "emoji".
  assert.equal(cleanup("we need a hundred dollars"), "We need $100.");
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

test("handles spoken self-correction by discarding the preceding clause", () => {
  const cases = [
    ["buy milk, scratch that, buy oat milk", "Buy oat milk."],
    ["call the doctor, delete that, call the dentist", "Call the dentist."],
    ["scratch that, buy milk", "Buy milk."],
    [
      "get eggs, scratch that, get bacon, scratch that, get bread",
      "Get bread.",
    ],
  ];

  for (const [raw, expected] of cases) {
    assert.equal(cleanup(raw), expected, raw);
  }
});

test("does not treat 'delete that <noun>' as a correction command", () => {
  // #127's design: the trigger only fires when followed by a pause, not
  // more words in the same breath - "delete that file"/"delete that
  // branch" are extremely plausible dictated content in a dev tool.
  assert.equal(cleanup("please delete that file"), "Please delete that file.");
  assert.equal(cleanup("delete that branch before you push"), "Delete that branch before you push.");
});

test("self-correction: a trigger right after a finished sentence is a known limitation", () => {
  // Reaching back into an already-finished earlier sentence isn't
  // regex-matchable (see #127's scoping note) - the trigger phrase itself
  // is dropped as a safe no-op rather than guessing which sentence to
  // delete, leaving the mistaken sentence in place.
  assert.equal(
    cleanup("Call the client today. Scratch that. Call them tomorrow instead."),
    "Call the client today. Call them tomorrow instead."
  );
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

test("bullet point / new bullet start a markdown list, break-safe only", () => {
  const out = cleanup("shopping list bullet point milk bullet point eggs", { breakSafe: true });
  assert.equal(out, "Shopping list\n- Milk\n- Eggs.");

  const outAlt = cleanup("shopping list new bullet milk new bullet eggs", { breakSafe: true });
  assert.equal(outAlt, "Shopping list\n- Milk\n- Eggs.");
});

test("bullet point outside a break-safe app degrades to flowing prose, no dash leaks in", () => {
  const out = cleanup("shopping list bullet point milk bullet point eggs");
  assert.equal(out, "Shopping list milk eggs.");
  assert.ok(!out.includes("-"));
  assert.ok(!out.includes("\n"));
});

test("bullet point in a one-line field also degrades, even if the app is break-safe", () => {
  const out = cleanup("milk bullet point eggs", { breakSafe: true, oneLineBox: true });
  assert.equal(out, "Milk eggs");
});

test("converts spoken symbols", () => {
  const cases = [
    ["fifty percent off", "Fifty% off."],
    ["dollar sign fifty", "$fifty."],
    ["email me at john at sign gmail dot com", "Email me at john@gmail dot com."],
    ["share hashtag opensource", "Share #opensource."],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(cleanup(raw), expected, raw);
  }
});

test("converts spoken code-structure symbols", () => {
  const cases = [
    ["call open brace now close brace", "Call {now}."],
    ["call open bracket now close bracket", "Call [now]."],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(cleanup(raw), expected, raw);
  }
});

test("brace/bracket symbols don't regress paren, dash, or percent tidy-up", () => {
  assert.equal(cleanup("call open paren now close paren"), "Call (now).");
  assert.equal(cleanup("alpha dash beta"), "Alpha-beta.");
  assert.equal(cleanup("fifty percent off"), "Fifty% off.");
});

test("spoken tab/indent inserts a literal tab, break-safe gated like new line", () => {
  assert.equal(cleanup("say tab hello"), "Say tab hello.");
  assert.equal(
    cleanup("if open paren x close paren open brace new line tab return x new line close brace", {
      breakSafe: true,
    }),
    "If (x) {\n\tReturn x\n}."
  );
  assert.equal(
    cleanup("if open paren x close paren open brace tab return x new line close brace", {
      breakSafe: true,
    }),
    "If (x) {\treturn x\n}."
  );
  assert.equal(cleanup("new line tab tab deeply nested", { breakSafe: true }), "Deeply nested.");
  // Deny-by-default (#45 §3): outside a break-safe app, tab degrades to a
  // space, same as new line/new paragraph - and that space is then trimmed
  // from next to the braces, same as it already is next to parens.
  assert.equal(
    cleanup("if open paren x close paren open brace new line tab return x new line close brace"),
    "If (x) {return x}."
  );
});

test("does not treat ordinary uses of the word 'tab' as a command", () => {
  // Unlike open brace/bracket, "tab" is an ordinary, very common noun -
  // the trigger only fires at the start of a clause (start of input, or
  // right after ./!/?/,/{/[/( or a newline), where indentation actually
  // belongs, and where "switch to the other tab" never lands, since that
  // phrasing always has words before "tab" in the same clause.
  const cases = [
    "switch to the other tab",
    "open a new tab in chrome",
    "i have too many tabs open",
    "he picked up the tab for dinner",
    "keep tabs on this for me",
  ];
  for (const raw of cases) {
    assert.doesNotMatch(cleanup(raw, { breakSafe: true }), /\t/, raw);
  }
});

test("parseNumberWords: standard English number-word grammar up to the thousands", () => {
  assert.equal(parseNumberWords("twenty"), 20);
  assert.equal(parseNumberWords("one hundred and fifty"), 150);
  assert.equal(parseNumberWords("two thousand five hundred"), 2500);
  assert.equal(parseNumberWords("nineteen"), 19);
  assert.equal(parseNumberWords("not a number"), null, "unrecognised words must not be guessed at");
});

test("converts spoken currency (#130): dollars, cents, and combined amounts", () => {
  const cases = [
    ["it costs twenty dollars", "It costs $20."],
    ["it costs one hundred and fifty dollars", "It costs $150."],
    ["it costs two thousand five hundred dollars", "It costs $2500."],
    ["it costs twenty dollars and fifty cents", "It costs $20.50."],
    ["that will be fifty cents", "That will be $0.50."],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(cleanup(raw), expected, raw);
  }
});

test("currency conversion doesn't misfire on ordinary number words without a currency anchor", () => {
  assert.equal(cleanup("i have twenty of them"), "I have twenty of them.");
  assert.equal(cleanup("i need a bit more time"), "I need a bit more time.");
});

test("\"a\"/\"an\" as a number word means one, the same idiom as ordinary English", () => {
  assert.equal(cleanup("i only have a dollar to my name"), "I only have $1 to my name.");
  assert.equal(cleanup("that will cost a dollar and fifty cents"), "That will cost $1.50.");
});

test("quote ... end quote wraps the spoken span, unconditionally (no break-safe gating)", () => {
  assert.equal(cleanup("he said quote hello world end quote"), "He said \"hello world\".");
  // Not gated behind breakSafe, unlike a newline - a quote character carries
  // no functional risk in any app.
  assert.equal(
    cleanup("he said quote hello world end quote", { breakSafe: false }),
    "He said \"hello world\"."
  );
});

test("quote markers handle multiple separate pairs in one dictation", () => {
  assert.equal(cleanup("quote hello end quote and quote goodbye end quote"), "\"Hello\" and \"goodbye\".");
});

test("a quote opening a sentence still gets its content capitalised", () => {
  assert.equal(cleanup("quote welcome end quote to the show"), "\"Welcome\" to the show.");
});

test("an unclosed quote (no matching end quote) is left untouched rather than guessed at", () => {
  assert.equal(cleanup("he said quote hello"), "He said quote hello.");
});

test("bullet marker doesn't break unrelated dash/paren tidy-up", () => {
  assert.equal(cleanup("alpha dash beta"), "Alpha-beta.");
  assert.equal(cleanup("call open paren now close paren"), "Call (now).");
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
