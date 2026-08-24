// Pure arithmetic, kept separate from main.js so it's testable without a
// running Electron instance. macOS's own dictation HUD anchors bottom-
// center, clear of the Dock - this computes the same spot for our overlay,
// given the target display's work area (which already excludes the Dock
// and menu bar) and the overlay window's size. See #116.
const BOTTOM_MARGIN_PX = 32;

function computeBottomCenteredPosition(workArea, windowWidth, windowHeight, marginPx = BOTTOM_MARGIN_PX) {
  const x = Math.round(workArea.x + (workArea.width - windowWidth) / 2);
  const y = Math.round(workArea.y + workArea.height - windowHeight - marginPx);
  return { x, y };
}

module.exports = { computeBottomCenteredPosition, BOTTOM_MARGIN_PX };
