// Pure arithmetic, kept separate from main.js so it's testable without a
// running Electron instance. macOS's own dictation HUD anchors bottom-
// center, clear of the Dock - that's the default. #256 lets the user pick
// another edge or corner; the maths is the same, given the target display's
// work area (which already excludes the Dock and menu bar) and the overlay
// window's size. See #116 / #256.
const EDGE_MARGIN_PX = 32;
// Kept under the old name for callers that predate #256.
const BOTTOM_MARGIN_PX = EDGE_MARGIN_PX;

const OVERLAY_POSITIONS = ["bottom", "bottom-left", "bottom-right", "top", "top-left", "top-right"];
const DEFAULT_OVERLAY_POSITION = "bottom";

function computeOverlayPosition(
  workArea,
  windowWidth,
  windowHeight,
  position = DEFAULT_OVERLAY_POSITION,
  marginPx = EDGE_MARGIN_PX,
) {
  const vertical = String(position).startsWith("top") ? "top" : "bottom";
  const horizontal = String(position).endsWith("-left")
    ? "left"
    : String(position).endsWith("-right")
      ? "right"
      : "center";

  let x;
  if (horizontal === "left") x = workArea.x + marginPx;
  else if (horizontal === "right") x = workArea.x + workArea.width - windowWidth - marginPx;
  else x = workArea.x + (workArea.width - windowWidth) / 2;

  const y =
    vertical === "top"
      ? workArea.y + marginPx
      : workArea.y + workArea.height - windowHeight - marginPx;

  return { x: Math.round(x), y: Math.round(y) };
}

// The pre-#256 name - bottom-center, the default.
function computeBottomCenteredPosition(workArea, windowWidth, windowHeight, marginPx = EDGE_MARGIN_PX) {
  return computeOverlayPosition(workArea, windowWidth, windowHeight, DEFAULT_OVERLAY_POSITION, marginPx);
}

module.exports = {
  computeOverlayPosition,
  computeBottomCenteredPosition,
  OVERLAY_POSITIONS,
  DEFAULT_OVERLAY_POSITION,
  EDGE_MARGIN_PX,
  BOTTOM_MARGIN_PX,
};
