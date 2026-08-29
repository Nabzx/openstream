const test = require("node:test");
const assert = require("node:assert/strict");
const { createFnShortcutCapture } = require("./shortcutCaptureController");
const { STANDALONE_FN_KEY_CODE } = require("./hotkeyDefinitions");

const FN_HOTKEY = { keyCode: STANDALONE_FN_KEY_CODE, modifiers: [] };

function fakeHelperFactory() {
  const helpers = [];
  return {
    helpers,
    createHelper(options) {
      const helper = {
        options,
        stopped: false,
        onDown: () => {},
        onUp: () => {},
        start: () => Promise.resolve(),
        stop() {
          this.stopped = true;
        },
        isReady: () => true,
        isRunning: () => !this.stopped,
        onKeyDown(callback) {
          this.onDown = callback;
        },
        onKeyUp(callback) {
          this.onUp = callback;
        },
        emitDown() {
          this.onDown();
        },
        emitUp() {
          this.onUp();
        },
      };
      helpers.push(helper);
      return helper;
    },
  };
}

test("captures a native Fn press and stops listening after one candidate", async () => {
  const factory = fakeHelperFactory();
  const captured = [];
  const controller = createFnShortcutCapture({
    createHelper: factory.createHelper,
    onCaptured: (shortcut) => captured.push(shortcut),
  });

  await controller.start();
  const helper = factory.helpers[0];
  assert.deepEqual(helper.options, { hotkey: FN_HOTKEY, restartOnFailure: false });

  helper.emitDown();
  helper.emitDown();
  helper.emitUp();

  assert.deepEqual(captured, [FN_HOTKEY]);
  assert.equal(helper.stopped, true);
});

test("stopping native capture prevents a later Fn event from being selected", async () => {
  const factory = fakeHelperFactory();
  const captured = [];
  const controller = createFnShortcutCapture({
    createHelper: factory.createHelper,
    onCaptured: (shortcut) => captured.push(shortcut),
  });

  await controller.start();
  const helper = factory.helpers[0];
  controller.stop();
  helper.emitDown();

  assert.deepEqual(captured, []);
  assert.equal(helper.stopped, true);
});
