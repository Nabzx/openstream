// Pure geometry for restoring the desktop window's saved size and
// position (issue #212). Kept out of main.js so it can be tested without
// a real BrowserWindow or screen - main.js feeds it the saved bounds and
// the target display's work area, and gets back bounds that are always a
// sensible size and always at least partly on-screen.

const DEFAULTS = {
  defaultWidth: 820,
  defaultHeight: 640,
  minWidth: 560,
  minHeight: 440,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// `saved` is whatever came out of the settings file - possibly null,
// possibly stale (a display that's since been unplugged), possibly
// garbage. `workArea` is the target display's usable rectangle
// ({ x, y, width, height }). Returns { width, height } always, plus
// { x, y } only when the saved position still lands the window mostly
// on that display; otherwise the caller lets the window centre itself.
function sanitizeWindowBounds(saved, workArea, options = {}) {
  const { defaultWidth, defaultHeight, minWidth, minHeight } = { ...DEFAULTS, ...options };

  const maxWidth = Math.max(minWidth, workArea.width);
  const maxHeight = Math.max(minHeight, workArea.height);

  const rawWidth = Number.isFinite(saved?.width) ? saved.width : defaultWidth;
  const rawHeight = Number.isFinite(saved?.height) ? saved.height : defaultHeight;

  const bounds = {
    width: Math.round(clamp(rawWidth, minWidth, maxWidth)),
    height: Math.round(clamp(rawHeight, minHeight, maxHeight)),
  };

  if (!Number.isFinite(saved?.x) || !Number.isFinite(saved?.y)) return bounds;

  // Keep the position only if a decent chunk of the window's top edge
  // (where the traffic lights and drag strip are) stays within the work
  // area - enough that the user can always grab and move it.
  const visibleMargin = 80;
  const onScreenX =
    saved.x + bounds.width - visibleMargin > workArea.x &&
    saved.x + visibleMargin < workArea.x + workArea.width;
  const onScreenY =
    saved.y + visibleMargin < workArea.y + workArea.height && saved.y >= workArea.y - 0;

  if (!onScreenX || !onScreenY) return bounds;

  return { ...bounds, x: Math.round(saved.x), y: Math.round(saved.y) };
}

module.exports = { sanitizeWindowBounds, WINDOW_STATE_DEFAULTS: DEFAULTS };
