# Results (issue #46)

Status: **verdict reached on 2026-08-24.** The Electron host holds all three
grants in the measured ad-hoc-signed configuration. The observations, caveats,
and consequences are recorded below.

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

## Step 5 - arm 1: JavaScript rebuilt, helpers untouched (VALID, 02:40:07)

**Re-run correctly on 2026-08-24 against a live, verified grant. This is the
measurement the ticket was for.**

Before (02:38:11), grant confirmed live: host `3d9ec264...` trusted, `axhelper`
reported **true** / functional **true**, `hotkeyhelper` `granted` / functional
**true**.

Then `rebuild-js.sh`: JavaScript changed, both helper binaries left byte-identical.

| Subject | CDHash moved? | Reported | Functional |
| --- | --- | --- | --- |
| `TCCProbe.app` | **yes**, `3d9ec264...` → `15c95c06...` | not trusted | - |
| `axhelper` | **no**, `b425603d...` unchanged | **false** | **false** |
| `hotkeyhelper` | **no**, `95d7f721...` unchanged | **false** | **false** |

**Every grant dropped, although neither helper binary changed by a single byte.**
The only thing that moved was the host bundle's code identity. That is the
answer: the grant is keyed to the Electron host's CDHash, and helper code
identity is irrelevant to it.

## Step 6 - arm 2: helpers rebuilt, JavaScript untouched (NOT NEEDED)

Arm 2 was designed to test whether the entry is keyed to helper code identity.
Arm 1 already answers that: the helpers' CDHashes did **not** move and the grants
dropped anyway, so helper identity cannot be the key.

Arm 2 also cannot isolate its variable as written: `rebuild-helpers.sh` re-signs
the bundle, so it moves the host CDHash too (measured: `8679f617...`). With the
host identity now known to be the deciding factor, arm 2 confounds the two and
would add nothing. Recorded as a harness limitation, not run again.

## Step 7 - `tccutil reset`

Established earlier, and still valid: the host bundle id **is** a target
`tccutil` accepts (exit 0) while a bogus id is rejected (exit 64,
`OSStatus -10814`), and `ListenEvent` is the right service name for Input
Monitoring. Both helpers have no bundle identifier at all, so this target can
only ever reach the host's entry.

What the reset *clears* was not validly measured: it ran at 02:17:40 when
nothing was granted.

## Step 8 - the grant that displays as ON but is not in effect (VALID, 02:29:30)

Measured 2026-08-24. Build at 02:28:30 produced host CDHash `3d9ec264...`.

| Source | Reading |
| --- | --- |
| System Settings > Accessibility | a row named `TCCProbe`, switch **ON** |
| `state-20260824-022930-confirm-granted.json` | host `reportedTrusted=false`; `axhelper` reported **false**, functional **false** |

**The displayed grant and the effective grant disagree.** macOS shows the
permission as granted while denying the binary that is actually running. For an
ad-hoc-signed app this is the per-rebuild problem in its nastiest form: the
failure is silent and the UI actively misleads. A user - or a build script -
that trusts the System Settings toggle is reading a stale artefact, not the
grant.

Two candidate causes, not separated by this measurement:

1. A stale entry from an earlier build at the same path. Host CDHash has moved
   repeatedly across runs (`157799ea...`, `4e05f21b...`, `8679f617...`,
   `3d9ec264...`).
2. **Measurement contamination, disclosed:** during harness verification a
   second `TCCProbe.app` was built and launched from a git worktree at
   `.claude/worktrees/tcc-attribution-46-verify/...`. It carries the same
   display name and the same bundle id, so the ON row may belong to that build
   rather than to a stale entry of this one.

Either way the operational conclusion is the same and is the one that matters
for #40: **a visible ON toggle is not evidence of an effective grant**, and the
app start gate must probe the permission functionally rather than trust the UI
or the presence of a TCC row. `tccutil reset` on the host bundle id clears every
entry for that id regardless of path, which is the way out.

## Verdict

**Reached, 2026-08-24.** All three answers the ticket owed #23:

### 1. Which binary each grant attaches to

**The Electron host bundle, keyed to its CDHash.** Three independent lines of
evidence agree:

- The System Settings Accessibility list names **`TCCProbe`**. No entry for
  `axhelper` or `hotkeyhelper` is ever offered.
- Granting `TCCProbe` alone makes both spawned helpers report *and* function as
  granted, though neither has an entry of its own.
- Arm 1: moving only the host CDHash drops every grant while both helper
  binaries stay byte-identical.

The responsible-process mechanism wins. Accessibility and Input Monitoring are
**not** checked against the calling helper's own code requirement here.

### 2. Whether `tccutil reset` has a usable target

**Yes, the host bundle id - and it is necessary, not merely available.** The
helpers have no bundle identifier, but that is moot: there is nothing
per-helper to reset because there is nothing per-helper to grant. `tccutil reset
Accessibility dev.openstream.prototype.tccprobe` is also the only clean escape
from the displayed-ON / effectively-denied state in step 8; re-granting through
System Settings alone did not clear it.

### 3. How much of the per-rebuild problem the deterministic helper build removes

**None of it.** This is the expensive answer and it is now measured, not
inferred.

Issue #40 makes helper builds deterministic so that a rebuild need not cost the
helpers' grants. But the helpers never hold grants. The grant lives on the
Electron host, and *any* rebuild that re-signs the bundle - including a
JavaScript-only change - moves the host CDHash and drops all three grants. Arm 1
demonstrates exactly this: byte-identical helpers, grants gone.

So a deterministic helper build buys nothing for TCC. Every JavaScript change
costs the user a full re-grant of Accessibility and Input Monitoring.

### Consequences for the implementation

- **The start gate must probe functionally.** Step 8 showed the System Settings
  toggle reading ON while the running binary was denied. Neither the presence of
  a TCC row nor its switch state is evidence of an effective grant. Call the API
  and see whether it works.
- **The re-grant problem is a host-identity problem, not a helper problem.**
  Anything spent on helper build determinism to protect grants is misdirected;
  the leverage is entirely in keeping the *host bundle's* code identity stable
  across builds. Stable signing identity for the host is the thing worth
  investigating next.
- **Development builds will re-prompt constantly** unless host code identity is
  held stable, because every JS edit re-signs the bundle.

### Scope and limits

- One machine: macOS 15.6.1 (Darwin 24.6.0), Apple Silicon, **ad-hoc signed**.
  A Developer ID signature gives a stable designated requirement across
  rebuilds, which may well change the per-rebuild picture entirely. **Untested,
  and the single most important follow-up.**
- Input Monitoring was never observed to produce its own System Settings row,
  yet `hotkeyhelper` tracked the host's grant state throughout. The mechanism
  behind that was not isolated.
- Step 8's displayed-ON row could not be attributed conclusively between a stale
  entry and a same-bundle-id build made from a git worktree during harness
  verification.
