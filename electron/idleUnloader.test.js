const test = require("node:test");
const assert = require("node:assert/strict");
const { createIdleUnloader } = require("./idleUnloader");

// A fake timer: one pending callback, fired by hand.
function fakeTimers() {
  let pending = null;
  let nextHandle = 1;
  return {
    set: (fn) => {
      pending = fn;
      return nextHandle++;
    },
    clear: () => {
      pending = null;
    },
    fire: () => {
      const fn = pending;
      pending = null;
      if (fn) fn();
    },
    get armed() {
      return pending !== null;
    },
  };
}

function make(overrides = {}) {
  const events = [];
  const timers = fakeTimers();
  const unloader = createIdleUnloader({
    idleMs: overrides.idleMs ?? 1000,
    onUnload: () => events.push("unload"),
    onReload: () => events.push("reload"),
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  return { unloader, timers, events };
}

test("does not arm until the first activity", () => {
  const { timers } = make();
  assert.equal(timers.armed, false);
});

test("arms on activity and unloads when the timer fires", () => {
  const { unloader, timers, events } = make();
  unloader.noteActivity();
  assert.equal(timers.armed, true);
  timers.fire();
  assert.deepEqual(events, ["unload"]);
  assert.equal(unloader.isUnloaded(), true);
});

test("the next activity reloads and re-arms", () => {
  const { unloader, timers, events } = make();
  unloader.noteActivity();
  timers.fire(); // unload
  unloader.noteActivity();
  assert.deepEqual(events, ["unload", "reload"]);
  assert.equal(unloader.isUnloaded(), false);
  assert.equal(timers.armed, true);
});

test("activity while still loaded just restarts the countdown, no reload", () => {
  const { unloader, events } = make();
  unloader.noteActivity();
  unloader.noteActivity();
  unloader.noteActivity();
  assert.deepEqual(events, []);
});

test("zero minutes means never unload", () => {
  const { unloader, timers, events } = make({ idleMs: 0 });
  unloader.noteActivity();
  assert.equal(timers.armed, false);
  assert.deepEqual(events, []);
});

test("setIdleMs(0) disarms a pending countdown", () => {
  const { unloader, timers } = make();
  unloader.noteActivity();
  assert.equal(timers.armed, true);
  unloader.setIdleMs(0);
  assert.equal(timers.armed, false);
});

test("setIdleMs to a positive value arms straight away when loaded", () => {
  const { unloader, timers } = make({ idleMs: 0 });
  unloader.noteActivity();
  assert.equal(timers.armed, false);
  unloader.setIdleMs(500);
  assert.equal(timers.armed, true);
});

test("setIdleMs does not resurrect the countdown while unloaded - the next activity does", () => {
  const { unloader, timers } = make();
  unloader.noteActivity();
  timers.fire(); // unloaded
  unloader.setIdleMs(2000);
  assert.equal(timers.armed, false);
  unloader.noteActivity();
  assert.equal(timers.armed, true);
});

test("stop() clears any pending countdown", () => {
  const { unloader, timers } = make();
  unloader.noteActivity();
  unloader.stop();
  assert.equal(timers.armed, false);
});

test("needs both callbacks", () => {
  assert.throws(() => createIdleUnloader({ onUnload: () => {} }), /onUnload and onReload/);
});
