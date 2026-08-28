const test = require("node:test");
const assert = require("node:assert/strict");
const { createPushToTalkShortcutController } = require("./pushToTalkShortcutController");
const { STANDALONE_OPTION_KEY_CODE } = require("./hotkeyDefinitions");

const OLD_HOTKEY = { keyCode: 2, modifiers: ["ctrl", "alt"] };
const NEW_HOTKEY = { keyCode: STANDALONE_OPTION_KEY_CODE, modifiers: [] };

function fakeSettingsStore({ failFor = null } = {}) {
  let hotkey = { ...OLD_HOTKEY, modifiers: [...OLD_HOTKEY.modifiers] };
  const writes = [];
  return {
    get() {
      return { hotkey: { ...hotkey, modifiers: [...hotkey.modifiers] } };
    },
    setShortcut(nextHotkey) {
      writes.push(nextHotkey);
      if (failFor && nextHotkey.keyCode === failFor) throw new Error("settings are read-only");
      hotkey = { ...nextHotkey, modifiers: [...nextHotkey.modifiers] };
      return { hotkey: { ...hotkey, modifiers: [...hotkey.modifiers] } };
    },
    writes,
  };
}

function fakeHelperFactory() {
  const helpers = [];
  return {
    helpers,
    createHelper(options) {
      let resolveStart;
      let rejectStart;
      let ready = false;
      const helper = {
        options,
        stopped: false,
        activated: false,
        onDown: () => {},
        onUp: () => {},
        start() {
          return new Promise((resolve, reject) => {
            resolveStart = resolve;
            rejectStart = reject;
          });
        },
        stop() {
          this.stopped = true;
        },
        enableAutomaticRestart() {
          if (this.options.failActivation) throw new Error("activation failed");
          this.activated = true;
        },
        isReady() {
          return ready;
        },
        onKeyDown(callback) {
          this.onDown = callback;
        },
        onKeyUp(callback) {
          this.onUp = callback;
        },
        becomeReady() {
          ready = true;
          resolveStart();
        },
        fail(error) {
          rejectStart(error);
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

function createController(settingsStore, factory, options = {}) {
  return createPushToTalkShortcutController({
    settingsStore,
    createHelper: factory.createHelper,
    onKeyDown: options.onKeyDown,
    onKeyUp: options.onKeyUp,
    onDiagnostic: options.onDiagnostic,
  });
}

test("keeps the active helper and saved shortcut while a candidate is starting", async () => {
  const settings = fakeSettingsStore();
  const factory = fakeHelperFactory();
  const events = [];
  const controller = createController(settings, factory, { onKeyDown: () => events.push("down") });
  void controller.start();

  const replacement = controller.replace(NEW_HOTKEY);
  assert.equal(factory.helpers.length, 2);
  assert.equal(factory.helpers[0].stopped, false);
  assert.deepEqual(settings.get().hotkey, OLD_HOTKEY);
  factory.helpers[0].emitDown();
  assert.deepEqual(events, ["down"]);

  factory.helpers[1].becomeReady();
  const result = await replacement;

  assert.deepEqual(result, { ok: true, settings: { hotkey: NEW_HOTKEY } });
  assert.equal(factory.helpers[0].stopped, true);
  assert.equal(factory.helpers[1].activated, true);
  assert.deepEqual(settings.get().hotkey, NEW_HOTKEY);
});

test("reports an unavailable candidate without stopping the active helper", async () => {
  const settings = fakeSettingsStore();
  const factory = fakeHelperFactory();
  const diagnostics = [];
  const controller = createController(settings, factory, { onDiagnostic: (message) => diagnostics.push(message) });

  const replacement = controller.replace(NEW_HOTKEY);
  factory.helpers[1].fail(new Error("event tap denied"));
  const result = await replacement;

  assert.deepEqual(result, {
    ok: false,
    kind: "unavailable",
    message: "Shortcut unavailable. Choose another shortcut.",
  });
  assert.equal(factory.helpers[0].stopped, false);
  assert.equal(factory.helpers[1].stopped, true);
  assert.deepEqual(settings.get().hotkey, OLD_HOTKEY);
  assert.match(diagnostics[0], /event tap denied/);
});

test("reports a persistence failure and stops the ready candidate", async () => {
  const settings = fakeSettingsStore({ failFor: NEW_HOTKEY.keyCode });
  const factory = fakeHelperFactory();
  const controller = createController(settings, factory);
  const replacement = controller.replace(NEW_HOTKEY);
  factory.helpers[1].becomeReady();

  const result = await replacement;

  assert.deepEqual(result, {
    ok: false,
    kind: "internal-failure",
    message: "Unable to change the Push-to-talk shortcut.",
  });
  assert.equal(factory.helpers[0].stopped, false);
  assert.equal(factory.helpers[1].stopped, true);
  assert.deepEqual(settings.get().hotkey, OLD_HOTKEY);
});

test("leaves persistence untouched when a ready candidate cannot become active", async () => {
  const settings = fakeSettingsStore();
  const factory = fakeHelperFactory();
  const controller = createController(settings, factory);
  const replacement = controller.replace(NEW_HOTKEY);
  factory.helpers[1].options.failActivation = true;
  factory.helpers[1].becomeReady();

  const result = await replacement;

  assert.deepEqual(result, {
    ok: false,
    kind: "internal-failure",
    message: "Unable to change the Push-to-talk shortcut.",
  });
  assert.equal(factory.helpers[0].stopped, false);
  assert.equal(factory.helpers[1].stopped, true);
  assert.deepEqual(settings.get().hotkey, OLD_HOTKEY);
  assert.deepEqual(settings.writes, []);
});

test("rejects legacy combinations and unsupported standalone keys without starting a helper", async () => {
  const settings = fakeSettingsStore();
  const factory = fakeHelperFactory();
  const controller = createController(settings, factory);

  for (const candidate of [
    { keyCode: 2, modifiers: ["ctrl"] },
    { keyCode: 56, modifiers: [] },
  ]) {
    const result = await controller.replace(candidate);
    assert.deepEqual(result, { ok: false, kind: "unsupported", message: "Unsupported key" });
  }

  assert.equal(factory.helpers.length, 1);
  assert.deepEqual(settings.get().hotkey, OLD_HOTKEY);
});
