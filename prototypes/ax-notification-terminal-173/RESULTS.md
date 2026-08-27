Status: **interim, one baseline data point.** The harness is validated and working end to end; the two runs that actually answer #173's question (plain Terminal.app vs. VS Code's integrated terminal) still need a human to run them, since they require an interactively-opened terminal window/panel.

## What this one run shows

`smoke-validation` ran from this session's own shell - ancestry shows it's parented under the Claude Code CLI process itself (`claude.exe`), not Terminal.app or VS Code. A third, distinct launch context, not one of the two the issue is actually about - but useful as a general sanity check: real app switches happened during the run (Terminal -> Code -> Chrome), and the notification observer received both of them correctly, with the direct-poll ground truth matching immediately after each one.

This confirms the harness's own mechanics work (it can and does detect real transitions when they happen) and that the general `NSWorkspace` notification mechanism isn't broken everywhere - just establishes a working control case from a third context, not evidence about VS Code specifically either way.

## Data

| Log | Ancestry (immediate parent) | Real transitions | Notifications received | Verdict |
|---|---|---|---|---|
| `smoke-validation` | `bash` -> `bash` -> `claude.exe` | 2 | 2 | delivered correctly |

## Still needed

- `./run.sh plain-terminal`, run from a normal Terminal.app window, switching apps a few times during the ~35s run.
- `./run.sh vscode-terminal`, same protocol, run from VS Code's integrated terminal panel (`Ctrl+\``).
- Compare: if `vscode-terminal`'s notification count is 0 while its transition count is > 0, that's #173 reproduced in isolation, independent of the full app's Accessibility permission/AX-tree state. If both terminal types show notifications delivered fine, the bug's root cause is somewhere other than notification delivery itself, and the full app needs re-examining for what's actually different about its own launch/registration path.
