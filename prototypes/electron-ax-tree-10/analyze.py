#!/usr/bin/env python3
# PROTOTYPE — summarise issue #10 tree-richness probe logs as a markdown table.
# Usage: ./analyze.py logs/session.jsonl > RESULTS.md
import json
import sys


def load_trials(paths):
    trials = []
    current = None
    for path in paths:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                event = json.loads(line)
                if event["event"] == "trialStart":
                    if current:
                        trials.append(current)
                    current = {"start": event, "steps": []}
                elif current is not None:
                    current["steps"].append(event)
    if current:
        trials.append(current)
    return trials


def summarise(trial):
    start = trial["start"]
    rows = []
    baseline = next((s for s in trial["steps"] if s["event"] == "baseline"), None)
    mechanism_runs = []
    current_mechanism = None
    for step in trial["steps"]:
        if step["event"] == "setAttribute":
            current_mechanism = {
                "mechanism": step["mechanism"],
                "setResult": step["result"],
                "setDurationMs": step["durationMs"],
            }
        elif step["event"] == "pollSucceeded":
            m = current_mechanism or {"mechanism": step["mechanism"]}
            m.update({
                "pollResult": "succeeded",
                "elapsedMs": step["elapsedMs"],
                "attempts": step["attempt"],
                "treeNodeCount": step["treeNodeCount"],
                "treeMaxDepth": step["treeMaxDepth"],
                "treeCappedAt": step["treeCappedAt"],
            })
            mechanism_runs.append(m)
            current_mechanism = None
        elif step["event"] == "pollTimedOut":
            m = current_mechanism or {"mechanism": step["mechanism"]}
            m.update({"pollResult": "timedOut", "attempts": step["attempts"]})
            mechanism_runs.append(m)
            current_mechanism = None
    return {
        "app": start.get("appName", "?"),
        "bundleId": start.get("bundleId", "?"),
        "note": start.get("note", ""),
        "baseline": baseline["result"] if baseline else "?",
        "runs": mechanism_runs,
    }


def main():
    paths = sys.argv[1:]
    if not paths:
        print("usage: ./analyze.py logs/*.jsonl", file=sys.stderr)
        sys.exit(2)
    trials = [summarise(t) for t in load_trials(paths)]

    print("# Issue #10 electron-ax-tree probe results\n")
    print("| App | Note | Baseline | Mechanism | Set result | Poll result | Elapsed (ms) | Attempts | Tree nodes | Tree depth | Capped |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for t in trials:
        if not t["runs"]:
            print(f"| {t['app']} | {t['note']} | {t['baseline']} | (none) | - | - | - | - | - | - | - |")
            continue
        for r in t["runs"]:
            print(
                f"| {t['app']} | {t['note']} | {t['baseline']} | {r.get('mechanism','?')} "
                f"| {r.get('setResult','-')} | {r.get('pollResult','-')} | {r.get('elapsedMs','-')} "
                f"| {r.get('attempts','-')} | {r.get('treeNodeCount','-')} | {r.get('treeMaxDepth','-')} "
                f"| {r.get('treeCappedAt','-')} |"
            )


if __name__ == "__main__":
    main()
