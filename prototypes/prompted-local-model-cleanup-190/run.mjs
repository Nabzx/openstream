import { readFile, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import path from "node:path";
import { REQUEST_OPTIONS, buildBreakMessages, buildCleanupMessages, buildCombinedMessages } from "./prompts.mjs";
import {
  parseBreakReply,
  parseCleanupReply,
  parseCombinedReply,
  scoreText,
  sentenceCount,
} from "./guards.mjs";

const require = createRequire(import.meta.url);
const { cleanup } = require("../../electron/cleanup/rules.js");

const DEFAULT_URL = "http://127.0.0.1:8179/v1/chat/completions";
const DEFAULT_CORPUS = "~/openstream-corpus/real-dictation.draft.json";
const DEFAULT_OUTPUT = new URL("./results.json", import.meta.url);
const MODEL_FILE = "resources/models/smollm2-1.7b-instruct-q4_k_m.gguf";
const VARIANTS = [
  "zero-shot-cleanup",
  "few-shot-cleanup",
  "combined-cleanup-and-breaks",
  "separate-cleanup-then-breaks",
];

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const url = argument("--url", DEFAULT_URL);
const corpusPath = path.resolve(argument("--corpus", DEFAULT_CORPUS));
const outputPath = argument("--out", DEFAULT_OUTPUT);
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));

if (!Array.isArray(corpus) || corpus.length === 0) {
  throw new Error(`Corpus must be a non-empty JSON array: ${corpusPath}`);
}
for (const sample of corpus) {
  if (typeof sample.raw !== "string" || typeof sample.expected !== "string") {
    throw new Error(`Each sample needs string raw and expected fields: ${sample.id || "unknown id"}`);
  }
}

