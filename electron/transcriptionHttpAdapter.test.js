const test = require("node:test");
const assert = require("node:assert/strict");
const { createTranscriptionHttpAdapter } = require("./transcriptionHttpAdapter");

test("posts a completed WAV recording to the local transcription contract", async () => {
  const calls = [];
  const adapter = createTranscriptionHttpAdapter({
    inferenceUrl: () => "http://127.0.0.1:8178/inference",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ text: "  hello world  " }) };
    },
  });

  const result = await adapter.transcribe(Buffer.from("RIFF wav bytes"));

  assert.equal(result, "hello world");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8178/inference");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body.get("response_format"), "json");
  const file = calls[0].options.body.get("file");
  assert.equal(file.name, "dictation.wav");
  assert.equal(file.type, "audio/wav");
});

test("sends the vocabulary prompt as a form field when given one", async () => {
  const calls = [];
  const adapter = createTranscriptionHttpAdapter({
    inferenceUrl: () => "http://127.0.0.1:8178/inference",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ text: "hello" }) };
    },
  });

  await adapter.transcribe(Buffer.from("RIFF wav bytes"), "useEffect, useState");

  assert.equal(calls[0].options.body.get("prompt"), "useEffect, useState");
});

test("omits the prompt field entirely when none is given", async () => {
  const calls = [];
  const adapter = createTranscriptionHttpAdapter({
    inferenceUrl: () => "http://127.0.0.1:8178/inference",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ text: "hello" }) };
    },
  });

  await adapter.transcribe(Buffer.from("RIFF wav bytes"));

  assert.equal(calls[0].options.body.get("prompt"), null);
});

test("fails clearly when the transcription model server rejects a recording", async () => {
  const adapter = createTranscriptionHttpAdapter({
    inferenceUrl: () => "http://127.0.0.1:8178/inference",
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });

  await assert.rejects(
    () => adapter.transcribe(Buffer.from("RIFF wav bytes")),
    /transcription model server returned 503/
  );
});
