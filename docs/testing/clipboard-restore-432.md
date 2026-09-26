# Manual check: paste restore preserves non-text clipboard content (#432)

`RealClipboardPaster.paste` runs inside `accessibility-helper`, a real Mac
process reading `NSPasteboard.general`. This sandbox has no GUI clipboard
to test against, so the fix is compile-verified only (`swift build` is
clean) - everything below needs a real Mac.

The bug: the paste path only ever saved `pasteboard.string(forType: .string)`
before borrowing the clipboard for the dictated text. Anything without a
plain-string representation - a copied image, a Finder file reference -
came back `nil`, so after the paste the pasteboard was left cleared
instead of restored. The fix now saves every type on every pasteboard
item and writes them all back.

## Steps

1. **Build the helper.** `npm run build:accessibility-helper` (or
   `swift build --package-path native/accessibility-helper`).
2. **Trigger a paste-path delivery.** Paste-based delivery is rung 2 -
   it only runs when a direct AX write isn't possible or fails
   verification. A browser address bar, a terminal, or most Electron
   apps (Slack, VS Code) are reliable ways to land on it. Check the
   accessibility-helper's log output to confirm which rung actually ran.
3. **Copy an image**, e.g. `Cmd+Shift+Ctrl+4` for a screenshot-to-clipboard,
   or copy an image from Preview/Finder. Then dictate into one of the
   apps from step 2. After the dictation lands, paste (`Cmd+V`) into
   Preview or Notes - the original image should still be there, not an
   empty clipboard.
4. **Copy a Finder file reference** (select a file in Finder, `Cmd+C`),
   dictate the same way, then paste into Finder - the file reference
   should still paste normally.
5. **Regression: plain text still restores.** Copy some ordinary text,
   dictate, then paste - the original text should come back exactly as
   it did before this change.
6. **Regression: the race guard still holds.** Copy some text, start a
   dictation, and while it's mid-flight copy something *else* before the
   restore fires. The dictation's paste should still have landed, and
   your second copy should survive untouched (console should show
   "skipped the clipboard restore - the user copied something else while
   it was borrowed").
