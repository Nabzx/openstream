# Results (issue #46)

Status: **harness verified, experiment not yet run.** The build, both helpers,
the Electron host, the headless capture and both rebuild arms have been run and
checked. The experiment itself needs a human at the machine, because the grant
must be given in System Settings and the System Settings list is itself the
main evidence.

Every cell below must be a real observation from a run. Cells that were not
measured say so. Nothing here is inferred.

Machine: macOS 15.6.1 (Darwin 24.6.0), Apple Silicon, Swift 6.1.2,
Electron (see `app/package.json`).

## What is already measured

These came from running the helpers directly, before any grant existed. They
are real, but they are the setup, not the answer.

| Observation | Value | Reading |
| --- | --- | --- |
| `axhelper` `bundleIdentifier` | `null` | A bare Mach-O helper has no bundle identifier, so `tccutil reset <id>` has **no target** for it. If grants attach per-helper, there is no supported way to clear a stale entry; the user must remove it by hand in System Settings. |
| `hotkeyhelper` `bundleIdentifier` | `null` | Same. |
| `responsibleExecutable`, both helpers, app launched via `open` | `.../TCCProbe.app/Contents/MacOS/TCCProbe` | **The responsible-process mechanism does attribute both spawned helpers to the Electron host.** Each helper's immediate parent is also TCCProbe, and macOS names TCCProbe responsible for its TCC requests. So the mechanism from the issue is real and active here. It does *not* yet follow that Accessibility and Input Monitoring key on it - that is what steps 3-6 decide. |
| `responsibleExecutable`, same binaries, launched from a VS Code terminal | `/Applications/Visual Studio Code.app/Contents/MacOS/Code` | Responsibility walks up to the ancestor **GUI app**, not the immediate parent shell. This is a methodology hazard, not a finding: launching the probe from a terminal silently substitutes the terminal for the app under test. `readstate.sh` launches via `open` for this reason. |
| `adhocSigned` | `true` for both helpers | Ad-hoc signing works and each helper carries a distinct `signingIdentifier` and CDHash. |
| Arm 1 invariant (`rebuild-js.sh`) | helper CDHashes unchanged: `00667d0a…`, `b57a6437…` | The JS-only rebuild is genuinely helper-neutral even though the whole bundle is re-signed `--deep`. Ad-hoc signing is deterministic over identical content, so arm 1 isolates the variable it claims to. |
| Arm 2 invariant (`rebuild-helpers.sh`) | axhelper CDHash moved `00667d0a…` → `c997c749…`, and its `signingIdentifier` moved too | The helper-only rebuild really does change helper code identity, including the ad-hoc signing identifier and therefore the designated requirement. Arm 2 isolates its variable. |

## Step 2 - baseline, before any grant

Not measured yet.

| Subject | CDHash | Reported | Functional |
| --- | --- | --- | --- |
| `TCCProbe.app` | - | - | - |
| `axhelper` | - | - | - |
| `hotkeyhelper` | - | - | - |

## Step 3 - what System Settings names

**The single most decisive observation.** Not measured yet.

| Pane | Entry name(s) that appeared | Names the `.app` or the helper binary? |
| --- | --- | --- |
| Accessibility | - | - |
| Input Monitoring | - | - |

## Step 4 - after granting, before any rebuild

Not measured yet.

| Subject | Reported | Functional |
| --- | --- | --- |
| `TCCProbe.app` | - | - |
| `axhelper` | - | - |
| `hotkeyhelper` | - | - |

## Step 5 - arm 1: JavaScript rebuilt, helpers untouched

Not measured yet. `rebuild-js.sh` asserts the helper CDHashes did not move;
record whether that assertion held.

| Subject | CDHash moved? | Reported | Functional |
| --- | --- | --- | --- |
| `TCCProbe.app` | - | - | - |
| `axhelper` | - | - | - |
| `hotkeyhelper` | - | - | - |

Reading: helpers still pass and the host drops → grants are per-helper.
All three drop → the Electron bundle holds them.

## Step 6 - arm 2: helpers rebuilt, JavaScript untouched

Not measured yet. `rebuild-helpers.sh` asserts the helper CDHash did move;
record whether that assertion held.

| Subject | CDHash moved? | Reported | Functional |
| --- | --- | --- | --- |
| `TCCProbe.app` | - | - | - |
| `axhelper` | - | - | - |
| `hotkeyhelper` | - | - | - |

Reading: helpers now fail → the entry is keyed to the helper's own code
identity. Helpers still pass → it is not.

## Step 7 - `tccutil reset`

**Half measured.** Both commands were run against a clean checkout with *no
grant in place*, so they establish only that the host bundle id is a valid
target. What they clear once a real grant exists is still open.

| Command | Exit status | What it actually cleared |
| --- | --- | --- |
| `tccutil reset Accessibility dev.openstream.prototype.tccprobe` | 0, `Successfully reset Accessibility approval status` | Unknown - no grant existed yet. |
| `tccutil reset ListenEvent dev.openstream.prototype.tccprobe` | 0, `Successfully reset ListenEvent approval status` | Unknown - no grant existed yet. |
| Control: `tccutil reset Accessibility com.example.definitely.not.installed.xyz` | 64, `No such bundle identifier ... OSStatus -10814` | n/a |

The control is what makes the two exit-0 results mean anything: `tccutil`
rejects a bundle id LaunchServices does not know. So the host bundle id **is** a
usable target and `ListenEvent` **is** the right service name for Input
Monitoring. Neither helper has a bundle id at all (measured above), so this
target can only ever reach the host's entry. Whether that is enough depends
entirely on steps 5 and 6.

## Verdict

Not reached. The three answers this ticket owes issue #23:

1. Which binary each grant attaches to - **open**.
2. Whether `tccutil reset` has a usable target - **partially answered**: the
   helpers have no bundle identifier, so if grants attach per-helper the answer
   is no. Confirmed by measurement above, but conditional on step 5/6.
3. How much of the per-rebuild problem the deterministic helper build removes -
   **open**, follows from 1.
