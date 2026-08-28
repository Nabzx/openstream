# Manual check: the break-safe applications setting (#19)

CI covers the store, the bundle-id reader, and the name map. What it can't
drive: the real file dialog, the persisted list surviving a relaunch, and a
line break actually landing (or not) in the chosen app.

## Steps

1. Open **Settings → Break-safe applications**. The four defaults show with
   friendly names (TextEdit, Notes, Obsidian, Visual Studio Code) and their
   bundle id underneath.
2. **Add application…** → pick an app from `/Applications` (say iA Writer).
   It appears in the list with its name; no bundle id typing.
3. Pick a non-`.app` file, or an `.app` with no `Info.plist` — an error
   line shows, the list is unchanged.
4. Add one by hand: type a bundle id into the field, press **Add**.
5. Dictate a two-sentence phrase with a spoken "new paragraph" into the
   app you added — the break lands. Do the same in Terminal — the break is
   dropped, the text runs on.
6. **Remove** an app, then **Restore defaults** — the list returns to the
   original four.
7. Quit and relaunch OpenStream. The list (minus anything removed, plus
   anything added) is exactly as left. Picker-resolved names for non-default
   apps fall back to the bare bundle id after a relaunch — expected.
8. Confirm there is no Microphone section (deferred to #137).
