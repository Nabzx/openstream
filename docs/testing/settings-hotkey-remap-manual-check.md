# Manual check: settings window, hotkey remapping (#19)

What CI/a headless session can verify, and what still needs a human running
the actual app: opening a real settings window, capturing a real keydown
gesture, and confirming the native helper actually restarts with a new
combo aren't things a sandboxed session can drive.

## Already verified without a GUI

- `settingsStore.js`: persists to and reads back from a JSON file, rejects
  a hotkey with no modifiers or an unknown modifier, and leaves the
  previously-saved hotkey untouched on a rejected write - 9 tests.
- `keycodeMap.ts`: DOM `KeyboardEvent.code` → macOS virtual keycode
  translation, and the reverse (`formatHotkey`) - 9 tests.
- `captureHotkey.ts`: the pure decision behind hotkey capture - accepts a
  mapped key held with at least one modifier, rejects an unmapped key or a
  bare key with none - 5 tests.
- `hotkeyHelper.js`: waits for the native `ready` event, rejects a candidate
  that fails to start, exits early, or times out, and keeps automatic restart
  for the active helper.
- `pushToTalkShortcutController.js`: keeps the active helper and saved value
  in place while a candidate starts, then commits both only after readiness.
  Persistence and activation failures stop the candidate and restore the old
  value.
- `tsc --noEmit` and `vite build` both succeed with the settings screen
  wired in.
- The full `vitest` suite (32 tests) and `node --test "electron/**/*.test.js"`
  both pass.

None of this drives the actual React component (`HotkeySettings.tsx`) or
the real IPC round trip through a running Electron process - those are
exactly what needs a human.

## Needs a human, one time

1. `npm start`, then click the tray icon → **Open Window**.
2. The window should show **OpenStream Settings** with the current
   hotkey - `⌃⌥D` on a fresh install (Control+Option+D, matching the
   existing default).
3. Click **Change shortcut**, then press a new combo - e.g. `⌘⇧Space`. The
   button should read "Checking shortcut…" while the candidate helper starts.
   The current shortcut must keep working during this check. The new combo
   should appear only after the helper reports ready.
4. Press just a letter with no modifier held. This should show an inline
   error ("hold at least one modifier key...") and stay in recording mode
   rather than silently closing or accepting it.
5. Press an unmapped key (an arrow key, a function key). Same as step 4 -
   an inline error naming the key, still recording.
6. To exercise an unavailable replacement, temporarily make the candidate
   helper fail before it reports ready. The settings window should show
   "Shortcut unavailable. Choose another shortcut." The previous shortcut
   must remain displayed, saved, and usable. No confirmation step should send
   a live test key event.
7. After a successful remap (step 3), hold the **new** combo and confirm
   push-to-talk still works - the terminal running `npm start` should log
   `[dictation] recording...` same as before. The *old* hotkey
   (`Control+Option+D`, or whatever it was before) should no longer do
   anything.
8. Quit and relaunch the app (`npm start` again). The new hotkey should
   still be the one that works, and the settings window should still show
   it - confirms the write actually persisted to
   `~/Library/Application Support/openstream/settings.json` (or wherever
   `app.getPath("userData")` resolves in dev) rather than only living in
   memory for that session.

If step 6 doesn't work after a successful-looking remap in step 3, check
the terminal for `[hotkey-helper]` lines - a restart failure would show up
there the same way a normal crash-restart does.
