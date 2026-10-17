# Manual check: secure-field awareness (#433)

CI covers the JS-side parsing and coordinator policy against fakes
(`accessibilityHelper.test.js`, `dictationCoordinator.test.js`). What it
can't drive: a real `AXSecureTextField`, or the accessibility-helper's own
AX role read against a live macOS password field.

**Compile-verified only** - `swift build --package-path
native/accessibility-helper -c release` succeeds. This session's sandbox
can't meaningfully exercise `accessibility-helper` end-to-end even where it
can technically run a binary (unlike `transcription-helper`, which gets
killed outright) - reading a real AX role needs a live GUI session with the
Accessibility grant and a real focused password field, which isn't
available here. Run `npm run build:accessibility-helper` before testing -
the checked-in binary predates this change.

## Steps

1. **A real password field.** Focus a password field somewhere on the Mac -
   the macOS login/lock screen won't work (a different security context
   entirely), but a browser's password field, the macOS "Change Password"
   panel in System Settings, or a password manager's own text field should.
   Push-to-talk and dictate a short phrase.
2. Confirm delivery still works exactly as before - this change is only
   about what gets *persisted*, not whether the word lands. If it can't be
   typed into that field for unrelated reasons (some password fields refuse
   programmatic AX writes on purpose), that's expected and not a regression
   to chase here.
3. **Check the console.** It should say `[dictation] delivered into a
   secure field - not logged, not copied, not recorded to history` (or the
   held-branch equivalent) - not the actual words you spoke.
4. **Check History.** Open the History tab - this dictation should not
   appear there at all.
5. **Check the clipboard**, if "Copy transcript to clipboard" is on in
   Settings - paste somewhere and confirm the secure-field dictation was
   *not* copied (whatever was on the clipboard before should still be
   there).
6. **Regression check: an ordinary text field.** Dictate into a normal text
   field right after. Confirm it *does* show up in History, *is* copied (if
   the setting's on), and logs normally - the secure-field carve-out should
   only ever trigger for an actual password field, never bleed into
   ordinary dictation.
7. **A held secure-field dictation.** Harder to force deliberately, but if
   one happens to occur (e.g. switch away from the password field mid-
   dictation), confirm the Push-to-talk overlay still shows the held text
   (so you can manually recover it - that part is deliberately unchanged),
   but it's still absent from History and the clipboard per steps 3-5.
