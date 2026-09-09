const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computeBottomCenteredPosition,
  computeOverlayPosition,
  OVERLAY_POSITIONS,
  BOTTOM_MARGIN_PX,
  EDGE_MARGIN_PX,
} = require("./overlayPosition");

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

test("#256: each anchor lands against the right edges of the work area", () => {
  const workArea = { x: 100, y: 50, width: 1440, height: 900 };
  const w = 180;
  const h = 52;
  const m = EDGE_MARGIN_PX;
  const left = 100 + m;
  const right = 100 + 1440 - w - m;
  const centreX = 100 + (1440 - w) / 2;
  const top = 50 + m;
  const bottom = 50 + 900 - h - m;

  assert.deepEqual(computeOverlayPosition(workArea, w, h, "bottom"), { x: Math.round(centreX), y: bottom });
  assert.deepEqual(computeOverlayPosition(workArea, w, h, "bottom-left"), { x: left, y: bottom });
  assert.deepEqual(computeOverlayPosition(workArea, w, h, "bottom-right"), { x: right, y: bottom });
  assert.deepEqual(computeOverlayPosition(workArea, w, h, "top"), { x: Math.round(centreX), y: top });
  assert.deepEqual(computeOverlayPosition(workArea, w, h, "top-left"), { x: left, y: top });
  assert.deepEqual(computeOverlayPosition(workArea, w, h, "top-right"), { x: right, y: top });
});

test("#256: an unknown position falls back to bottom-centre", () => {
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };
  assert.deepEqual(
    computeOverlayPosition(workArea, 180, 52, "sideways"),
    computeOverlayPosition(workArea, 180, 52, "bottom"),
  );
});

test("#256: OVERLAY_POSITIONS lists every anchor the picker offers", () => {
  assert.deepEqual(
    [...OVERLAY_POSITIONS].sort(),
    ["bottom", "bottom-left", "bottom-right", "top", "top-left", "top-right"],
  );
});
