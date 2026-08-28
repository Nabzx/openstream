const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePermissions } = require("./permissions");

test("all three granted is ok with no blocking or warnings", () => {
  const result = evaluatePermissions({
    accessibility: true,
    inputMonitoring: "granted",
    microphone: "granted",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.blocking, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.grants.accessibility, "granted");
});

test("missing Accessibility blocks", () => {
  const result = evaluatePermissions({
    accessibility: false,
    inputMonitoring: "granted",
    microphone: "granted",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blocking, ["accessibility"]);
});

test("denied Input Monitoring blocks", () => {
  const result = evaluatePermissions({
    accessibility: true,
    inputMonitoring: "denied",
    microphone: "granted",
  });
  assert.deepEqual(result.blocking, ["inputMonitoring"]);
});

test("unknown Input Monitoring also blocks - we can't confirm push-to-talk works", () => {
  const result = evaluatePermissions({
    accessibility: true,
    inputMonitoring: "unknown",
    microphone: "granted",
  });
  assert.deepEqual(result.blocking, ["inputMonitoring"]);
  assert.equal(result.grants.inputMonitoring, "unknown");
});

test("denied Microphone is a warning, not a block", () => {
  const result = evaluatePermissions({
    accessibility: true,
    inputMonitoring: "granted",
    microphone: "denied",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, ["microphone"]);
});

test("not-determined Microphone is neither - macOS will prompt", () => {
  const result = evaluatePermissions({
    accessibility: true,
    inputMonitoring: "granted",
    microphone: "not-determined",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.grants.microphone, "pending");
});

test("both hard grants missing lists both", () => {
  const result = evaluatePermissions({
    accessibility: false,
    inputMonitoring: "denied",
    microphone: "not-determined",
  });
  assert.deepEqual(result.blocking, ["accessibility", "inputMonitoring"]);
});

test("details carries a settings URL for every grant", () => {
  const result = evaluatePermissions({ accessibility: true, inputMonitoring: "granted", microphone: "granted" });
  assert.equal(result.details.length, 3);
  for (const row of result.details) {
    assert.match(row.settingsUrl, /^x-apple\.systempreferences:/);
    assert.ok(row.label);
  }
});
