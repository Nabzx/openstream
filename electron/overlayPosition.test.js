const test = require("node:test");
const assert = require("node:assert/strict");
const { computeBottomCenteredPosition, BOTTOM_MARGIN_PX } = require("./overlayPosition");

test("centers horizontally within the work area", () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  const { x } = computeBottomCenteredPosition(workArea, 180, 52);
  assert.equal(x, (1440 - 180) / 2);
});

test("sits just above the bottom edge of the work area, clear of the Dock", () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  const { y } = computeBottomCenteredPosition(workArea, 180, 52);
  assert.equal(y, 900 - 52 - BOTTOM_MARGIN_PX);
});

test("accounts for a work area offset from the display origin", () => {
  // A secondary display sitting to the right of the primary, or a menu bar
  // display whose work area doesn't start at (0, 0).
  const workArea = { x: 1440, y: 25, width: 1920, height: 1055 };
  const position = computeBottomCenteredPosition(workArea, 180, 52);
  assert.equal(position.x, 1440 + (1920 - 180) / 2);
  assert.equal(position.y, 25 + 1055 - 52 - BOTTOM_MARGIN_PX);
});

test("a custom margin overrides the default", () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  const { y } = computeBottomCenteredPosition(workArea, 180, 52, 0);
  assert.equal(y, 900 - 52);
});
