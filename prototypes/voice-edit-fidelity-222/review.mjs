// Renders results.json as a static HTML page for hand-judging
// faithfulness: node review.mjs > review.html
// No dependencies, no network - open the file in a browser.

import { readFile } from "node:fs/promises";

const { ranAt, url, summary, runs } = JSON.parse(
  await readFile(new URL("./results.json", import.meta.url), "utf8"),
);

const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const byCase = new Map();
for (const row of runs) {
  if (!byCase.has(row.id)) byCase.set(row.id, []);
  byCase.get(row.id).push(row);
}

const rows = [...byCase.entries()]
  .map(([id, variants]) => {
    const first = variants[0];
    const cells = variants
      .map(
        (v) => `<td>
          <div class="variant">${esc(v.variant)} · ${v.latencyMs}ms${v.unchanged ? ' · <b class="u">unchanged</b>' : ""}${v.guardOk ? "" : ` · <b class="g">guard: ${esc(v.guardReason)}</b>`}</div>
          <pre>${esc(v.cleanedOutput ?? v.error ?? "")}</pre>
        </td>`,
      )
      .join("");
    return `<tr>
      <th>
        <div class="id">${esc(id)}</div>
        <div class="cat">${esc(first.category)}</div>
        <div class="instr">“${esc(first.instruction)}”</div>
        <pre class="sel">${esc(first.selection)}</pre>
        <div class="expect"><b>only acceptable change:</b> ${esc(first.expect)}</div>
        <div class="check"><b>probes:</b> ${esc(first.check)}</div>
      </th>
      ${cells}
    </tr>`;
  })
  .join("\n");

const summaryRows = Object.entries(summary)
  .map(
    ([v, s]) =>
      `<tr><td>${esc(v)}</td><td>${s.cases}</td><td>${s.returnedUnchanged}</td><td>${s.guardRejected}</td><td>${s.latencyMs.min}–${s.latencyMs.median}–${s.latencyMs.max} ms</td></tr>`,
  )
  .join("");

process.stdout.write(`<!doctype html>
<meta charset="utf-8">
<title>Voice-edit fidelity review — #222</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 24px; color: #1d1d1f; background: #fff; }
  h1 { font-size: 18px; } .meta { color: #6e6e73; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ddd; padding: 10px; vertical-align: top; text-align: left; }
  th { background: #f7f7f8; width: 26%; }
  pre { white-space: pre-wrap; margin: 4px 0; font: 12px/1.45 ui-monospace, Menlo, monospace; background: #f5f5f7; padding: 8px; border-radius: 6px; }
  .id { font-weight: 700; } .cat { color: #6e6e73; font-size: 12px; }
  .instr { margin: 4px 0; font-style: italic; }
  .expect, .check { font-size: 12px; color: #3a3a3c; margin-top: 6px; }
  .sel { background: #eef; }
  .variant { font-size: 12px; color: #6e6e73; margin-bottom: 2px; }
  b.u { color: #c0392b; } b.g { color: #9a6100; }
  .sum td { text-align: center; }
</style>
<h1>Voice-edit fidelity review — issue #222</h1>
<div class="meta">Ran ${esc(ranAt)} against ${esc(url)}. Judge each cell: did it apply the instruction, and <em>only</em> the instruction?</div>
<table class="sum">
  <tr><th>variant</th><th>cases</th><th>returned unchanged</th><th>guard-rejected</th><th>latency min–median–max</th></tr>
  ${summaryRows}
</table>
<p></p>
<table>${rows}</table>
`);
