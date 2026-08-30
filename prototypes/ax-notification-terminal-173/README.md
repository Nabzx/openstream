# NSWorkspace notification-delivery prototype — issue #173

**Throwaway measurement harness. It is not production helper code.**

## Question

`RealAppSwitchTracker` (in `native/accessibility-helper`) registers `NSWorkspace.didActivateApplicationNotification` on a background thread with a pumped run loop - the same pattern this harness uses. Running the real app from VS Code's integrated terminal instead of a plain Terminal window reproducibly left it stuck on whatever was frontmost at launch, no matter what real app was switched to afterward (see the issue body for the full reproduction).

The working theory, from this project's own prior research (`prototypes/tcc-attribution-46/RESULTS.md`, issue #46): launching from an IDE-integrated terminal changes how macOS attributes the spawned process tree, and the same attribution quirk might mean the distributed `NSWorkspace` notification never reaches an observer registered by a process launched this way.

This harness isolates exactly that question, stripped down from the full app: does a minimal process, launched from each terminal type, actually *receive* the notification when a real app switch happens - independent of Accessibility permissions, AX tree state, or anything else the full app also has going on.

## Before running

Have 2-3 real apps open and ready to switch between (Notes, Safari, whatever's convenient).

## Running a trial

One trial = one terminal type, ~35 seconds, switching apps a few times while it runs:

```bash
cd prototypes/ax-notification-terminal-173

# from a normal Terminal.app window:
./run.sh plain-terminal

# from VS Code's integrated terminal panel (Terminal > New Terminal, or Ctrl+`):
./run.sh vscode-terminal
```

Switch between your 2-3 apps a few times during each ~35 second run - at least 3-4 real switches, spaced out rather than all at once. Each run writes its own timestamped log to `logs/`, so running each label multiple times is fine and just adds more data.

## Analyze

```bash
./analyze.py logs/*.jsonl
```

For each run, this reports the process ancestry (what this process was actually launched under - hard evidence, not an assumption from which window you typed the command into), how many real app transitions happened (from the periodic direct poll, the ground truth), and how many notification events the observer actually received. A run with real transitions but zero notification events is the bug, reproduced in isolation.

## Capture

Keep this harness and raw logs on the throwaway `prototype/ax-notification-terminal-173` branch, same convention as `../injection-thresholds-74` and `../electron-ax-tree-10`. The resolution comment on issue #173 holds the answer.
