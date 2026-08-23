#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Builds out/review.html from out/results.json.

One self-contained file, no server, no framework: open it by double-click.
It carries the two things a person has to decide and a machine cannot:

  1. Do the model's paragraph breaks actually read well? (the part that decides
     whether the feature earns its ~1.1 GB)
  2. Does the defined fallback behave sensibly when the reply is malformed?
     Free-play plus guided walkthroughs over a JS port of breakpos.parse_reply.

Usage:  python3 report.py
"""
import json
import pathlib

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
R = json.loads((OUT / "results.json").read_text())
C = json.loads((OUT / "control.json").read_text())

MODELS = list(R["cold_start"].keys())
BUDGET = R["meta"]["budget_seconds"] - R["meta"]["transcribe_plus_rules_130w"]


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def paras_html(paras):
    return "".join(f"<p>{esc(p)}</p>" for p in paras)


# ---------------------------------------------------------------- latency ---
buckets = {}
for sid, d in R["samples"].items():
    for m, run in d["runs"].items():
        buckets.setdefault(d["bucket"], {}).setdefault(m, []).append(run)

lat_rows = []
for b in sorted(buckets, key=int):
    cells = []
    for m in MODELS:
        runs = buckets[b].get(m, [])
        if not runs:
            cells.append("<td>-</td>")
            continue
        secs = sorted(r["seconds"] for r in runs)
        med = secs[len(secs) // 2]
        cls = "good" if med <= BUDGET else "bad"
        cells.append(f'<td class="{cls}">{med:.2f}s'
                     f'<span class="rng">{min(secs):.2f}-{max(secs):.2f}</span></td>')
    lat_rows.append(f"<tr><th>{b} words</th>{''.join(cells)}</tr>")

# --------------------------------------------------------------- validity ---
val_rows = []
for m in MODELS:
    runs = [d["runs"][m] for d in R["samples"].values() if m in d["runs"]]
    n = len(runs)
    strict = sum(1 for r in runs if r["strict"])
    bad = sum(1 for r in runs if r["verdict"] in ("repaired", "invalid"))
    toks = sorted(r["tokens"]["completion_tokens"] for r in runs)
    agree = sum(1 for sid, d in R["samples"].items()
                if m in d["runs"] and d["runs"][m]["indices"] == d["reference"])
    val_rows.append(
        f"<tr><th>{esc(m)}</th>"
        f"<td>{strict}/{n}</td><td>{bad}/{n}</td>"
        f"<td>{toks[len(toks)//2]}<span class='rng'>{toks[0]}-{toks[-1]}</span></td>"
        f"<td>{R['rss_mb'][m]} MB</td><td>{R['cold_start'][m]}s</td>"
        f"<td>{agree}/{n}</td></tr>")

# ----------------------------------------------------------------- judging --
cards = []
for sid, d in R["samples"].items():
    if not d["runs"]:
        continue
    cols = ['<div class="col"><h4>No breaks <em>(today)</em></h4>'
            f'{paras_html([" ".join(d["sentences"])])}</div>']
    for m in MODELS:
        r = d["runs"].get(m)
        if not r:
            continue
        cols.append(
            f'<div class="col"><h4>{esc(m)} '
            f'<em>{esc(r["indices"] or "no breaks")} &middot; {r["seconds"]:.2f}s</em></h4>'
            f'{paras_html(r["paragraphs"])}</div>')
    import breakpos
    cols.append('<div class="col"><h4>Spike author <em>'
                f'{esc(d["reference"])}</em></h4>'
                f'{paras_html(breakpos.assemble(d["sentences"], d["reference"]))}</div>')
    cards.append(
        f'<section class="card" id="{esc(sid)}"><h3>{esc(sid)} '
        f'<em>{d["words"]} words &middot; {d["n_sentences"]} sentences</em></h3>'
        f'<div class="cols">{"".join(cols)}</div>'
        f'<div class="verdict" data-sid="{esc(sid)}">'
        '<span>Do the breaks read well?</span>'
        '<button data-v="good">Good</button>'
        '<button data-v="meh">Passable</button>'
        '<button data-v="bad">Bad</button>'
        '<button data-v="seg">Bad, but the segmenter\'s fault</button>'
        '<b class="mark"></b></div></section>')


# ---------------------------------------------------------------- control ---
from collections import Counter
ctrl_rows = []
for m, vs in C.items():
    for v, row in vs.items():
        firsts = Counter(ix[0] for ix in row.values() if ix)
        empty = sum(1 for ix in row.values() if not ix)
        everysent = sum(1 for ix in row.values()
                        if len(ix) >= 5 and ix == list(range(2, max(ix) + 1)))
        top = ", ".join(f"{k} ({n}x)" for k, n in firsts.most_common(2)) or "-"
        ctrl_rows.append(
            f"<tr><th>{esc(m)}</th><td>{esc(v)}</td><td>{top}</td>"
            f"<td>{empty}/12</td><td>{everysent}/12</td></tr>")

PAGE = f"""<meta charset="utf-8"><title>Break placement review - issue #67</title>
<style>
:root {{ --ink:#16181d; --dim:#6b7280; --line:#e3e5ea; --accent:#2f5bea;
        --good:#0f7b4f; --bad:#b3261e; --bg:#fbfbfc; }}
* {{ box-sizing:border-box }}
body {{ font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
       color:var(--ink); background:var(--bg); margin:0; padding:48px 32px 96px }}
main {{ max-width:1180px; margin:0 auto }}
h1 {{ font-size:28px; margin:0 0 8px }}
h2 {{ font-size:20px; margin:48px 0 12px; padding-top:24px;
      border-top:1px solid var(--line) }}
h3 {{ font-size:17px; margin:0 0 14px }}
h4 {{ font-size:13px; margin:0 0 10px; color:var(--accent);
      text-transform:uppercase; letter-spacing:.05em }}
em {{ color:var(--dim); font-style:normal; font-weight:400;
      text-transform:none; letter-spacing:0 }}
.lede {{ color:var(--dim); max-width:70ch; margin:0 0 8px }}
table {{ border-collapse:collapse; margin:12px 0; font-size:15px }}
th,td {{ border:1px solid var(--line); padding:7px 12px; text-align:left }}
thead th {{ background:#f2f3f6; font-size:13px }}
td.good {{ color:var(--good); font-weight:600 }}
td.bad {{ color:var(--bad); font-weight:600 }}
.rng {{ display:block; font-size:11px; color:var(--dim); font-weight:400 }}
.card {{ background:#fff; border:1px solid var(--line); border-radius:10px;
         padding:20px; margin:16px 0 }}
.cols {{ display:grid; grid-template-columns:repeat({len(MODELS) + 2},1fr); gap:20px }}
.col p {{ margin:0 0 10px; font-size:13.5px; line-height:1.55 }}
.col p:last-child {{ margin-bottom:0 }}
.verdict {{ display:flex; align-items:center; gap:8px; margin-top:18px;
            padding-top:14px; border-top:1px solid var(--line); font-size:14px }}
.verdict span {{ color:var(--dim); margin-right:4px }}
button {{ font:inherit; font-size:13px; padding:5px 12px; cursor:pointer;
          border:1px solid var(--line); background:#fff; border-radius:6px }}
button:hover {{ border-color:var(--accent); color:var(--accent) }}
button.on {{ background:var(--accent); border-color:var(--accent); color:#fff }}
.mark {{ margin-left:auto; color:var(--good) }}
#tally {{ position:fixed; right:24px; bottom:24px; background:#fff;
          border:1px solid var(--line); border-radius:10px; padding:12px 16px;
          font-size:13px; box-shadow:0 4px 20px rgba(0,0,0,.07) }}
.play {{ display:grid; grid-template-columns:1fr 1fr; gap:24px;
         background:#fff; border:1px solid var(--line);
         border-radius:10px; padding:20px }}
input[type=text] {{ font:inherit; width:100%; padding:8px 10px;
                    border:1px solid var(--line); border-radius:6px }}
.state {{ font-size:14px }}
.state div {{ display:flex; gap:10px; padding:4px 0;
              border-bottom:1px dashed var(--line) }}
.state b {{ min-width:110px; color:var(--dim); font-weight:400 }}
.scen {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:12px }}
code {{ background:#f2f3f6; padding:1px 5px; border-radius:4px; font-size:13px }}
</style>
<main>
<h1>Does a 1.7B model pick sensible paragraph breaks?</h1>
<p class="lede">Issue #67. The rewrite model server is handed <b>numbered
sentences</b> and answers with <b>sentence numbers</b>, never text. This page
carries the two judgements a measurement cannot make: whether the breaks
actually read well, and whether the fallback behaves when the reply is
malformed.</p>
<p class="lede">Measured on {esc(R['meta']['machine'])},
{R['meta']['ram_gb']} GB, macOS {esc(R['meta']['macos'])} -
median of {R['meta']['reps']} warm runs. That machine is fanless and sits
<b>above</b> the 8 GB floor, so the memory column is not worst case.</p>

<h2>1. Latency, against {BUDGET:.2f}s of headroom</h2>
<p class="lede">End of speech to text ready is committed to under
{R['meta']['budget_seconds']:.0f}s; whisper base.en + rules already spends
{R['meta']['transcribe_plus_rules_130w']:.2f}s on 130 words (#24). Green fits
the remaining {BUDGET:.2f}s, red does not.</p>
<table><thead><tr><th></th>{''.join(f'<th>{esc(m)}</th>' for m in MODELS)}
</tr></thead><tbody>{''.join(lat_rows)}</tbody></table>

<h2>2. Did the reply obey the contract?</h2>
<p class="lede"><b>Format obeyed</b> counts replies that were numbers only (or
"none"). <b>Needed repair</b> counts replies where indices had to be dropped or
nothing usable came back at all - this is what the fallback is for.
<b>Agrees with author</b> is one person's paragraphing, a cheap signal only;
the real judgement is section 4.</p>
<p class="lede"><b>Resident</b> is the model server alone. whisper base.en adds
{R['rss_mb']['whisper-base.en']:.0f} MB on top, so the real steady-state total is
<b>{R['rss_mb']['smollm2-1.7b'] + R['rss_mb']['whisper-base.en']:.0f} MB</b> with
SmolLM2 and
<b>{R['rss_mb']['qwen3-1.7b-nothink'] + R['rss_mb']['whisper-base.en']:.0f} MB</b>
with Qwen3, against the <b>~1800 MB</b> #45 assumed. On an 8 GB machine that is
a quarter of RAM held for the whole session.</p>
<table><thead><tr><th>Model</th><th>Format obeyed</th><th>Needed repair</th>
<th>Output tokens</th><th>Resident</th><th>Cold start</th>
<th>Agrees with author</th></tr></thead>
<tbody>{''.join(val_rows)}</tbody></table>

<h2>3. Control: are they reading the text, or copying the example?</h2>
<p class="lede">The prompt above carries one worked example, <code>3, 7</code>.
SmolLM2 then opened with index 3 on eleven of twelve samples. So the example was
varied and the run repeated, changing nothing else. If the answers track the
example, the model is not choosing breaks - and every quality number on this
page is an artifact.</p>
<table><thead><tr><th>Model</th><th>Example given</th>
<th>Most common first break</th><th>Nothing usable</th>
<th>Broke at every sentence</th></tr></thead>
<tbody>{''.join(ctrl_rows)}</tbody></table>
<p class="lede"><b>They are copying.</b> SmolLM2's first break follows the
example digit-for-digit, and with the example removed it returns nothing usable
on all twelve. Qwen3 with no example starts at sentence 2 every time and breaks
at <em>every</em> sentence on nine of twelve. Neither model is reading the text
for topic shifts.</p>

<h2>4. Read them. Do the breaks land in the right places?</h2>
<p class="lede">Each row is one dictation, paragraphed four ways. Judge the
<b>break positions</b>, not the wording - the wording is rules cleanup's and is
not up for review here. If a break reads badly because the sentence boundary
itself is mid-clause, that is the run-on splitter's known weakness, so mark it
as such and it will not count against the model.</p>
{''.join(cards)}

<h2>5. What happens when the reply is malformed?</h2>
<p class="lede">Type anything a model might return and watch the parser. This is
the same logic the product would run, so this is where the fallback gets
decided.</p>
<div class="play">
  <div>
    <label>Model reply, over a 9-sentence dictation</label>
    <input type="text" id="reply" value="3, 7">
    <div class="scen" id="scen"></div>
  </div>
  <div class="state" id="state"></div>
</div>
</main>
<div id="tally">judged <b id="n">0</b> of {len(cards)}</div>
<script>
// --- breakpos.parse_reply, ported. Pure: no DOM in here. ----------------
function parseReply(reply, n) {{
  const raw = (reply || "").replace(/<think>[\\s\\S]*?<\\/think>/g, "").trim();
  const strict = /^\\s*(?:none|no breaks?)\\s*[.!]?\\s*$|^\\s*\\d+(?:\\s*,\\s*\\d+)*\\s*\\.?\\s*$/i.test(raw);
  if (!raw) return {{indices: [], verdict: "invalid", strict: false}};
  const found = (raw.match(/\\d+/g) || []).map(Number);
  if (!found.length) return {{indices: [], strict,
    verdict: /\\bnone\\b|\\bno breaks?\\b/i.test(raw) ? "none" : "invalid"}};
  const usable = [...new Set(found.filter(i => i >= 2 && i <= n))].sort((a,b)=>a-b);
  if (!usable.length) return {{indices: [], verdict: "invalid", strict: false}};
  const dropped = JSON.stringify(found) !== JSON.stringify(usable);
  return {{indices: usable, verdict: dropped ? "repaired" : "ok", strict}};
}}

const N = 9;
const SCEN = [
  ["the happy path", "3, 7"],
  ["no breaks wanted", "none"],
  ["out of range", "3, 42"],
  ["tries to break at sentence 1", "1, 4"],
  ["duplicates, unsorted", "7, 3, 3"],
  ["explains itself first", "I would break at 3 and 6"],
  ["answers the text instead", "That is a good point about latency."],
  ["says nothing at all", ""],
  ["a thinking model that never stopped", "<think>Let me consider</think>"],
];
const scen = document.getElementById("scen");
SCEN.forEach(([label, v]) => {{
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => {{ document.getElementById("reply").value = v; render(); }};
  scen.appendChild(b);
}});

function render() {{
  const reply = document.getElementById("reply").value;
  const r = parseReply(reply, N);
  const starts = [1, ...r.indices];
  document.getElementById("state").innerHTML = `
    <div><b>Reply</b><span>${{reply ? "<code>" + reply.replace(/</g,"&lt;") + "</code>" : "<em>(empty)</em>"}}</span></div>
    <div><b>Format obeyed</b><span>${{r.strict ? "yes" : "<b style='color:#b3261e'>no</b>"}}</span></div>
    <div><b>Outcome</b><span><b>${{r.verdict}}</b></span></div>
    <div><b>Breaks applied</b><span>${{r.indices.length ? r.indices.join(", ") : "none"}}</span></div>
    <div><b>Paragraphs</b><span>${{r.verdict === "invalid"
        ? "1 &mdash; <em>fallback: ship it unbroken, exactly as today</em>"
        : starts.length}}</span></div>`;
}}
document.getElementById("reply").addEventListener("input", render);
render();

// --- judging tally -------------------------------------------------------
document.querySelectorAll(".verdict").forEach(v => {{
  v.querySelectorAll("button").forEach(b => b.onclick = () => {{
    v.querySelectorAll("button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    v.querySelector(".mark").textContent = "recorded";
    document.getElementById("n").textContent =
      document.querySelectorAll(".verdict button.on").length;
  }});
}});
</script>"""

(OUT / "review.html").write_text(PAGE)
print(f"wrote {OUT / 'review.html'}")
