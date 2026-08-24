const status = document.querySelector("[data-status]");

window.openstreamOverlay.onStateChange((state) => {
  status.textContent = state === "recording" ? "Recording" : "Idle";
  document.body.dataset.state = state;
});
