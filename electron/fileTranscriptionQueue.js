// #253: drop-a-file transcription. A small FIFO queue over the same
// resident transcription-helper live dictation uses (see transcribeFile()
// in transcriptionHelper.js) - one job at a time, since the helper only
// ever runs one transcription at a time regardless (it reads one
// newline-delimited request, blocks until the model replies, reads the
// next). A long file job can delay a concurrent live dictation; that is a
// known, accepted tradeoff for now (see the #253 PR), not something this
// module tries to work around - a second resident model would double the
// memory #257 exists to cut down.
//
// Pure and adapter-injected, same ports-and-adapters shape as
// dictationCoordinator.js: `transcription` is asserted, `onChange` is
// optional and fires with a full snapshot after every state change so a
// caller (main.js) can just re-render from the latest array rather than
// diffing.

function createFileTranscriptionQueue(options = {}) {
  const { transcription, language = { get: () => "auto" }, onChange = () => {} } = options;

  if (!transcription || typeof transcription.transcribeFile !== "function") {
    throw new Error("createFileTranscriptionQueue requires transcription.transcribeFile()");
  }

  let jobs = [];
  let nextId = 1;
  let processing = false;

  function snapshot() {
    return jobs.map((job) => ({ ...job }));
  }

  function notify() {
    try {
      onChange(snapshot());
    } catch {
      // A listener must never break the queue.
    }
  }

  function baseName(filePath) {
    const parts = String(filePath).split("/");
    return parts[parts.length - 1] || filePath;
  }

  // Runs until the queue is drained. Only one call is ever "live" at a
  // time - the `processing` guard means a second addFiles() while a job is
  // in flight just returns, and the in-flight call's own loop picks up
  // whatever got added.
  async function drain() {
    if (processing) return;
    processing = true;
    try {
      let job;
      while ((job = jobs.find((candidate) => candidate.status === "queued"))) {
        job.status = "transcribing";
        job.startedAt = Date.now();
        notify();
        try {
          job.text = await transcription.transcribeFile(job.path, language.get());
          job.status = "done";
        } catch (error) {
          job.status = "failed";
          job.error = error instanceof Error ? error.message : String(error);
        }
        job.finishedAt = Date.now();
        notify();
      }
    } finally {
      processing = false;
    }
  }

  function addFiles(paths) {
    const added = [];
    for (const filePath of Array.isArray(paths) ? paths : []) {
      if (typeof filePath !== "string" || !filePath) continue;
      const job = {
        id: String(nextId++),
        path: filePath,
        name: baseName(filePath),
        status: "queued",
        text: null,
        error: null,
        queuedAt: Date.now(),
        startedAt: null,
        finishedAt: null,
      };
      jobs.push(job);
      added.push(job.id);
    }
    if (added.length > 0) {
      notify();
      void drain();
    }
    return added;
  }

  function retry(id) {
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job || job.status !== "failed") return false;
    job.status = "queued";
    job.text = null;
    job.error = null;
    job.startedAt = null;
    job.finishedAt = null;
    notify();
    void drain();
    return true;
  }

  function remove(id) {
    const index = jobs.findIndex((candidate) => candidate.id === id);
    if (index === -1 || jobs[index].status === "transcribing") return false;
    jobs.splice(index, 1);
    notify();
    return true;
  }

  function clearFinished() {
    const before = jobs.length;
    jobs = jobs.filter((job) => job.status === "queued" || job.status === "transcribing");
    if (jobs.length !== before) notify();
  }

  function getJobs() {
    return snapshot();
  }

  return { addFiles, retry, remove, clearFinished, getJobs };
}

module.exports = { createFileTranscriptionQueue };
