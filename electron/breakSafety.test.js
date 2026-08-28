const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isBreakSafeApplication,
  setBreakSafeApplications,
  getBreakSafeApplications,
  DEFAULT_BREAK_SAFE_BUNDLE_IDS,
  DEFAULT_BREAK_SAFE_APP_NAMES,
} = require("./breakSafety");

test.afterEach(() => {
  // Module-level state - reset after every test so one test's edit can't
  // leak into the next (or into dictationCoordinator.test.js, which relies
  // on the default list including com.apple.TextEdit).
  setBreakSafeApplications(DEFAULT_BREAK_SAFE_BUNDLE_IDS);
});

test("every default bundle id has a friendly name (#19)", () => {
  for (const bundleId of DEFAULT_BREAK_SAFE_BUNDLE_IDS) {
    assert.equal(typeof DEFAULT_BREAK_SAFE_APP_NAMES[bundleId], "string", `missing a name for ${bundleId}`);
  }
});

test("defaults match the original hardcoded allow-list", () => {
  assert.deepEqual(new Set(getBreakSafeApplications()), new Set(DEFAULT_BREAK_SAFE_BUNDLE_IDS));
  assert.equal(isBreakSafeApplication("com.apple.TextEdit"), true);
  assert.equal(isBreakSafeApplication("com.apple.Terminal"), false);
});

test("setBreakSafeApplications replaces the list entirely, not merges", () => {
  setBreakSafeApplications(["com.apple.Terminal"]);
  assert.equal(isBreakSafeApplication("com.apple.Terminal"), true);
  assert.equal(isBreakSafeApplication("com.apple.TextEdit"), false, "the old default must not survive a replace");
});

test("an empty list denies every app, matching deny-by-default", () => {
  setBreakSafeApplications([]);
  assert.equal(isBreakSafeApplication("com.apple.TextEdit"), false);
  assert.deepEqual(getBreakSafeApplications(), []);
});

test("setBreakSafeApplications dedupes", () => {
  setBreakSafeApplications(["com.apple.Terminal", "com.apple.Terminal"]);
  assert.deepEqual(getBreakSafeApplications(), ["com.apple.Terminal"]);
});
