const status = document.querySelector("[data-status]");
const bars = Array.from(document.querySelectorAll("[data-bar]"));
const heldText = document.querySelector("[data-held-text]");
const copyButton = document.querySelector("[data-copy]");
const dismissButton = document.querySelector("[data-dismiss]");

// The bars never drop to a flat line: while the mic is quiet they ride a
// slow ripple instead. `idleLevel()` is that ripple for the newest bar;
// the history shift below carries it across the row so it visibly
// travels, the same as real speech does.
const IDLE_LEVEL = 0.32;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function idleLevel() {
  if (reduceMotion.matches) return IDLE_LEVEL;
  return IDLE_LEVEL + 0.2 * Math.abs(Math.sin(Date.now() / 220));
}

// Each bar reads a slightly older point in the same real sound-level
// signal, so the wave visibly travels across the bars as you speak rather
// than every bar moving in lockstep - no decorative randomness, just a few
// samples of delay across a real, short history of the actual mic input.
const levelHistory = new Array(bars.length).fill(IDLE_LEVEL);

function setBars(levels) {
  bars.forEach((bar, i) => bar.style.setProperty("--level", levels[i]));
}

const STATUS_TEXT = { recording: "Listening", editing: "Editing" };

window.openstreamOverlay.onStateChange((state) => {
  document.body.dataset.state = state;
  // A voice-edit message (edit-message) sets its own status text; don't
  // stamp over it here.
  if (state !== "edit-message") {
    status.textContent = STATUS_TEXT[state] ?? "Idle";
  }
  if (state !== "recording") {
    levelHistory.fill(IDLE_LEVEL);
    setBars(levelHistory);
  }
});

// #17: a brief message after a voice edit that wasn't applied - an
// unrecognised command, or a selection that didn't fit the command.
window.openstreamOverlay.onVoiceEditMessage((text) => {
  status.textContent = text;
  document.body.dataset.state = "edit-message";
});

window.openstreamOverlay.onSoundLevel((level) => {
  // Typical speech RMS is well below 1 - expand it for a readable waveform
  // while retaining the normalized capture value on the IPC boundary.
  // Below the idle ripple, show the ripple instead of a flat floor.
  const speech = Math.min(1, level * 5);
  const visibleLevel = Math.max(idleLevel(), speech);
  levelHistory.push(visibleLevel);
  levelHistory.shift();
  setBars(levelHistory);
});

window.openstreamOverlay.onHeldResult((text) => {
  heldText.textContent = text;
  copyButton.textContent = "Copy";
  document.body.dataset.state = "held";
});

window.openstreamOverlay.onHeldResultCopied(() => {
  copyButton.textContent = "Copied";
});

copyButton.addEventListener("click", () => {
  window.openstreamOverlay.copyHeldResult();
});

dismissButton.addEventListener("click", () => {
  window.openstreamOverlay.dismissHeldResult();
});
