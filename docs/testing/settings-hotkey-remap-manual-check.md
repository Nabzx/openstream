# Manual check: settings window, standalone Push-to-talk keys (#218)

CI cannot drive a real settings window, macOS key events, or the native helper
through Input Monitoring. Those boundaries need one check on a real Mac.

## Already verified without a GUI

- Fresh settings default to standalone Option; existing Control+Option+D
  settings load without being rewritten.
- Renderer capture accepts Option, Command, Control, Fn, Caps Lock, and F1
  through F19 when their DOM events are recognizable. It rejects every other
  input with exactly `Unsupported key` and returns an empty modifier list for
  accepted keys.
- Function-key identities use the macOS virtual keycodes expected by the
  native matcher and display with their familiar names.
- The active helper and saved shortcut remain in place until a candidate is
  ready; failed replacements report the unavailable message.
- The native matcher handles logical left/right Option, Command, and Control;
  the secondary-function flag; function-key transitions; Caps Lock key pairs;
  legacy key pairs; repeats; unrelated input; extra modifier activity; and
  release after other modifiers change.
- `npm run typecheck`, `npm run build`, JavaScript tests, and native matcher
  tests pass where their required toolchains are available.

The React component and the real IPC round trip still need a human.

## Needs a human, one time

1. Run `npm start`, then click the tray icon → **Open Window**.
2. On a fresh settings file, the window should show **Option**. The guidance
   should explain that F1–F12 require top-row function-key mode and that F13–F19
   depend on keyboard support. It should not promise that every key is available.
3. Click **Change shortcut**, then press each available standalone key or
   function key. The button should read **Checking shortcut…** while the
   candidate helper starts, and the display should change only after the helper
   reports ready. Fn and Caps Lock may not produce a usable event on every
   keyboard.
4. While capturing, press a letter, digit, punctuation key, modifier-plus-key
   combination, standalone Shift, or an unmapped key. Each should show the
   exact error `Unsupported key` and leave capture available for another try.
5. To exercise an unavailable replacement, make the candidate helper fail
   before it reports ready. The settings window should show
   **Shortcut unavailable. Choose another shortcut.** The previous shortcut
   must remain displayed, saved, and usable. Confirmation must not send a
   live test key event.
6. Hold each accepted key and confirm that one Dictation starts and ends. The
   selected key's normal macOS behavior must remain visible because the helper
   is listen-only.
7. If the settings file already contains Control+Option+D, relaunch and
   confirm it remains displayed and usable until a successful replacement.
8. Quit and relaunch after a successful replacement. The new key should still
   work, the old shortcut should no longer work, and the settings display
   should match the helper's active shortcut.

Record the Mac model, macOS version, keyboard, function-key mode, selected key,
observed native down/up pair, and whether the key's normal application behavior
remained visible. OpenStream does not claim reliable conflict detection and
never sends a live confirmation press.
