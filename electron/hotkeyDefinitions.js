const STANDALONE_OPTION_KEY_CODE = 58;

function isStandaloneOptionShortcut(shortcut) {
  return (
    shortcut?.keyCode === STANDALONE_OPTION_KEY_CODE &&
    Array.isArray(shortcut.modifiers) &&
    shortcut.modifiers.length === 0
  );
}

module.exports = {
  STANDALONE_OPTION_KEY_CODE,
  isStandaloneOptionShortcut,
};
