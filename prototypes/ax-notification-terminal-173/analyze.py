#!/usr/bin/env python3
# PROTOTYPE — summarise issue #173 notification-delivery probe logs.
# Usage: ./analyze.py logs/*.jsonl
import json
import sys


def analyze(path):
    events = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))

    polls = [e for e in events if e["event"] == "directPoll"]
    notifications = [e for e in events if e["event"] == "notificationReceived"]
    ancestry = next((e for e in events if e["event"] == "processAncestry"), None)

    # A "real transition" is a change in what directPoll observed between
    # consecutive polls - the ground truth for whether the app actually
    # switched during this run, independent of whether the notification
    # observer saw it.
    transitions = 0
    for prev, cur in zip(polls, polls[1:]):
        if prev["appName"] != cur["appName"]:
            transitions += 1

    print(f"=== {path} ===")
    if ancestry:
        chain = " -> ".join(f"{p['name']}({p['pid']})" for p in ancestry["chain"])
        print(f"  process ancestry: {chain}")
    print(f"  polls: {len(polls)}, real app transitions observed: {transitions}")
    print(f"  notification events received: {len(notifications)}")
    if transitions > 0 and len(notifications) == 0:
        print("  VERDICT: BUG REPRODUCED - real transitions happened but the observer never fired.")
    elif transitions == 0:
        print("  VERDICT: inconclusive - no app switching happened during this run, re-run and actually switch apps.")
    elif transitions > 0 and len(notifications) > 0:
        print("  VERDICT: notifications delivered correctly for this run.")
    print()


def main():
    paths = sys.argv[1:]
    if not paths:
        print("usage: ./analyze.py logs/*.jsonl", file=sys.stderr)
        sys.exit(2)
    for path in paths:
        analyze(path)


if __name__ == "__main__":
    main()
