#!/usr/bin/env python3
"""PROTOTYPE: summarize issue #74 JSONL timing evidence. Standard library only."""

from __future__ import annotations

import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def percentile(values: list[int], p: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(p * len(ordered)) - 1)]


def stats(values: list[int]) -> str:
    if not values:
        return "n=0"
    return (
        f"n={len(values)} p50={percentile(values, .50)}ms "
        f"p95={percentile(values, .95)}ms p99={percentile(values, .99)}ms "
        f"max={max(values)}ms"
    )


def load(paths: list[Path]) -> list[dict]:
    rows: list[dict] = []
    for path in paths:
        with path.open() as handle:
            for line_number, line in enumerate(handle, 1):
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as error:
                    raise SystemExit(f"{path}:{line_number}: {error}")
                row["_source"] = path.name
                rows.append(row)
    return sorted(rows, key=lambda row: (row["_source"], row["uptimeMs"]))


def first_after(rows: list[dict], start: int, event: str, bundle: str, end: int | None = None) -> dict | None:
    for row in rows:
        at = row["uptimeMs"]
        if at < start:
            continue
        if end is not None and at >= end:
            return None
        if row["event"] == event and row.get("bundleID") == bundle:
            return row
    return None


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: analyze.py LOG.jsonl [LOG.jsonl ...]")
    paths = [Path(arg) for arg in sys.argv[1:]]
    all_rows = load(paths)

    request_to_notification: dict[str, list[int]] = defaultdict(list)
    request_to_frontmost: dict[str, list[int]] = defaultdict(list)
    notification_to_ax: dict[str, list[int]] = defaultdict(list)
    ax_query_duration: dict[str, list[int]] = defaultdict(list)
    timeouts: dict[str, int] = defaultdict(int)
    missing_notifications: dict[str, int] = defaultdict(int)
    requests = 0

    for source in sorted({row["_source"] for row in all_rows}):
        rows = [row for row in all_rows if row["_source"] == source]
        trial_requests = [row for row in rows if row["event"] == "activationRequest"]
        for index, request in enumerate(trial_requests):
            requests += 1
            bundle = request["bundleID"]
            started = request["uptimeMs"]
            ended = trial_requests[index + 1]["uptimeMs"] if index + 1 < len(trial_requests) else None
            notification = first_after(rows, started, "workspaceActivation", bundle, ended)
            frontmost = first_after(rows, started, "frontmostObserved", bundle, ended)
            if notification:
                request_to_notification[bundle].append(notification["uptimeMs"] - started)
                activation_key = notification.get("activationUptimeMs", notification["uptimeMs"])
                ax = first_after(rows, notification["uptimeMs"], "axReady", bundle, ended)
                if ax and ax.get("activationUptimeMs") == activation_key:
                    notification_to_ax[bundle].append(ax["uptimeMs"] - activation_key)
                    ax_query_duration[bundle].append(ax.get("queryDurationMs", 0))
                elif first_after(rows, notification["uptimeMs"], "axTimedOut", bundle, ended):
                    timeouts[bundle] += 1
            else:
                missing_notifications[bundle] += 1
            if frontmost:
                request_to_frontmost[bundle].append(frontmost["uptimeMs"] - started)

        # Manual runs have no request markers, but activation -> AX is still usable.
        if not trial_requests:
            activations = [row for row in rows if row["event"] == "workspaceActivation"]
            for index, activation in enumerate(activations):
                bundle = activation.get("bundleID", "")
                ended = activations[index + 1]["uptimeMs"] if index + 1 < len(activations) else None
                activation_key = activation.get("activationUptimeMs", activation["uptimeMs"])
                ax = first_after(rows, activation["uptimeMs"], "axReady", bundle, ended)
                if ax and ax.get("activationUptimeMs") == activation_key:
                    notification_to_ax[bundle].append(ax["uptimeMs"] - activation_key)
                    ax_query_duration[bundle].append(ax.get("queryDurationMs", 0))
                elif first_after(rows, activation["uptimeMs"], "axTimedOut", bundle):
                    timeouts[bundle] += 1

    bundles = sorted(
        set(request_to_notification)
        | set(request_to_frontmost)
        | set(notification_to_ax)
        | set(timeouts)
        | set(missing_notifications)
    )

    print("# Injection timing evidence — issue #74\n")
    print(f"Logs: {', '.join(path.name for path in paths)}")
    print(f"Automated activation requests: {requests}\n")

    print("## Per application\n")
    for bundle in bundles:
        print(f"### {bundle}")
        print(f"- request → NSWorkspace activation: {stats(request_to_notification[bundle])}")
        print(f"- request → frontmost observed: {stats(request_to_frontmost[bundle])}")
        print(f"- NSWorkspace activation → AX focus ready: {stats(notification_to_ax[bundle])}")
        print(f"- successful AX query duration: {stats(ax_query_duration[bundle])}")
        print(f"- AX timeouts (5s): {timeouts[bundle]}")
        print(f"- missing matching activation notifications: {missing_notifications[bundle]}\n")

    def flatten(values: dict[str, list[int]]) -> list[int]:
        return [item for group in values.values() for item in group]

    all_request_notification = flatten(request_to_notification)
    all_request_frontmost = flatten(request_to_frontmost)
    all_activation_ax = flatten(notification_to_ax)
    all_query_duration = flatten(ax_query_duration)

    print("## Overall distributions\n")
    print(f"- request → NSWorkspace activation: {stats(all_request_notification)}")
    print(f"- request → frontmost observed: {stats(all_request_frontmost)}")
    print(f"- NSWorkspace activation → AX focus ready: {stats(all_activation_ax)}")
    print(f"- successful AX query duration: {stats(all_query_duration)}")
    print(f"- total AX timeouts: {sum(timeouts.values())}")
    print(f"- total missing matching notifications: {sum(missing_notifications.values())}\n")

    print("## Threshold decision inputs\n")
    if all_activation_ax:
        p99 = percentile(all_activation_ax, .99) or 0
        maximum = max(all_activation_ax)
        print(f"- Empirical settle floor: p99 {p99}ms; observed maximum {maximum}ms.")
    else:
        print("- No successful activation-to-AX observations; no settle floor can be derived.")
    if all_request_notification:
        print(
            "- Activation-request tail: "
            f"p99 {percentile(all_request_notification, .99)}ms; max {max(all_request_notification)}ms."
        )
    print("- `settleMs` should exceed the chosen activation-to-AX tail plus an explicit margin.")
    print("- `stableForBlindPasteMs` is a product-risk policy informed by the tail; timing data alone cannot prove that a human is watching.")
    print("- `settleBudgetMs` should exceed reliable AX readiness but stop before a hung AX call makes the overlay feel broken.")
    print("- Do not copy these values into production until idle, stressed, and manual passes are all represented above.")


if __name__ == "__main__":
    main()
