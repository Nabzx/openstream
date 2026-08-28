const STANDALONE_OPTION_KEY_CODE = 58;

const FUNCTION_KEY_CODES = Object.freeze({
  F1: 122,
  F2: 120,
  F3: 99,
  F4: 118,
  F5: 96,
  F6: 97,
  F7: 98,
  F8: 100,
  F9: 101,
  F10: 109,
  F11: 103,
  F12: 111,
  F13: 105,
  F14: 107,
  F15: 113,
  F16: 106,
  F17: 64,
  F18: 79,
  F19: 80,
});
const FUNCTION_KEY_CODE_SET = new Set(Object.values(FUNCTION_KEY_CODES));

function hasNoModifiers(shortcut) {
  return Array.isArray(shortcut?.modifiers) && shortcut.modifiers.length === 0;
}

function isStandaloneOptionShortcut(shortcut) {
  return (
    shortcut?.keyCode === STANDALONE_OPTION_KEY_CODE &&
    hasNoModifiers(shortcut)
  );
}

function isFunctionKeyShortcut(shortcut) {
  return hasNoModifiers(shortcut) && FUNCTION_KEY_CODE_SET.has(shortcut?.keyCode);
}

function isSupportedSingleKeyShortcut(shortcut) {
  return isStandaloneOptionShortcut(shortcut) || isFunctionKeyShortcut(shortcut);
}

module.exports = {
  STANDALONE_OPTION_KEY_CODE,
  FUNCTION_KEY_CODES,
  isStandaloneOptionShortcut,
  isFunctionKeyShortcut,
  isSupportedSingleKeyShortcut,
};
