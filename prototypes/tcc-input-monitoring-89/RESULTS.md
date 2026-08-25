# Results (issue #89)

Status: **verdict reached on 2026-08-25**.

This is a human-in-the-loop result from one machine. The System Settings pane
was checked before and after each trigger arm, and the helper captured the
permission state after each action.

Machine:
- macOS 15.6.1 (Darwin 24.6.0, build 24G90)
- MacBook Air, Mac15,12, Apple M3, 16 GB
- ad-hoc-signed prototype bundles

## Observation table

| Arm | Pane before | Pane after trigger | Trigger action | Effective state after trigger | Row appeared when |
| --- | --- | --- | --- | --- | --- |
| `accessibility-only` | none | none | Accessibility request button clicked | `IOHIDCheckAccess=denied`, functional tap state false | not observed |
| `request-only` | none | none | `IOHIDRequestAccess`-only button clicked | `IOHIDCheckAccess=denied`, functional tap state false | not observed |
| `tap-only` | none | none | listen-only event-tap button clicked | `IOHIDCheckAccess=denied`, functional tap state false | not observed |
| `request-and-tap` | none | none | request-then-tap button clicked | `IOHIDCheckAccess=denied`, functional tap state false | not observed |

No row was switched on in any arm. The request-only timing field was entered as
`n` rather than a timing description, but the pane was `none` both before and
after the trigger. The accessibility arm's recorded `mone` was confirmed by
the operator as `none`.

## API evidence

The latest final captures for all four arms agree:

```text
accessibility-only: reportedAccess=denied, functionallyGranted=false
request-only:       reportedAccess=denied, functionallyGranted=false
tap-only:           reportedAccess=denied, functionallyGranted=false
request-and-tap:    reportedAccess=denied, functionallyGranted=false
```

Every helper's `responsibleExecutable` was the corresponding TCCProbe host,
not the bare helper binary. The host and helpers were ad-hoc signed, and the
helpers had no bundle identifier.

The post-action JSON captures are read-only `operation=check` snapshots. The
trigger calls themselves were performed through the visible probe buttons; the
wizard did not persist the button's immediate return payload. The pane
observations and the after-action effective state are the load-bearing evidence.

## Verdict

- **What makes the app appear in Input Monitoring:** none of the four tested
  triggers caused a row to appear on this machine: Accessibility request alone,
  `IOHIDRequestAccess` alone, a listen-only event tap alone, or the combined
  sequence.
- **Can it be effectively granted while no row is visible:** not established.
  Every no-row state observed here was also functionally denied.
- **Can a visible row/toggle be stale while the functional probe is denied:**
  not measured for Input Monitoring here. Issue #46 already measured the
  analogous stale-ON problem for Accessibility.
- **What should the start gate tell the user:** it must not assume that a row
  exists or tell the user to switch a row that is not visible. It must use the
  functional probe, then direct the user to the Input Monitoring pane while
  explicitly explaining that the app may be absent.
- **What should `doctor` tell the user:** use the same functional result as the
  start gate and report the absence of a visible row as a distinct, unresolved
  remediation state rather than treating it as a successful grant.

## Caveats

- This is one run on macOS 15.6.1 with ad-hoc signing and fresh bundle IDs.
- A row can appear after revisiting or refreshing System Settings; each arm was
  revisited before its after-trigger observation.
- The experiment did not produce an effective grant, so it cannot answer the
  inverse case where a grant is effective while no row is visible.
- The direct trigger return payload was not persisted by the UI; a follow-up
  harness revision would save that payload if the exact API return value is
  needed independently of the pane and post-action state.
