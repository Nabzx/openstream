# TCC attribution probe (issue #46)

PROTOTYPE. Throwaway code that answers one question. Not a native helper, not
production, no tests, do not build on this.

## The question

Does each native helper hold its own Accessibility and Input Monitoring grant,
or does the Electron host hold them on the helpers' behalf?

Issue #26 settled on **two** helpers split on the permission boundary: a hotkey
helper (Input Monitoring) and an accessibility helper (Accessibility), both
spawned by the Electron main process over stdio. Two macOS mechanisms point
opposite ways about who the resulting TCC entry belongs to:

- The **responsible process** mechanism attributes a spawned child's TCC
  requests to the parent GUI app, which would put all the grants on the
  Electron bundle.
- **Accessibility and Input Monitoring** appear to be checked against the
  *calling* binary's code requirement, which would give each helper its own
  entry keyed to its own CDHash.

This cannot be settled by reading: sources conflict, and the TCC databases are
SIP-protected. So the artifact is an experiment, not a demo.

This is neither of the prototype skill's two standard shapes (a clickable state
model, or UI variants), for the same reason as
`prototypes/context-detection-spike`: the question is empirical and about real
OS behaviour, so the artifact is an instrumented build you drive by hand.

## Why the answer matters

- **Blast radius per rebuild.** If the helpers hold their own grants, a rebuild
  touching only the Electron JavaScript breaks nothing, because issue #40 makes
  helper builds deterministic. If the Electron host holds them, every
  JavaScript change drops every grant and the deterministic helper build buys
  nothing.
- **Whether `tccutil reset` is usable at all.** It needs a bundle identifier
  known to LaunchServices. A bare helper binary has none.
- **What the grant check actually probes.** The build-script warning and the
  app start gate have to test the right binary.

## What gets built

`./build.sh` produces `build/TCCProbe.app`: a real, ad-hoc-signed Electron
bundle with its own bundle id (`dev.openstream.prototype.tccprobe`), containing
two stub Swift helpers at `Contents/Resources/helpers/`. The Electron main
process spawns them over stdio, exactly like the planned architecture.

Three subjects, each reporting its own grant state:

| Subject | Grant probed | Reported via | Functionally probed via |
| --- | --- | --- | --- |
| `TCCProbe.app` (Electron host) | Accessibility, Microphone | `systemPreferences` | - |
| `axhelper` | Accessibility | `AXIsProcessTrusted()` | a real `AXUIElementCopyAttributeValue` on the frontmost app |
| `hotkeyhelper` | Input Monitoring | `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)` | a real listen-only `CGEvent` tap |

Reported and functional are recorded separately because they can disagree, and
when they do the functional one is the truth.

Each helper also prints the three fields the question turns on:

- **`cdhash`** - the code identity a per-helper TCC entry would be keyed to.
- **`bundleIdentifier`** - `null` for a bare Mach-O. If it is null, `tccutil
  reset` has no target for that binary.
- **`responsiblePid` / `responsibleExecutable`** - the process macOS holds
  responsible for this process's TCC requests, read through
  `responsibility_get_pid_responsible_for_pid`. This is the responsible-process
  mechanism itself, read directly rather than inferred.

## Running it

```sh
./build.sh                 # full build; fetches Electron once into vendor/
open build/TCCProbe.app    # the window: buttons, prompts, full state per click
./readstate.sh <label>     # no UI: dump all three subjects to logs/ as JSON
```

The window reads all three subjects on launch and after every button click, and
"Copy report to clipboard" dumps every reading as JSON for pasting into
RESULTS.md. `readstate.sh` captures the same readings without a human clicking,
which is what you want immediately after a rebuild.

**Always launch through `open` or `readstate.sh`, never by running the binary
from a shell.** Starting it from a terminal makes that terminal's GUI app
(Terminal, iTerm, VS Code) the *responsible process*, and responsible-process
attribution is the exact mechanism under test. Measured, both ways:

```
launched from a VS Code terminal   responsible = /Applications/Visual Studio Code.app/...
launched via `open`                responsible = .../TCCProbe.app/Contents/MacOS/TCCProbe
```

`logs/state.log` accumulates the CDHash of the app and both helpers after every
build, so the two rebuild arms are auditable after the fact.

## The experiment

Steps 3 and 5 need a human at the machine: the grant has to be given in System
Settings, and the System Settings list itself is a large part of the evidence.

1. `./build.sh`
2. `./readstate.sh baseline`. Expect everything denied. This is the pre-grant
   baseline and needs no clicking.
3. **(human)** `open build/TCCProbe.app`, click **Spawn axhelper (--prompt)**,
   then **Spawn hotkeyhelper (--prompt)**. Grant both in System Settings >
   Privacy & Security.
   **Record what the list names**: an entry called `TCCProbe`, or entries called
   `axhelper` / `hotkeyhelper`. That single observation answers most of the
   question on its own.
4. `./readstate.sh granted`. Confirm everything now passes, so the baseline is
   a real grant and not a stale prompt.
5. `./rebuild-js.sh` then `./readstate.sh arm1-js` - **arm 1**, JavaScript
   changes, helpers untouched. The script asserts the helper CDHashes did not
   move.
   - Helpers still pass, host drops → grants are **per-helper**.
   - All three drop → the **Electron bundle** holds them.
6. `./rebuild-helpers.sh` then `./readstate.sh arm2-helpers` - **arm 2**,
   helpers recompiled with a new build tag so their CDHash really moves,
   JavaScript untouched. The script asserts the CDHash moved.
   - Helpers now fail → the entry is keyed to the helper's own code identity.
   - Helpers still pass → it is not.
7. Try `tccutil reset Accessibility dev.openstream.prototype.tccprobe` and note
   whether it clears the helper's state, the host's, or nothing.

Record each step in `RESULTS.md` as it happens. Every cell there must be a real
observation; anything not measured says so.

## Cleaning up

The prototype grants are real TCC entries. When finished, remove `TCCProbe`,
`axhelper` and `hotkeyhelper` from System Settings > Privacy & Security >
Accessibility and > Input Monitoring, and delete `build/`.
