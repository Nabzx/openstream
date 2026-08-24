const test = require("node:test");
const assert = require("node:assert/strict");
const { createHeldResultController } = require("./heldResultController");

test("holding a result shows its complete text without changing the clipboard", () => {
  const shown = [];
  const clipboardWrites = [];
  const controller = createHeldResultController({
    showHeldResult: (text) => shown.push(text),
    hideHeldResult() {},
    writeClipboard: (text) => clipboardWrites.push(text),
  });

  controller.hold("First paragraph.\n\nSecond paragraph.");

  assert.deepEqual(shown, ["First paragraph.\n\nSecond paragraph."]);
  assert.deepEqual(clipboardWrites, []);
});

test("copying is an explicit action and copies a held result only once per action", () => {
  const clipboardWrites = [];
  const controller = createHeldResultController({
    showHeldResult() {},
    hideHeldResult() {},
    writeClipboard: (text) => clipboardWrites.push(text),
  });

  assert.equal(controller.copy(), false);
  controller.hold("Complete finished text.");
  assert.equal(controller.copy(), true);
  assert.deepEqual(clipboardWrites, ["Complete finished text."]);
});

test("dismissing a held result prevents stale copies", () => {
  let hides = 0;
  const clipboardWrites = [];
  const controller = createHeldResultController({
    showHeldResult() {},
    hideHeldResult: () => hides++,
    writeClipboard: (text) => clipboardWrites.push(text),
  });

  controller.hold("Old dictation.");
  controller.dismiss();

  assert.equal(hides, 1);
  assert.equal(controller.copy(), false);
  assert.deepEqual(clipboardWrites, []);
});
