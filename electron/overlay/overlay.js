const status = document.querySelector("[data-status]");
const bars = Array.from(document.querySelectorAll("[data-bar]"));
const heldText = document.querySelector("[data-held-text]");
const copyButton = document.querySelector("[data-copy]");
const dismissButton = document.querySelector("[data-dismiss]");

const IDLE_LEVEL = 0.08;

// Each bar reads a slightly older point in the same real sound-level
// signal, so the wave visibly travels across the bars as you speak rather
// than every bar moving in lockstep - no decorative randomness, just a few
// samples of delay across a real, short history of the actual mic input.
const levelHistory = new Array(bars.length).fill(IDLE_LEVEL);

function setBars(levels) {
  bars.forEach((bar, i) => bar.style.setProperty("--level", levels[i]));
}

window.openstreamOverlay.onStateChange((state) => {
  status.textContent = state === "recording" ? "Listening" : "Idle";
  document.body.dataset.state = state;
  if (state !== "recording") {
    levelHistory.fill(IDLE_LEVEL);
    setBars(levelHistory);
  }
});

window.openstreamOverlay.onSoundLevel((level) => {
  // Typical speech RMS is well below 1 - expand it for a readable waveform
  // while retaining the normalized capture value on the IPC boundary.
  const visibleLevel = Math.max(IDLE_LEVEL, Math.min(1, level * 5));
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
