const status = document.querySelector("[data-status]");
const levelMeter = document.querySelector("[data-sound-level]");
const heldText = document.querySelector("[data-held-text]");
const copyButton = document.querySelector("[data-copy]");
const dismissButton = document.querySelector("[data-dismiss]");

window.openstreamOverlay.onStateChange((state) => {
  status.textContent = state === "recording" ? "Recording" : "Idle";
  document.body.dataset.state = state;
  if (state !== "recording") levelMeter.style.setProperty("--sound-level", 0);
});

window.openstreamOverlay.onSoundLevel((level) => {
  // Typical speech RMS is well below 1. Expand it for a readable meter while
  // retaining the normalized capture value on the IPC boundary.
  const visibleLevel = Math.max(0.03, Math.min(1, level * 5));
  levelMeter.style.setProperty("--sound-level", visibleLevel);
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
