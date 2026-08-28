const STANDALONE_OPTION_KEY_CODE = 58;
const STANDALONE_COMMAND_KEY_CODE = 55;
const STANDALONE_CONTROL_KEY_CODE = 59;
const STANDALONE_FN_KEY_CODE = 63;
const STANDALONE_CAPS_LOCK_KEY_CODE = 57;

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
const STANDALONE_KEY_CODES = new Set([
  STANDALONE_OPTION_KEY_CODE,
  STANDALONE_COMMAND_KEY_CODE,
  STANDALONE_CONTROL_KEY_CODE,
  STANDALONE_FN_KEY_CODE,
  STANDALONE_CAPS_LOCK_KEY_CODE,
  ...FUNCTION_KEY_CODE_SET,
]);

function hasNoModifiers(shortcut) {
  return Array.isArray(shortcut?.modifiers) && shortcut.modifiers.length === 0;
}

function isStandaloneShortcut(shortcut) {
  return Number.isInteger(shortcut?.keyCode) && STANDALONE_KEY_CODES.has(shortcut.keyCode) && hasNoModifiers(shortcut);
}

function isStandaloneOptionShortcut(shortcut) {
  return isStandaloneShortcut(shortcut) && shortcut.keyCode === STANDALONE_OPTION_KEY_CODE;
}

function isFunctionKeyShortcut(shortcut) {
  return hasNoModifiers(shortcut) && FUNCTION_KEY_CODE_SET.has(shortcut?.keyCode);
}

function isSupportedSingleKeyShortcut(shortcut) {
  return isStandaloneShortcut(shortcut) || isFunctionKeyShortcut(shortcut);
}

module.exports = {
  STANDALONE_OPTION_KEY_CODE,
  STANDALONE_COMMAND_KEY_CODE,
  STANDALONE_CONTROL_KEY_CODE,
  STANDALONE_FN_KEY_CODE,
  STANDALONE_CAPS_LOCK_KEY_CODE,
  FUNCTION_KEY_CODES,
  isStandaloneShortcut,
  isStandaloneOptionShortcut,
  isFunctionKeyShortcut,
  isSupportedSingleKeyShortcut,
};
