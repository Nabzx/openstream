# Manual check: settings window, one-key Push-to-talk (#216)

CI cannot drive a real settings window, macOS key events, or the native helper
through Input Monitoring. Those boundaries need one check on a real Mac.

## Already verified without a GUI

- Fresh settings default to standalone Option; existing Control+Option+D
  settings load without being rewritten.
- Renderer capture accepts either physical Option key and rejects every other
  input with exactly `Unsupported key`.
- The active helper and saved shortcut remain in place until an Option
  replacement is ready; failed replacements report the unavailable message.
- The native matcher handles Option modifier-state transitions, legacy key
  pairs, repeats, unrelated input, and release after other modifiers change.
- `npm run typecheck`, `npm run build`, JavaScript tests, and native matcher
  tests pass where their required toolchains are available.

The React component and the real IPC round trip still need a human.

## Needs a human, one time

1. `npm start`, then click the tray icon → **Open Window**.
2. On a fresh settings file, the window should show **Option**.
3. Click **Change shortcut**, then press Option. The button should read
   "Checking shortcut…" while the candidate helper starts, and the display
   should change only after the helper reports ready.
4. While capturing, press a letter, digit, punctuation key, modifier-plus-key
   combination, standalone Shift, or an unmapped key. Each should show the
   exact error `Unsupported key` and leave capture available for another try.
5. To exercise an unavailable replacement, make the candidate helper fail
   before it reports ready. The settings window should show
   "Shortcut unavailable. Choose another shortcut." The previous shortcut
   must remain displayed, saved, and usable. Confirmation must not send a
   live test key event.
6. Hold Option and confirm one Dictation starts and ends. Its normal Option
   behavior must remain visible because the helper is listen-only.
7. If the settings file already contains Control+Option+D, relaunch and
   confirm it remains displayed and usable until a successful replacement.
8. Quit and relaunch after a successful Option replacement. Option should
   still work, the old shortcut should no longer work, and the settings
   display should match the helper's active shortcut.

Record the Mac model, macOS version, keyboard, observed native down/up pair,
and whether the key's normal application behavior remained visible. OpenStream
does not claim reliable conflict detection and never sends a live confirmation
press.
