# Results (issue #89)

Status: **pending human run**.

This file must contain observations from a real macOS 15 run. Do not fill a
cell from an assumption about TCC. The System Settings list and the functional
helper capture are separate evidence.

Machine:
- macOS:
- hardware:
- signing:

## Observation table

| Arm | Pane before | Pane after trigger | Trigger call(s) confirmed | Effective state after trigger | Row appeared when |
| --- | --- | --- | --- | --- | --- |
| `accessibility-only` | unmeasured | unmeasured | unmeasured | unmeasured | unmeasured |
| `request-only` | unmeasured | unmeasured | unmeasured | unmeasured | unmeasured |
| `tap-only` | unmeasured | unmeasured | unmeasured | unmeasured | unmeasured |
| `request-and-tap` | unmeasured | unmeasured | unmeasured | unmeasured | unmeasured |

## API evidence

Paste the relevant `hotkeyhelper` fields from each `logs/state-*.json` capture
here. Include `responsibleExecutable`, `cdhash`, and `bundleIdentifier` when
checking attribution.

```text
accessibility-only:
request-only:
tap-only:
request-and-tap:
```

## Verdict

- What makes the app appear in Input Monitoring:
- Can it be effectively granted while no row is visible:
- Can a visible row/toggle be stale while the functional probe is denied:
- What should the start gate tell the user:
- What should `doctor` tell the user:

## Caveats

- The result is for the recorded macOS/signing configuration only.
- A row can appear after revisiting or refreshing System Settings; record that
  timing rather than treating a first empty view as final.
- A stale TCC entry from another build or bundle path invalidates an arm. Use a
  fresh bundle ID and confirm the baseline capture before triggering it.
