// Runs the #222 corpus against a running rewrite model server and writes
// results.json. Does NOT start the server - point it at one:
//
//   node run.mjs --url http://127.0.0.1:8199/v1/chat/completions
//
// For each (prompt variant x case) it records the raw output, the guard
// verdict, and warm latency. Faithfulness is judged by a human from the
// review page (review.mjs), not here.

import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { PROMPTS, SAMPLING } from "./prompts.mjs";
import { applyGuards } from "./guards.mjs";

const url =
  process.argv[process.argv.indexOf("--url") + 1] || "http://127.0.0.1:8179/v1/chat/completions";

const { cases } = JSON.parse(await readFile(new URL("./corpus.json", import.meta.url), "utf8"));

async function complete(messages) {
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...SAMPLING }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    latencyMs: Math.round(performance.now() - started),
    usage: body.usage ?? null,
  };
}

const runs = [];
for (const [variant, build] of Object.entries(PROMPTS)) {
  for (const testCase of cases) {
    process.stderr.write(`  ${variant} / ${testCase.id} … `);
    let record;
    try {
      // one warm-up throwaway per case so latency is warm, then the real one
      await complete(build(testCase));
      const result = await complete(build(testCase));
      const guard = applyGuards(result.text, testCase.selection);
      record = {
        variant,
        id: testCase.id,
        category: testCase.category,
        instruction: testCase.instruction,
        selection: testCase.selection,
        expect: testCase.expect,
        check: testCase.check,
        rawOutput: result.text,
        cleanedOutput: guard.cleaned,
        guardOk: guard.ok,
        guardReason: guard.reason,
        unchanged: guard.cleaned.trim() === testCase.selection.trim(),
        latencyMs: result.latencyMs,
        usage: result.usage,
      };
      process.stderr.write(`${result.latencyMs}ms${guard.ok ? "" : ` [guard: ${guard.reason}]`}\n`);
    } catch (error) {
      record = { variant, id: testCase.id, error: String(error) };
      process.stderr.write(`ERROR ${error}\n`);
    }
    runs.push(record);
  }
}

const summary = {};
for (const variant of Object.keys(PROMPTS)) {
  const rows = runs.filter((r) => r.variant === variant && !r.error);
  summary[variant] = {
    cases: rows.length,
    guardRejected: rows.filter((r) => !r.guardOk).length,
    returnedUnchanged: rows.filter((r) => r.unchanged).length,
    latencyMs: {
      min: Math.min(...rows.map((r) => r.latencyMs)),
      median: rows.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
      max: Math.max(...rows.map((r) => r.latencyMs)),
    },
  };
}

await writeFile(
  new URL("./results.json", import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), url, summary, runs }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
console.error("\nwrote results.json - now: node review.mjs > review.html");
