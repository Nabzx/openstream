## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.

## Invariants

### The desktop window must never be opened or focused from the dictation pipeline

`electron/main.js`'s `createWindow()` / `openWindowTo()`, `win.show()`, `win.focus()`
and `app.focus()` may only be reached from an explicit user action - the tray item,
the `activate` handler (Dock click), `second-instance`, first launch, or an
application-menu item. Nothing in `dictationCoordinator.js`, `transcribeAndPrint`,
or any capture/hotkey/overlay callback may call them: the whole product depends on
the user's *target* app staying frontmost while they dictate, and raising the
window would steal that focus. See issue #208 and `docs/research/issue-208-electron-dock-focus.md`.
