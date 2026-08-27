#!/usr/bin/env python3
"""PROTOTYPE - throwaway. Builds out/review.html from out/results.json.

One self-contained file, no server, no framework: open it by double-click.
It carries the parts a person has to judge and a machine cannot:

  1. Does the model's bulleted-and-paragraphed output actually read well? -
     rendered beside the plain-prose baseline and #124's rules-only pass.
  2. On the decoy samples, did the model resist flagging a list where the
     ordinal words are just a turn of phrase?
  3. Fallback: does a malformed LIST line degrade to prose, never a guess?

Usage:  python3 report.py            # after bench.py has written results.json
"""
import html
import json
import pathlib

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
R = json.loads((OUT / "results.json").read_text())
MODELS = list(R["cold_start"].keys())
BUDGET = R["meta"]["budget_seconds"] - R["meta"]["transcribe_plus_rules_130w"]


def esc(s):
    return html.escape(str(s)).replace("\n", "<br>")


def latency_rows():
    by_bucket = {}
    for d in R["samples"].values():
        for m, run in d["runs"].items():
            by_bucket.setdefault(d["bucket"], {}).setdefault(m, []).append(run["seconds"])
    out = []
    for bucket, per_model in sorted(by_bucket.items()):
        cells = "".join(
            f"<td>{min(v):.3f} / {max(v):.3f}s</td>" for v in per_model.values())
        out.append(f"<tr><th>{bucket} words</th>{cells}</tr>")
    return "".join(out)


def sample_block(sid, d):
    ref = d["reference"]
    rows = [f"<h3>{sid} <small>({d['group']}, {d['n_sentences']} sentences, "
            f"reference list={ref['list']})</small></h3>"]
    if not d["asked"]:
        rows.append("<p class=skip>below MIN_SENTENCES - never asked</p>")
    rows.append(f"<div class=col><h4>plain prose</h4><p>{esc(' '.join(d['sentences']))}</p></div>")
    for m in MODELS:
        run = d["runs"].get(m)
        if not run:
            continue
        flag = " <span class=fp>FALSE-POSITIVE LIST</span>" if run["list_false_positive"] else ""
        rows.append(
            f"<div class=col><h4>{m}{flag}</h4>"
            f"<pre class=reply>{esc(run['reply'])}</pre>"
            f"<div class=rendered>{esc(run['rendered'])}</div>"
            f"<p class=meta>{run['seconds']:.3f}s · break_match="
            f"{run['break_match']} · list_overlap={run['list_overlap']}</p></div>")
    return f"<section>{''.join(rows)}</section>"


def main():
    body = [
        "<h1>#125 list-boundary review</h1>",
        f"<p>{R['meta']['machine']}, {R['meta']['ram_gb']} GB, "
        f"macOS {R['meta']['macos']} · {R['meta']['when']} · headroom "
        f"{BUDGET:.2f}s (#67 break-only was "
        f"{R['meta']['break_only_67_130w']}s)</p>",
        "<h2>1. Latency (min / max warm median per bucket)</h2>",
        f"<table><tr><th></th>{''.join(f'<th>{m}</th>' for m in MODELS)}</tr>"
        f"{latency_rows()}</table>",
        "<h2>2. Per-sample: does it read well?</h2>",
        "<p>Judge the <b>rendered</b> column. Decoys must show LIST: none.</p>",
    ]
    for sid, d in R["samples"].items():
        body.append(sample_block(sid, d))

    style = """
    body{font:14px/1.5 -apple-system,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem}
    table{border-collapse:collapse;margin:1rem 0}td,th{border:1px solid #ccc;padding:.3rem .6rem;text-align:left}
    section{border-top:2px solid #333;margin:2rem 0;padding-top:1rem}
    .col{display:inline-block;vertical-align:top;width:32%;margin-right:1%}
    .reply{background:#f4f4f4;padding:.4rem;white-space:pre-wrap}
    .rendered{background:#fffdf0;border:1px solid #e8e0b0;padding:.5rem;white-space:pre-wrap}
    .meta{color:#666;font-size:12px}.skip{color:#999;font-style:italic}
    .fp{background:#c00;color:#fff;padding:0 .3rem;border-radius:3px;font-size:11px}
    """
    doc = (f"<!doctype html><meta charset=utf-8><title>#125 review</title>"
           f"<style>{style}</style>{''.join(body)}")
    (OUT / "review.html").write_text(doc)
    print(f"wrote {OUT / 'review.html'}")


if __name__ == "__main__":
    main()
