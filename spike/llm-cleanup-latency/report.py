#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Renders out/results.json into a single HTML file.

Double-click out/report.html. Everything is inline; no server, no assets.
"""
import html
import json
import pathlib
import statistics

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"

WHISPERS = ["base.en", "small.en"]
LLMS = ["llama-3.2-3b", "llama-3.2-1b"]
BUCKET_ORDER = {"short": 0, "sentence": 1, "paragraph": 2}


def esc(s):
    return html.escape(s or "")


def main():
    r = json.loads((OUT / "results.json").read_text())
    sustained = None
    if (OUT / "sustained.json").exists():
        sustained = json.loads((OUT / "sustained.json").read_text())

    meta = r["meta"]
    samples = sorted(
        r["samples"].items(),
        key=lambda kv: (BUCKET_ORDER[kv[1]["bucket"]], kv[0]),
    )

    p = []
    p.append("""<!doctype html><meta charset="utf-8">
<title>openstream #24 - LLM cleanup latency spike</title>
<style>
 :root{--bg:#fff;--fg:#16181d;--mut:#5c6370;--line:#e3e6ea;--card:#f7f8fa;
       --good:#0a7d3f;--bad:#b3261e;--warn:#8a6100;--acc:#2f4bd8}
 @media(prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e7e9ee;--mut:#9aa3b2;
   --line:#2a2e36;--card:#1b1e24;--good:#4ade80;--bad:#f87171;--warn:#fbbf24;--acc:#8ab0ff}}
 *{box-sizing:border-box}
 body{margin:0;padding:2rem 1.25rem 5rem;background:var(--bg);color:var(--fg);
   font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
   max-width:1180px;margin-inline:auto}
 h1{font-size:1.55rem;margin:0 0 .2rem} h2{font-size:1.15rem;margin:2.5rem 0 .6rem;
   padding-bottom:.3rem;border-bottom:1px solid var(--line)}
 h3{font-size:.95rem;margin:1.4rem 0 .4rem}
 .sub{color:var(--mut);margin:0 0 1.5rem;font-size:.9rem}
 .banner{background:var(--card);border-left:3px solid var(--warn);padding:.8rem 1rem;
   border-radius:6px;margin:0 0 1.5rem;font-size:.9rem}
 table{border-collapse:collapse;width:100%;font-size:.87rem;margin:.5rem 0 1rem}
 th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid var(--line);
   vertical-align:top}
 th{color:var(--mut);font-weight:600;font-size:.78rem;text-transform:uppercase;
   letter-spacing:.03em}
 td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
 .good{color:var(--good)} .bad{color:var(--bad)} .warn{color:var(--warn)}
 .wrap{overflow-x:auto}
 .q{background:var(--card);border-radius:8px;padding:.9rem 1.1rem;margin:.9rem 0}
 .q .lab{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;
   color:var(--mut);margin-bottom:.2rem}
 .q .txt{font-size:.88rem;white-space:pre-wrap}
 .grid{display:grid;gap:.6rem}
 @media(min-width:900px){.grid{grid-template-columns:1fr 1fr}}
 .bar{height:9px;border-radius:5px;background:var(--acc);display:inline-block;
   vertical-align:middle}
 .bar2{height:9px;border-radius:5px;background:var(--mut);display:inline-block;
   vertical-align:middle;opacity:.55}
 code{background:var(--card);padding:.1rem .3rem;border-radius:4px;font-size:.85em}
 .foot{color:var(--mut);font-size:.82rem;margin-top:2.5rem;border-top:1px solid var(--line);
   padding-top:1rem}
</style>""")

    p.append(f"<h1>Does the local LLM cleanup pass earn its latency?</h1>")
    p.append(f'<p class="sub">openstream issue #24 &middot; throwaway measurement spike &middot; '
             f'{esc(meta["machine"])}, {meta["ram_gb"]} GB, macOS {esc(meta["macos"])} &middot; '
             f'{esc(meta["when"])} &middot; median of {meta["reps"]} runs</p>')

    p.append('<div class="banner"><strong>Read the assumptions first.</strong> '
             'Measured on an M3 MacBook Air, 16 GB - fanless, but above the 8 GB floor. '
             'These numbers are <em>not</em> worst-case for memory and not representative of '
             'a fully heat-soaked machine. Dictation audio is <code>say</code> TTS at 150 wpm, '
             'so it is cleaner than real speech: real disfluencies are non-lexical and whisper '
             'drops them more readily than the crisp "um" TTS produces. '
             'Both models are held resident and warmed; model load is reported separately.</div>')

    # ---------------- headline latency ----------------
    p.append("<h2>1. Warm per-dictation latency</h2>")
    p.append('<p class="sub">End of speech &rarr; text ready. Cleanup is the '
             'cost the LLM adds on top of transcription.</p>')
    p.append('<div class="wrap"><table><tr><th>Sample</th><th>Bucket</th>'
             '<th class="n">Audio</th><th class="n">Words</th>'
             '<th class="n">Transcribe<br>base.en</th><th class="n">Transcribe<br>small.en</th>'
             '<th class="n">Rules</th><th class="n">Cleanup 3B</th><th class="n">Cleanup 1B</th>'
             '<th class="n">Total<br>base+3B</th><th class="n">Total<br>base+rules</th></tr>')

    for sid, d in samples:
        tb = d.get("transcribe_seconds_base.en")
        ts = d.get("transcribe_seconds_small.en")
        rs = d.get("rules_seconds", 0)
        l3 = d.get("llm_llama-3.2-3b_seconds_from_base.en")
        l1 = d.get("llm_llama-3.2-1b_seconds_from_base.en")
        tot3 = (tb or 0) + (l3 or 0)
        totr = (tb or 0) + rs
        cls = "bad" if tot3 > 2.0 else ("warn" if tot3 > 1.0 else "good")
        p.append(
            f"<tr><td><code>{esc(sid)}</code></td><td>{esc(d['bucket'])}</td>"
            f"<td class='n'>{d.get('audio_seconds','?')}s</td><td class='n'>{d['words']}</td>"
            f"<td class='n'>{tb:.2f}s</td><td class='n'>{ts:.2f}s</td>"
            f"<td class='n good'>{rs*1000:.2f}ms</td>"
            f"<td class='n'>{l3:.2f}s</td><td class='n'>{l1:.2f}s</td>"
            f"<td class='n {cls}'><strong>{tot3:.2f}s</strong></td>"
            f"<td class='n good'><strong>{totr:.2f}s</strong></td></tr>")
    p.append("</table></div>")

    # bucket means
    p.append("<h3>By length bucket (mean total, whisper base.en)</h3>")
    p.append('<div class="wrap"><table><tr><th>Bucket</th><th class="n">Transcribe</th>'
             '<th class="n">+ rules</th><th class="n">+ 1B</th><th class="n">+ 3B</th>'
             '<th>3B total</th></tr>')
    maxtot = 0.1
    rows = []
    for b in ["short", "sentence", "paragraph"]:
        ds = [d for _, d in samples if d["bucket"] == b]
        tb = statistics.mean(d["transcribe_seconds_base.en"] for d in ds)
        rs = statistics.mean(d["rules_seconds"] for d in ds)
        l1 = statistics.mean(d["llm_llama-3.2-1b_seconds_from_base.en"] for d in ds)
        l3 = statistics.mean(d["llm_llama-3.2-3b_seconds_from_base.en"] for d in ds)
        rows.append((b, tb, rs, l1, l3))
        maxtot = max(maxtot, tb + l3)
    for b, tb, rs, l1, l3 in rows:
        w = int((tb + l3) / maxtot * 260)
        wt = int(tb / maxtot * 260)
        cls = "bad" if tb + l3 > 2.0 else ("warn" if tb + l3 > 1.0 else "good")
        p.append(
            f"<tr><td>{b}</td><td class='n'>{tb:.2f}s</td>"
            f"<td class='n good'>{tb+rs:.2f}s</td><td class='n'>{tb+l1:.2f}s</td>"
            f"<td class='n {cls}'>{tb+l3:.2f}s</td>"
            f"<td><span class='bar2' style='width:{wt}px'></span>"
            f"<span class='bar' style='width:{w-wt}px'></span></td></tr>")
    p.append("</table></div>")
    p.append('<p class="sub">Grey = transcribe, blue = 3B cleanup on top.</p>')

    # ---------------- cold start ----------------
    p.append("<h2>2. Startup cost (paid once per app launch, not per dictation)</h2>")
    p.append('<div class="wrap"><table><tr><th>Process</th>'
             '<th class="n">Spawn &rarr; first result</th></tr>')
    for k, v in r["cold_start"].items():
        p.append(f"<tr><td><code>{esc(k)}</code></td><td class='n'>{v:.2f}s</td></tr>")
    p.append("</table></div>")
    p.append('<p class="sub">If <code>llama-server</code> is started lazily on the first '
             'dictation instead of at app launch, that first dictation pays this on top.</p>')

    # ---------------- sustained ----------------
    if sustained:
        it = sustained["iterations"]
        cfg = sustained["config"]
        p.append("<h2>3. Sustained use on a fanless machine</h2>")
        p.append(f'<p class="sub">{len(it)} back-to-back dictations over '
                 f'{cfg["minutes"]} minutes, whisper {esc(cfg["whisper"])} + '
                 f'{esc(cfg["llm"])}. Wall-clock drift is a sudo-free proxy for thermal '
                 'behaviour - no power or temperature sensors were read. '
                 'The run cycles through samples of different lengths, so drift is '
                 'computed <strong>per sample against itself</strong> - comparing the '
                 'first and last iterations outright would just measure which clip '
                 'happened to land there.</p>')
        p.append('<div class="wrap"><table><tr><th>Sample</th><th class="n">n</th>'
                 '<th class="n">First third</th><th class="n">Last third</th>'
                 '<th class="n">Drift</th></tr>')
        by_id = {}
        for x in it:
            by_id.setdefault(x["id"], []).append(x["total"])
        drifts = []
        for sid in sorted(by_id):
            runs = by_id[sid]
            k = max(1, len(runs) // 3)
            a, b = statistics.mean(runs[:k]), statistics.mean(runs[-k:])
            dr = (b / a - 1) * 100
            drifts.append(dr)
            dc = "bad" if dr > 20 else ("warn" if dr > 8 else "good")
            p.append(f"<tr><td><code>{esc(sid)}</code></td><td class='n'>{len(runs)}</td>"
                     f"<td class='n'>{a:.2f}s</td><td class='n'>{b:.2f}s</td>"
                     f"<td class='n {dc}'>{dr:+.1f}%</td></tr>")
        agg = statistics.mean(drifts)
        dcls = "bad" if agg > 20 else ("warn" if agg > 8 else "good")
        p.append(f"<tr><td><strong>mean</strong></td><td></td><td></td><td></td>"
                 f"<td class='n {dcls}'><strong>{agg:+.1f}%</strong></td></tr>")
        p.append("</table></div>")

    # ---------------- quality ----------------
    p.append("<h2>4. Output quality, side by side</h2>")
    p.append('<p class="sub">Judge these yourself - this is the half no timer can answer. '
             '"Whisper raw" is what the STT actually produced; each cleanup path runs on '
             'that same text.</p>')
    for sid, d in samples:
        p.append(f'<h3><code>{esc(sid)}</code> &middot; {esc(d["bucket"])} '
                 f'&middot; {d["words"]} words</h3>')
        p.append('<div class="q"><div class="lab">Whisper base.en raw</div>'
                 f'<div class="txt">{esc(d.get("transcript_base.en"))}</div></div>')
        p.append('<div class="grid">')
        for lab, key in [
            ("Rules only", "rules_from_base.en"),
            ("Llama 3.2 1B", "llm_llama-3.2-1b_from_base.en"),
            ("Llama 3.2 3B", "llm_llama-3.2-3b_from_base.en"),
            ("Human reference", "reference"),
        ]:
            p.append(f'<div class="q"><div class="lab">{lab}</div>'
                     f'<div class="txt">{esc(d.get(key))}</div></div>')
        p.append('</div>')

    p.append('<p class="foot">Throwaway spike for openstream issue #24. '
             'Not production code - no tests, no error handling, no persistence. '
             'Regenerate with <code>python3 bench.py latency &amp;&amp; '
             'python3 bench.py sustained &amp;&amp; python3 report.py</code>.</p>')

    (OUT / "report.html").write_text("\n".join(p))
    print(f"wrote {OUT / 'report.html'}")


if __name__ == "__main__":
    main()
