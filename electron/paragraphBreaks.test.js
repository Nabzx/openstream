const test = require("node:test");
const assert = require("node:assert/strict");
const {
  splitSentences,
  repairBreakIndices,
  repairListRange,
  renderStructuredText,
} = require("./paragraphBreaks");

test("splitSentences flattens newlines and trims to non-empty sentences", () => {
  assert.deepEqual(
    splitSentences("One thing.\n\nAnother thing! A third?  "),
    ["One thing.", "Another thing!", "A third?"],
  );
});

test("repairBreakIndices reads only the BREAKS line of the two-line contract", () => {
  const repair = repairBreakIndices("BREAKS: 3, 7\nLIST: 4-6", 9);
  assert.deepEqual(repair.indices, [3, 7]);
  assert.equal(repair.formatValid, true);
  assert.equal(repair.repairUsed, false);
});

test("repairBreakIndices still accepts an old-style bare reply", () => {
  const repair = repairBreakIndices("3, 7", 9);
  assert.deepEqual(repair.indices, [3, 7]);
  assert.equal(repair.formatValid, true);
});

test("repairBreakIndices does not scavenge digits out of the LIST line", () => {
  const repair = repairBreakIndices("LIST: 3-6", 9);
  assert.deepEqual(repair.indices, []);
  assert.equal(repair.formatValid, false);
});

test("repairBreakIndices drops out-of-range and sentence-1 indices and flags the repair", () => {
  const repair = repairBreakIndices("BREAKS: 1, 3, 99", 5);
  assert.deepEqual(repair.indices, [3]);
  assert.equal(repair.repairUsed, true);
});

test("repairListRange reads a clean sentence range", () => {
  assert.deepEqual(repairListRange("BREAKS: none\nLIST: 3-6", 9), {
    range: [3, 6],
    formatValid: true,
    repairUsed: false,
  });
});

test("repairListRange treats LIST: none as a clean decline", () => {
  assert.deepEqual(repairListRange("BREAKS: 2\nLIST: none", 9), {
    range: null,
    formatValid: true,
    repairUsed: false,
  });
});

test("repairListRange makes no list claim for a short-form reply", () => {
  assert.deepEqual(repairListRange("2, 5", 9), {
    range: null,
    formatValid: true,
    repairUsed: false,
  });
});

test("repairListRange fails closed on an unreadable LIST line", () => {
  assert.deepEqual(repairListRange("BREAKS: none\nLIST: the shopping bit", 9), {
    range: null,
    formatValid: false,
    repairUsed: false,
  });
});

test("repairListRange fails closed on an empty LIST line", () => {
  assert.deepEqual(repairListRange("BREAKS: none\nLIST:", 9), {
    range: null,
    formatValid: false,
    repairUsed: false,
  });
});

test("repairListRange clamps an over-long range into the text and flags the repair", () => {
  assert.deepEqual(repairListRange("LIST: 3-40", 6), {
    range: [3, 6],
    formatValid: true,
    repairUsed: true,
  });
});

test("repairListRange orders a reversed range", () => {
  assert.deepEqual(repairListRange("LIST: 7-3", 9), {
    range: [3, 7],
    formatValid: true,
    repairUsed: false,
  });
});

test("repairListRange rejects a range that collapses to fewer than two items", () => {
  assert.deepEqual(repairListRange("LIST: 9-40", 9), {
    range: null,
    formatValid: true,
    repairUsed: false,
  });
});

test("renderStructuredText with no list range is plain paragraph breaks", () => {
  const sentences = ["One.", "Two.", "Three.", "Four."];
  assert.equal(
    renderStructuredText(sentences, { breakIndices: [3] }),
    "One. Two.\n\nThree. Four.",
  );
});

test("renderStructuredText sets a list off from the prose on both sides", () => {
  const sentences = ["Here is the plan.", "Book the room.", "Send the invite.", "Prep the deck.", "See you there."];
  assert.equal(
    renderStructuredText(sentences, { breakIndices: [], listRange: [2, 4] }),
    "Here is the plan.\n\n- Book the room.\n- Send the invite.\n- Prep the deck.\n\nSee you there.",
  );
});

test("renderStructuredText drops breaks inside the list but keeps a trailing one", () => {
  const sentences = ["Intro.", "Item one.", "Item two.", "Next.", "Topic two.", "End."];
  assert.equal(
    renderStructuredText(sentences, { breakIndices: [3, 5], listRange: [2, 3] }),
    "Intro.\n\n- Item one.\n- Item two.\n\nNext.\n\nTopic two. End.",
  );
});

test("renderStructuredText handles a list that runs to the end", () => {
  const sentences = ["Shopping.", "Milk.", "Eggs.", "Bread."];
  assert.equal(
    renderStructuredText(sentences, { listRange: [2, 4] }),
    "Shopping.\n\n- Milk.\n- Eggs.\n- Bread.",
  );
});
