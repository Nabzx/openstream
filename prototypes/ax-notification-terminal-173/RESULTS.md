Status: **complete — the working theory is disproven, and the real root cause is found.**

## The three runs

| Log | Ancestry (immediate parent) | Real transitions | Notifications received | Verdict |
|---|---|---|---|---|
| `smoke-validation` | `claude.exe` (this CLI's shell) | 2 | 2 | delivered correctly |
| `plain-terminal` | `herdr` (Terminal.app login shell) | 7 | 8 | delivered correctly |
| `vscode-terminal` | `Code Helper` → `Code` | 5 | 5 | delivered correctly |

The `vscode-terminal` run is genuinely parented under VS Code's process tree, and it received **every** app switch — the notification observer fired for each one and the periodic direct poll matched immediately after.

## Conclusion

**`NSWorkspace.didActivateApplicationNotification` delivery is not the problem.** A minimal process that registers the observer exactly the way `RealAppSwitchTracker` does — `queue: nil`, on a background thread, with `RunLoop.current.run()` — receives every notification, from all three launch contexts including VS Code's integrated terminal. The `#46` TCC-attribution quirk does not extend to `NSWorkspace` notification delivery.

The bug is something the probe does **not** replicate: the probe also runs `RunLoop.main.run()` on its main thread. The real `accessibility-helper` never does — its main thread is parked in `readLine()` for the stdin command loop. `NSWorkspace` notifications are posted on the **main thread's run loop**; with `queue: nil` the observer block runs on that thread. The helper's background thread pumps its *own* run loop, but `NSWorkspace` never posts there, so the observer block **never fires** and the cached frontmost app stays frozen at the `init()` value.

It was broken from *every* terminal, not just VS Code — VS Code just made the staleness obvious (full-screening Notes while the tracker stayed stuck on "Code").

If the probe's `RunLoop.main.run()` line is removed, it reproduces the bug identically.

## Fix

`RealAppSwitchTracker.startObserving()` now schedules a 250ms `Timer` on the observing thread's run loop that reads `NSWorkspace.shared.frontmostApplication` directly and updates the cache on change — the exact read this probe's `directPoll` performed, which was accurate on every poll of every run. The main-thread notification is dropped entirely. See `fix/app-switch-tracker-runloop-173` / the resolution comment on #173.

## Reproducing

```bash
cd prototypes/ax-notification-terminal-173
./run.sh plain-terminal      # from a Terminal.app window, switch apps a few times
./run.sh vscode-terminal     # from VS Code's integrated terminal, same
./analyze.py logs/*.jsonl
```
