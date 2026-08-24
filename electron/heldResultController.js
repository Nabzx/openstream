function createHeldResultController({ showHeldResult, hideHeldResult, writeClipboard }) {
  let heldText = null;

  return {
    hold(text) {
      heldText = text;
      showHeldResult(text);
    },

    copy() {
      if (heldText === null) return false;
      writeClipboard(heldText);
      return true;
    },

    dismiss() {
      if (heldText === null) return;
      heldText = null;
      hideHeldResult();
    },
  };
}

module.exports = { createHeldResultController };
