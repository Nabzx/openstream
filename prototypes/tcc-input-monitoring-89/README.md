# Input Monitoring registration probe (issue #89)

**PROTOTYPE. Throwaway HITL harness. Not production code.**

## The question

What causes an app to appear in macOS **System Settings → Privacy & Security →
Input Monitoring**, and does the visible list correspond to an effective grant?
Specifically, is `IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)` enough, or
does a real listen-only `CGEvent` tap attempt register the app? The probe also
checks whether an Accessibility request changes Input Monitoring state.

This isolates the unexplained `denied → granted` transition from issue [#46](https://github.com/Nabzx/openstream/issues/46). The API state is machine-captured;
the System Settings list is recorded by a person because macOS provides no
supported API for reading that pane.

## Why this shape

This is an empirical macOS experiment, not a production feature and not a
state-model demo. It reuses #46's important boundary: an ad-hoc-signed Electron
host spawns native helpers over stdio, and the helper records the responsible
process, code identity, `IOHIDCheckAccess`, and a functional event-tap result.

Each arm uses a fresh bundle identifier. That prevents a grant from an earlier
arm from making a later trigger look effective.

## Trigger arms

Run each arm from a clean Input Monitoring entry. The button or command named
in the second column is the only permission-registration action in that arm.
Read the pane immediately before and after it.

| Arm | Trigger | What it isolates |
| --- | --- | --- |
| `accessibility-only` | `AXIsProcessTrustedWithOptions` | Whether the Accessibility path explains the Input Monitoring transition |
| `request-only` | `IOHIDRequestAccess` | Whether the request API alone creates a list entry |
| `tap-only` | listen-only `CGEvent.tapCreate` | Whether a real tap attempt creates a list entry |
| `request-and-tap` | request, then tap | The production-like combined path |

`check` is read-only. For `tap-only`, `requestAttempted` must be false; for
`request-only`, `tapAttempted` must be false. The output is designed to make
that invariant visible in every capture.

## Run one arm

The wizard is deliberately human-driven because the System Settings pane is the
thing being measured:

```sh
cd prototypes/tcc-input-monitoring-89
./run-experiment.sh request-only
```

Repeat for `accessibility-only`, `tap-only`, and `request-and-tap`. The wizard
writes the human's pane observations to `logs/observations.env` and API captures
to `logs/state-*.json`. It also resets the prototype's TCC entries during
cleanup. Do not stop before cleanup unless you intend to remove the entries by
hand.

For direct free play, without the wizard:

```sh
BUNDLE_ID=dev.openstream.prototype.tccim89.request ./build.sh
BUNDLE_ID=dev.openstream.prototype.tccim89.request ./readstate.sh baseline check
open prototypes/tcc-input-monitoring-89/build/TCCProbe.app
```

In the window, use one trigger button at a time and inspect Input Monitoring
between clicks. Always launch through `open`; launching the executable from a
terminal changes the responsible GUI process and contaminates the attribution
measurement.

## Evidence to capture

For each arm, record:

1. the exact Input Monitoring entry names before the trigger;
2. the exact names after the trigger, before switching anything on;
3. whether a row appeared only after opening or revisiting System Settings;
4. whether the row was switched on;
5. the following `hotkeyhelper` fields from the JSON capture:
   `reportedAccess`, `functionallyGranted`, `requestAttempted`,
   `requestResult`, `tapAttempted`, and `tapCreated`;
6. whether an effective grant remained when the pane showed no row.

A visible toggle is not evidence by itself. The functional result is the
listen-only tap when that operation was attempted; otherwise it is the current
`IOHIDCheckAccess` result. The `responsibleExecutable` and CDHash fields remain
in every capture so a contaminated launch is obvious.

## Cleanup

The wizard runs:

```sh
tccutil reset ListenEvent <arm-bundle-id>
tccutil reset Accessibility <arm-bundle-id>
```

Then it removes the local `build/` directory. If the wizard is interrupted,
remove the app from System Settings → Accessibility and Input Monitoring, run
the two reset commands for the arm's bundle ID, and delete `build/` manually.

## Status

**Pending human run.** `RESULTS.md` is the answer template. Do not infer the
wording for the start gate or `doctor` until the pane observations and the
functional captures agree.
