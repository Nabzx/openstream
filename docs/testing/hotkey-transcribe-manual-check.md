# Manual check: settled dictation pipeline

Issue [#105](https://github.com/Nabzx/openstream/issues/105) covers the macOS boundaries that CI cannot drive: global key events, a real microphone, menu bar and overlay feedback, and insertion into another application.

The fresh-install default is standalone `Option`. Existing saved combinations remain active for backward compatibility. The helper is listen-only, so the selected key continues through macOS and the focused application.

## Run the wizard

From the repository root:

```bash
./scripts/verify-dictation-pipeline.sh
```

The automated coverage behind the wizard also includes:

- `whisper-server` serving `/inference` and producing a transcription from a synthetic WAV.
- A valid mono 16kHz 16-bit WAV from the capture path.
- `hotkey-helper` and `accessibility-helper` handling missing permissions without hanging or crashing.
- Fourteen `InjectionEngine` tests covering the fallback chain, settle guard, blind-paste gate, and the #227 focus-resolution retry. Run them with `swift test --package-path native/accessibility-helper` on a full Xcode installation.
- Four overlay-positioning tests covering centering, the bottom margin, offset work areas, and a custom margin. Run them with `node --test electron/overlayPosition.test.js`. The actual Dock clearance still needs a human check.
- `node --check` passing for all new and changed JavaScript files.

The overlay's glass/waveform redesign (`vibrancy: "hud"`, the live waveform, "Listening") has no automated coverage beyond that `node --check` and `npm run build` passing - whether the vibrancy actually renders and how the waveform looks and feels while speaking are exactly the kind of thing that needs a human on a real screen, not a headless session.

The wizard checks the build, then walks through seven stages:

1. Check that the Electron runtime has not been revoked by Gatekeeper, then run the automated test suite and typecheck on an Apple Silicon Mac.
2. Start OpenStream and grant Microphone, Input Monitoring, and Accessibility permissions.
3. Use standalone `Option` outside OpenStream and inspect the tray, push-to-talk overlay, and sound meter. Confirm that the overlay sits bottom-center, clear of the Dock, and shows a real frosted-glass blur (desktop content behind it should look visibly blurred, not a flat dark box) with a waveform that audibly reacts to your voice. On a multi-monitor setup, move the cursor to another display before pressing the key and confirm the overlay follows it. If the overlay looks like a flat dark rectangle with no blur, check System Settings > Accessibility > Display > Reduce Transparency isn't enabled - that setting flattens all vibrancy effects system-wide.
4. Dictate into TextEdit and confirm the finished text is inserted once.
5. Inspect both model-server listeners and sample their TCP connections during a dictation. Ports 8178 and 8179 must stay on `127.0.0.1`.
6. Measure three warm dictations from key release to confirmed insertion. Every measurement must be below 1000 ms.
7. Write a Markdown report and optionally post it to issue #105.
8. Try a terminal window and an Electron-based editor such as VS Code or Slack. A terminal prompt should receive a clipboard paste, not have its scrollback overwritten. In the Electron app, check whether `AXManualAccessibility` produces a usable focused element, rather than the bare `AXWebArea` measured in #28. This real cross-app testing is the remaining scope of #10; the automated tests exercise the decision logic against fakes but cannot confirm how a real app handles paste or synthesized keystrokes.

The report and application log are written under `${TMPDIR:-/tmp}`. The wizard does not save audio. The application log contains dictated text, so delete it when the check is finished.

## What the timing means

The main process records a monotonic timestamp when the global hotkey reports key-up. It carries that timestamp with the completed recording and logs the elapsed time after the Accessibility helper confirms insertion:

```text
[dictation] release-to-insertion: 742.3ms (within 1000ms budget)
```

This includes WAV finalization, whole-recording transcription, rules cleanup, optional paragraph break placement, context detection, and delivery. Failed or held dictations have no insertion latency because no text arrived at the cursor.

## Troubleshooting

When `npm start` runs from Terminal, macOS can attribute Electron and both native helpers to Terminal. Enable Terminal under Microphone, Input Monitoring, and Accessibility. If macOS shows Electron or OpenStream instead, enable that entry. Quit and relaunch after changing Input Monitoring or Accessibility.

Do not bypass a Gatekeeper malware or revoked-code warning. The wizard checks for that state before launch. Reinstalling the same revoked Electron version will not fix it.

On a cold start, the resident transcription model server can spend 15 to 20 seconds loading Metal shaders. The wizard waits up to 120 seconds for each local listener.

Use the prefixes in the wizard's application log to locate failures:

- `[hotkey-helper]` for Input Monitoring and global key events
- `[accessibility-helper]` for context detection and insertion
- `[transcription model server]` for port 8178 and transcription
- `[rewrite model server]` for port 8179 and paragraph placement
- `[dictation]` for pipeline outcomes and latency
