const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { createTranscriptionHelper } = require("./transcriptionHelper");

function fakeProcess() {
  const proc = new EventEmitter();
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = () => proc.emit("exit", null);
  return proc;
}

function captureStream(chunks) {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
}

function readRequests(child) {
  const requests = [];
  child.stdin.on("data", (data) => {
    for (const line of data.toString().trim().split("\n")) {
      if (line) requests.push(JSON.parse(line));
    }
  });
  return requests;
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(40), Buffer.from([1, 2, 3, 4])]);

test("is not ready until the helper emits the ready event", async () => {
  const child = fakeProcess();
  const helper = createTranscriptionHelper({ spawnProcess: () => child });
  helper.start();

  assert.equal(helper.isReady(), false);
  let resolved = false;
  helper.whenReady().then(() => {
    resolved = true;
  });
  await nextTurn();
  assert.equal(resolved, false);

  child.stdout.write('{"event":"ready"}\n');
  await nextTurn();

  assert.equal(helper.isReady(), true);
  assert.equal(resolved, true);
  helper.stop();
});

test("transcribe sends the WAV as base64 and returns the trimmed text", async () => {
  const child = fakeProcess();
  const requests = readRequests(child);
  const helper = createTranscriptionHelper({ spawnProcess: () => child });
  helper.start();
  child.stdout.write('{"event":"ready"}\n');

  const promise = helper.transcribe(wav, "ignored vocab prompt");
  await nextTurn();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].cmd, "transcribe");
  assert.equal(requests[0].id, "1");
  assert.equal(requests[0].wav, wav.toString("base64"));

  child.stdout.write('{"id":"1","status":"ok","text":"  Hello there.  ","ms":210}\n');
  assert.equal(await promise, "Hello there.");
  helper.stop();
});

test("transcribe rejects on an error reply, carrying the reason", async () => {
  const child = fakeProcess();
  readRequests(child);
  const helper = createTranscriptionHelper({ spawnProcess: () => child });
  helper.start();
  child.stdout.write('{"event":"ready"}\n');

  const promise = helper.transcribe(wav);
  await nextTurn();
  child.stdout.write('{"id":"1","status":"error","reason":"model not initialised"}\n');

  await assert.rejects(promise, /model not initialised/);
  helper.stop();
});

test("a request in flight rejects if the helper exits, and the ready gate resets", async () => {
  const child = fakeProcess();
  readRequests(child);
  const stderr = captureStream([]);
  const helper = createTranscriptionHelper({
    spawnProcess: () => child,
    stderr,
    setRestartTimer: () => 0,
  });
  helper.start();
  child.stdout.write('{"event":"ready"}\n');
  await nextTurn();
  assert.equal(helper.isReady(), true);

  const promise = helper.transcribe(wav);
  await nextTurn();
  child.emit("exit", 1);

  await assert.rejects(promise, /exited before replying/);
  assert.equal(helper.isReady(), false);
  helper.stop();
});

test("an {event:error} line is logged but does not reject the ready gate outright", async () => {
  const child = fakeProcess();
  const chunks = [];
  const helper = createTranscriptionHelper({ spawnProcess: () => child, stderr: captureStream(chunks) });
  helper.start();

  child.stdout.write('{"event":"error","message":"download failed"}\n');
  await nextTurn();

  assert.equal(helper.isReady(), false);
  assert.ok(chunks.join("").includes("download failed"));
  helper.stop();
});
