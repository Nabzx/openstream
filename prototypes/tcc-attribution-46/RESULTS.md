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

## The run of 2026-08-24, and which half of it counts

The experiment was run twice back to back. **Only the first pass is valid**, and
the reason is recorded here because it is the easiest mistake to repeat.

| Time (UTC) | Event | Host CDHash |
| --- | --- | --- |
| 02:05:36 | `build.sh` | `157799ea…` |
| 02:12:58 | **`build.sh` again** - second wizard run, full rebuild | `4e05f21b…` |

The grant was given during the first pass and confirmed at 02:11:23. The second
`build.sh` at 02:12:58 moved the host CDHash, **and the grant did not survive
it**. Every capture from 02:13:00 onward reads denied, including the one the
operator confirmed as granted. So steps 5, 6 and 7 below measured denied → denied
and decide nothing.

## Step 2 - baseline, before any grant (VALID, 02:05:36)

| Subject | CDHash | Reported | Functional |
| --- | --- | --- | --- |
| `TCCProbe.app` | `157799ea…` | not trusted | - |
| `axhelper` | `dbfb26dc…` | false | false |
| `hotkeyhelper` | `5f24cfb7…` | `denied` | false |

Clean baseline: nothing granted, and `responsible` named TCCProbe, not a terminal.

## Step 3 - what System Settings names (VALID) - THE DECISIVE OBSERVATION

| Pane | Entry name(s) that appeared | Names the `.app` or the helper binary? |
| --- | --- | --- |
| Accessibility | **`TCCProbe`** | **The `.app`.** No entry named `axhelper` ever appeared. |
| Input Monitoring | **none** | No entry appeared at the moment of checking. See caveat below. |

## Step 4 - after granting, before any rebuild (VALID, 02:11:23)

| Subject | Reported | Functional |
| --- | --- | --- |
| `TCCProbe.app` | trusted | - |
| `axhelper` | **true** | **true** |
| `hotkeyhelper` | **`granted`** | **true** |

This is the load-bearing measurement. Granting **only** `TCCProbe` in the
Accessibility pane was sufficient to make `axhelper` both report and *function*
as trusted, and `axhelper` never had an entry of its own to grant.

Open caveat on Input Monitoring: the pane listed nothing at step 3, yet
`hotkeyhelper` moved from `denied` to `granted` by 02:11:23. Whether an entry
named `TCCProbe` appeared in that pane later in the sequence was not recorded.
The transition is real; the mechanism behind it is not established.

## Step 5 - arm 1: JavaScript rebuilt, helpers untouched (INVALID)

Ran at 02:14:43, after the grant had already been destroyed by the 02:12:58
rebuild. Went denied → denied. The CDHash invariant held (`152d05a4…`
unchanged), so the *harness* worked; the *measurement* is void. **Must be re-run.**

## Step 6 - arm 2: helpers rebuilt, JavaScript untouched (INVALID)

Ran at 02:16:30 from the same denied state. Helper CDHash moved
(`152d05a4…` → `8f4e7b9c…`) as designed, but with nothing granted the arm
decides nothing. **Must be re-run.**

## Step 7 - `tccutil reset`

Established earlier, and still valid: the host bundle id **is** a target
`tccutil` accepts (exit 0) while a bogus id is rejected (exit 64,
`OSStatus -10814`), and `ListenEvent` is the right service name for Input
Monitoring. Both helpers have no bundle identifier at all, so this target can
only ever reach the host's entry.

What the reset *clears* was not validly measured: it ran at 02:17:40 when
nothing was granted.

## Verdict

**Answered.** Which binary the Accessibility grant attaches to:

> **The Electron host holds it.** The System Settings list names `TCCProbe`, no
> entry for `axhelper` is ever offered, and granting the host alone makes the
> spawned helper functionally trusted. This is the responsible-process mechanism
> deciding the outcome, consistent with the earlier measurement that both
> helpers' responsible process resolves to `TCCProbe`.

**Answered.** Whether `tccutil reset` has a usable target: **yes, but only the
host's.** The helpers have no bundle identifier, so there is nothing per-helper
to reset - which is moot, because there is nothing per-helper to grant either.

**Still open, and it is the expensive one.** How much of the per-rebuild problem
the deterministic helper build removes. This needs arm 1 re-run against a live
grant. The evidence so far points the pessimistic way and should not be taken as
settled:

- A full rebuild moved the host CDHash and **did** drop the grant (02:12:58).
- `rebuild-js.sh` also moves the host CDHash (measured repeatedly: `5b9eeeb0…`,
  `a20dd4ab…`), even though it leaves the helpers untouched.

If the grant is keyed to the host's code identity, a JavaScript-only rebuild
drops it, and the deterministic helper build from #40 buys nothing for TCC. That
is an inference from two measurements, **not** an observation. Arm 1 must be run
against a real grant to settle it.

## How to re-run the arms correctly

Do **not** run `build.sh` again - that is what voided this run. From a granted
state:

```sh
./readstate.sh confirm-granted   # must show granted before continuing
./rebuild-js.sh && ./readstate.sh arm1-js
./rebuild-helpers.sh && ./readstate.sh arm2-helpers
```
