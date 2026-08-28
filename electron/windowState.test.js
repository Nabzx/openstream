const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeWindowBounds } = require("./windowState");

const WORK_AREA = { x: 0, y: 0, width: 1440, height: 900 };

test("returns the default size when there's nothing saved", () => {
  const bounds = sanitizeWindowBounds(null, WORK_AREA);
  assert.deepEqual(bounds, { width: 760, height: 580 });
});

test("restores a saved size and position unchanged when it fits on screen", () => {
  const bounds = sanitizeWindowBounds({ width: 900, height: 640, x: 120, y: 80 }, WORK_AREA);
  assert.deepEqual(bounds, { width: 900, height: 640, x: 120, y: 80 });
});

test("clamps a size below the minimum up to the minimum", () => {
  const bounds = sanitizeWindowBounds({ width: 200, height: 100 }, WORK_AREA);
  assert.deepEqual(bounds, { width: 560, height: 440 });
});

test("clamps a size larger than the display down to the work area", () => {
  const bounds = sanitizeWindowBounds({ width: 5000, height: 5000 }, WORK_AREA);
  assert.deepEqual(bounds, { width: 1440, height: 900 });
});

test("drops an off-screen position but keeps the size", () => {
  const bounds = sanitizeWindowBounds({ width: 760, height: 580, x: 3000, y: 40 }, WORK_AREA);
  assert.deepEqual(bounds, { width: 760, height: 580 });
});

test("drops a position that would put the title bar above the work area", () => {
  const bounds = sanitizeWindowBounds({ width: 760, height: 580, x: 40, y: -400 }, WORK_AREA);
  assert.deepEqual(bounds, { width: 760, height: 580 });
});

test("ignores non-finite saved values and uses defaults", () => {
  const bounds = sanitizeWindowBounds({ width: NaN, height: "tall", x: null }, WORK_AREA);
  assert.deepEqual(bounds, { width: 760, height: 580 });
});

test("keeps a position where the window is mostly off the left but still grabbable", () => {
  const bounds = sanitizeWindowBounds({ width: 760, height: 580, x: -600, y: 30 }, WORK_AREA);
  assert.deepEqual(bounds, { width: 760, height: 580, x: -600, y: 30 });
});
