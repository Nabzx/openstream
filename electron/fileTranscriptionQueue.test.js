const test = require("node:test");
const assert = require("node:assert/strict");
const { createFileTranscriptionQueue } = require("./fileTranscriptionQueue");

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("requires a transcription.transcribeFile adapter", () => {
  assert.throws(() => createFileTranscriptionQueue({}), /transcribeFile/);
  assert.throws(() => createFileTranscriptionQueue({ transcription: {} }), /transcribeFile/);
});

test("addFiles queues jobs and returns their ids", () => {
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile: async () => "text" },
  });
  const ids = queue.addFiles(["/a/one.wav", "/a/two.m4a"]);
  assert.equal(ids.length, 2);
  const jobs = queue.getJobs();
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].name, "one.wav");
  assert.equal(jobs[1].name, "two.m4a");
});

test("addFiles ignores non-string / empty entries without throwing", () => {
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile: async () => "text" },
  });
  const ids = queue.addFiles(["/a/one.wav", "", null, 42, undefined]);
  assert.equal(ids.length, 1);
  assert.equal(queue.getJobs().length, 1);
});

test("processes one file at a time, in FIFO order", async () => {
  const calls = [];
  const first = deferred();
  const transcribeFile = (path) => {
    calls.push(path);
    if (calls.length === 1) return first.promise;
    return Promise.resolve(`text for ${path}`);
  };
  const seen = [];
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile },
    onChange: (jobs) => seen.push(jobs.map((j) => j.status)),
  });

  queue.addFiles(["/a.wav", "/b.wav"]);
  await nextTurn();

  // Only the first job has started - the second is still queued behind it.
  assert.deepEqual(calls, ["/a.wav"]);
  assert.deepEqual(
    queue.getJobs().map((j) => j.status),
    ["transcribing", "queued"],
  );

  first.resolve("text for /a.wav");
  await nextTurn();
  await nextTurn();

  assert.deepEqual(calls, ["/a.wav", "/b.wav"]);
  assert.deepEqual(
    queue.getJobs().map((j) => j.status),
    ["done", "done"],
  );
  assert.equal(queue.getJobs()[0].text, "text for /a.wav");
  assert.equal(queue.getJobs()[1].text, "text for /b.wav");
});

test("a failed job records the error and does not block the rest of the queue", async () => {
  const queue = createFileTranscriptionQueue({
    transcription: {
      transcribeFile: async (path) => {
        if (path === "/bad.wav") throw new Error("no file at /bad.wav");
        return "ok text";
      },
    },
  });

  const [, secondId] = queue.addFiles(["/bad.wav", "/good.wav"]);
  await nextTurn();
  await nextTurn();

  const jobs = queue.getJobs();
  assert.equal(jobs[0].status, "failed");
  assert.equal(jobs[0].error, "no file at /bad.wav");
  const second = jobs.find((j) => j.id === secondId);
  assert.equal(second.status, "done");
  assert.equal(second.text, "ok text");
});

test("the configured language is forwarded to transcribeFile", async () => {
  const seen = [];
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile: async (_path, lang) => { seen.push(lang); return "x"; } },
    language: { get: () => "fr" },
  });
  queue.addFiles(["/a.wav"]);
  await nextTurn();
  assert.deepEqual(seen, ["fr"]);
});

test("retry re-queues a failed job and clears its error", async () => {
  let attempt = 0;
  const queue = createFileTranscriptionQueue({
    transcription: {
      transcribeFile: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("first attempt failed");
        return "second time lucky";
      },
    },
  });

  const [id] = queue.addFiles(["/a.wav"]);
  await nextTurn();
  assert.equal(queue.getJobs()[0].status, "failed");

  assert.equal(queue.retry(id), true);
  await nextTurn();

  const job = queue.getJobs()[0];
  assert.equal(job.status, "done");
  assert.equal(job.text, "second time lucky");
  assert.equal(job.error, null);
});

test("retry refuses a job that is not failed", async () => {
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile: async () => "text" },
  });
  const [id] = queue.addFiles(["/a.wav"]);
  await nextTurn();
  assert.equal(queue.getJobs()[0].status, "done");
  assert.equal(queue.retry(id), false);
});

test("remove drops a queued or finished job but refuses one in flight", async () => {
  const first = deferred();
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile: () => first.promise },
  });
  const [id] = queue.addFiles(["/a.wav"]);
  await nextTurn();
  assert.equal(queue.getJobs()[0].status, "transcribing");
  assert.equal(queue.remove(id), false);

  first.resolve("done text");
  await nextTurn();
  assert.equal(queue.remove(id), true);
  assert.equal(queue.getJobs().length, 0);
});

test("clearFinished drops done and failed jobs, leaves queued/transcribing alone", async () => {
  const second = deferred();
  const transcribeFile = (path) => (path === "/slow.wav" ? second.promise : Promise.reject(new Error("nope")));
  const queue = createFileTranscriptionQueue({ transcription: { transcribeFile } });

  queue.addFiles(["/fails.wav", "/slow.wav"]);
  await nextTurn();
  await nextTurn();

  assert.deepEqual(
    queue.getJobs().map((j) => j.status),
    ["failed", "transcribing"],
  );
  queue.clearFinished();
  assert.deepEqual(
    queue.getJobs().map((j) => j.status),
    ["transcribing"],
  );

  second.resolve("ok");
  await nextTurn();
});

test("onChange fires with a full snapshot on every transition", async () => {
  const snapshots = [];
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile: async () => "text" },
    onChange: (jobs) => snapshots.push(jobs.map((j) => j.status)),
  });
  queue.addFiles(["/a.wav"]);
  await nextTurn();
  // queued (from addFiles) -> transcribing -> done
  assert.deepEqual(snapshots, [["queued"], ["transcribing"], ["done"]]);
});

test("a listener that throws never breaks the queue", async () => {
  const queue = createFileTranscriptionQueue({
    transcription: { transcribeFile: async () => "text" },
    onChange: () => {
      throw new Error("boom");
    },
  });
  queue.addFiles(["/a.wav"]);
  await nextTurn();
  assert.equal(queue.getJobs()[0].status, "done");
});