async function complete(messages) {
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ messages, ...REQUEST_OPTIONS }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${bodyText.slice(0, 300)}`);

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`model server returned non-JSON HTTP body: ${bodyText.slice(0, 300)}`);
  }

  const content = body.choices?.[0]?.message?.content;
  return {
    rawReply: typeof content === "string" ? content : JSON.stringify(content ?? ""),
    latencyMs: Math.round(performance.now() - started),
    usage: body.usage ?? null,
  };
}

async function warmRequest(messages) {
  try {
    await complete(messages);
  } catch {
    // The measured request below records the useful error and latency.
  }
  return complete(messages);
}

async function runCleanup(sample, { fewShot }) {
  const response = await warmRequest(buildCleanupMessages(sample.raw, { fewShot }));
  const reply = parseCleanupReply(response.rawReply);
  const candidateText = reply.status === "accept" ? reply.text : sample.rulesOutput;
  return {
    rawReply: response.rawReply,
    reply,
    candidateText,
    latencyMs: response.latencyMs,
    usage: response.usage,
  };
}

async function runCombined(sample) {
  const response = await warmRequest(buildCombinedMessages(sample.raw));
  const reply = parseCombinedReply(response.rawReply);
  const candidateText = reply.status === "accept" ? reply.text : sample.rulesOutput;
  return {
    rawReply: response.rawReply,
    reply,
    candidateText,
    latencyMs: response.latencyMs,
    usage: response.usage,
  };
}

async function runSeparate(sample) {
  const cleanupResult = await runCleanup(sample, { fewShot: true });
  const breakResponse = await warmRequest(buildBreakMessages(cleanupResult.candidateText));
  const breakReply = parseBreakReply(
    breakResponse.rawReply,
    sentenceCount(cleanupResult.candidateText),
  );
  return {
    cleanup: cleanupResult,
    breakReply,
    breakRawReply: breakResponse.rawReply,
    breakLatencyMs: breakResponse.latencyMs,
    totalLatencyMs: cleanupResult.latencyMs + breakResponse.latencyMs,
    usage: {
      cleanup: cleanupResult.usage,
      breaks: breakResponse.usage,
    },
  };
}

function baseRecord(sample, variant) {
  const rulesOutput = typeof sample.rulesOutput === "string"
    ? sample.rulesOutput
    : cleanup(sample.raw, sample.options || {});
  return {
    id: sample.id,
    variant,
    labels: sample.labels || [],
    raw: sample.raw,
    expected: sample.expected,
    rulesOutput,
    options: sample.options || {},
    metadata: sample.metadata || {},
  };
}

function scoreRecord(record, candidateText, modelText = null) {
  const score = scoreText({
    raw: record.raw,
    expected: record.expected,
    rulesOutput: record.rulesOutput,
    candidate: candidateText,
  });
  return {
    ...score,
    modelTextExactMatch: typeof modelText === "string"
      ? modelText.trim().toLowerCase() === record.expected.trim().toLowerCase()
      : null,
  };
}

const runs = [];
for (const sample of corpus) {
  for (const variant of VARIANTS) {
    process.stderr.write(`  ${variant} / ${sample.id} ... `);
    const record = baseRecord(sample, variant);
    try {
      if (variant === "zero-shot-cleanup") {
        const result = await runCleanup(sample, { fewShot: false });
        Object.assign(record, {
          cleanupReply: result.reply,
          cleanupRawReply: result.rawReply,
          candidateText: result.candidateText,
          latencyMs: result.latencyMs,
          usage: result.usage,
          score: scoreRecord(record, result.candidateText, result.reply.status === "accept" ? result.reply.text : null),
        });
      } else if (variant === "few-shot-cleanup") {
        const result = await runCleanup(sample, { fewShot: true });
        Object.assign(record, {
          cleanupReply: result.reply,
          cleanupRawReply: result.rawReply,
          candidateText: result.candidateText,
          latencyMs: result.latencyMs,
          usage: result.usage,
          score: scoreRecord(record, result.candidateText, result.reply.status === "accept" ? result.reply.text : null),
        });
      } else if (variant === "combined-cleanup-and-breaks") {
        const result = await runCombined(sample);
        Object.assign(record, {
          cleanupReply: result.reply,
          cleanupRawReply: result.rawReply,
          candidateText: result.candidateText,
          breakSentences: result.reply.breakSentences || [],
          latencyMs: result.latencyMs,
          usage: result.usage,
          score: scoreRecord(record, result.candidateText, result.reply.status === "accept" ? result.reply.text : null),
        });
      } else {
        const result = await runSeparate(sample);
        Object.assign(record, {
          cleanupReply: result.cleanup.reply,
          cleanupRawReply: result.cleanup.rawReply,
          candidateText: result.cleanup.candidateText,
          breakReply: result.breakReply,
          breakRawReply: result.breakRawReply,
          breakSentences: result.breakReply.breakSentences,
          cleanupLatencyMs: result.cleanup.latencyMs,
          breakLatencyMs: result.breakLatencyMs,
          totalLatencyMs: result.totalLatencyMs,
          usage: result.usage,
          score: scoreRecord(
            record,
            result.cleanup.candidateText,
            result.cleanup.reply.status === "accept" ? result.cleanup.reply.text : null,
          ),
        });
      }
      const latency = record.totalLatencyMs || record.latencyMs;
      process.stderr.write(`${latency}ms\n`);
    } catch (error) {
      record.error = String(error);
      process.stderr.write(`ERROR ${error}\n`);
    }
    runs.push(record);
  }
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summarizeVariant(variant) {
  const rows = runs.filter((row) => row.variant === variant && !row.error);
  const latencies = rows.map((row) => row.totalLatencyMs || row.latencyMs);
  return {
    samples: rows.length,
    errors: runs.filter((row) => row.variant === variant && row.error).length,
    accepted: rows.filter((row) => row.cleanupReply?.status === "accept").length,
    modelFallbacks: rows.filter((row) => row.cleanupReply?.status === "fallback").length,
    malformedReplies: rows.filter((row) => row.cleanupReply?.ok === false).length,
    exactFinalMatches: rows.filter((row) => row.score?.exactMatch).length,
    exactModelTextMatches: rows.filter((row) => row.score?.modelTextExactMatch).length,
    exactRulesMatches: rows.filter((row) => row.score?.rulesExactMatch).length,
    modelTextBoundedByRaw: rows.filter((row) => row.score?.outputUsesOnlyRawWords).length,
    referencesRecoverableFromRaw: rows.filter((row) => row.score?.referenceCanBeRecoveredFromRaw).length,
    validBreakReplies: variant.includes("breaks")
      ? rows.filter((row) => row.breakReply?.ok).length
      : null,
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : null,
      median: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.length ? Math.max(...latencies) : null,
    },
  };
}

const modelStats = await stat(path.resolve(MODEL_FILE));
const summary = Object.fromEntries(VARIANTS.map((variant) => [variant, summarizeVariant(variant)]));
const result = {
  generatedAt: new Date().toISOString(),
  url,
  corpusPath,
  sampleCount: corpus.length,
  model: {
    file: path.resolve(MODEL_FILE),
    bytes: modelStats.size,
  },
  scope: {
    targetFieldRecorded: false,
    deliveryMeasured: false,
    releaseToCursorMeasured: false,
    note: "Text-only model comparison. Target application, field context, delivery, and cursor latency were not recorded.",
  },
  summary,
  runs,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.error(`\nwrote ${outputPath}`);
