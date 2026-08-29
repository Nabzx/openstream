import { readFile } from "node:fs/promises";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusClass(run) {
  if (run.error) return "error";
  if (run.score?.exactMatch) return "match";
  if (run.cleanupReply?.status === "fallback") return "fallback";
  return "review";
}

function renderText(label, value) {
  return `<div class="text"><strong>${escapeHtml(label)}</strong><pre>${escapeHtml(value)}</pre></div>`;
}

const resultPath = argument("--results", "./results.json");
const result = JSON.parse(await readFile(resultPath, "utf8"));
const rows = result.runs.map((run) => `
  <article class="card ${statusClass(run)}">
    <header>
      <h2>${escapeHtml(run.id)}</h2>
      <span>${escapeHtml(run.variant)}</span>
      <span>${escapeHtml(run.totalLatencyMs || run.latencyMs || "error")} ms</span>
    </header>
    <p class="labels">${escapeHtml((run.labels || []).join(", "))}</p>
    ${renderText("Hand-verified reference", run.expected)}
    ${renderText("Rules cleanup", run.rulesOutput)}
    ${renderText("Candidate final text", run.candidateText || run.error)}
    ${renderText("Model reply", run.cleanupRawReply || "")}
    ${run.breakRawReply ? renderText("Break reply", run.breakRawReply) : ""}
    <dl>
      <dt>Exact final match</dt><dd>${escapeHtml(run.score?.exactMatch)}</dd>
      <dt>Rules exact match</dt><dd>${escapeHtml(run.score?.rulesExactMatch)}</dd>
      <dt>Candidate uses only raw words</dt><dd>${escapeHtml(run.score?.outputUsesOnlyRawWords)}</dd>
      <dt>Reference recoverable from raw</dt><dd>${escapeHtml(run.score?.referenceCanBeRecoveredFromRaw)}</dd>
      <dt>Model status</dt><dd>${escapeHtml(run.cleanupReply?.status || run.error)}</dd>
    </dl>
  </article>`).join("\n");

console.log(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prompted cleanup review</title>
<style>
:root { color-scheme: light; font: 16px/1.45 system-ui, sans-serif; background: #f5f6f8; color: #20242a; }
body { max-width: 1100px; margin: 0 auto; padding: 2rem; }
h1 { margin-bottom: .25rem; }
.summary { color: #5e6670; margin-bottom: 2rem; }
.card { background: white; border-left: 5px solid #a8b0ba; border-radius: 8px; box-shadow: 0 1px 4px #0001; margin: 1rem 0; padding: 1rem 1.25rem; }
.card.match { border-color: #26934a; }
.card.fallback { border-color: #d49100; }
.card.error { border-color: #c43d3d; }
header { align-items: baseline; display: flex; gap: 1rem; flex-wrap: wrap; }
h2 { margin: 0; font-size: 1.1rem; }
header span { color: #5e6670; font-size: .9rem; }
.labels { color: #5e6670; font-size: .9rem; }
.text { margin: .75rem 0; }
pre { background: #f1f3f5; border-radius: 4px; margin: .25rem 0 0; padding: .65rem; white-space: pre-wrap; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .2rem 1rem; font-size: .9rem; }
dt { color: #5e6670; }
dd { margin: 0; }
</style>
</head>
<body>
<h1>Prompted local-model cleanup review</h1>
<p class="summary">Text-only review. Target field, delivery, and release-to-cursor behavior were not measured. Compare each candidate with the hand-verified reference, not only with Rules cleanup.</p>
${rows}
</body>
</html>`);
