# Issue #208 - Dock icon, activation policy, and window focus for the desktop app

Research note for [Nabzx/openstream#208](https://github.com/Nabzx/openstream/issues/208),
a child of [#206](https://github.com/Nabzx/openstream/issues/206) (Map: the OpenStream
desktop app UI and experience).

Written 2026-08-27. Primary sources: Electron API documentation (v43, the version
in `package.json`), the Electron issue tracker, Apple developer documentation and
developer-forum threads, and this repo's own `prototypes/tcc-attribution-46/`.

## The question

Today `electron/main.js` calls `app.dock.hide()` at `whenReady()` and the settings
window is a 360x220 non-resizable `BrowserWindow` opened only from a tray menu item
(`{ label: "Open Window", click: createWindow }`). `#206` wants that window to become
a real, resizable, navigable desktop window in the class of Wispr Flow's Hub.

That raises four coupled platform questions:

1. Can a Dock-less ("accessory") Electron app reliably bring a normal window to the
   front, and does it appear in the Cmd-Tab switcher?
2. What does switching activation policy (`accessory` <-> `regular`) at runtime cost?
3. What is the hard constraint from the product - **the window must never take
   keyboard focus away from the user's target application during a dictation** -
   and what enforces it?
4. Secondary window mechanics: `titleBarStyle`, the `activate` event, the
   application menu, `second-instance`.

## Summary of the answer

**Recommendation: make OpenStream a normal `regular` (Dock) application for v1.0.**
Remove `app.dock.hide()`, keep the tray icon as a status indicator, add a real
application menu, and handle the `activate` event. The "menu-bar-only, no Dock
icon" shape the app has today actively fights every part of a good windowed
experience: the window cannot be reliably raised, the app is absent from Cmd-Tab,
and text fields in the window get no Cmd-C / Cmd-V / Cmd-A because an accessory app
has no menu bar. A "Show in Dock" toggle (Wispr Flow has one) is a *later*
refinement, and if built it should use the runtime hybrid described below, which
carries documented quirks.

**The focus-during-dictation constraint is met by discipline, not by policy.** The
danger is a *programmatic* `win.show()` / `win.focus()` / `createWindow()` call
firing while a dictation is in flight. The dictation path today
(`transcribeAndPrint` -> `dictationCoordinator`) never touches the window - it only
sets tray state and the overlay - so the constraint holds now. It must stay an
invariant: the window is only ever shown in response to an explicit user action
(tray item, Dock click, `second-instance`), never from the pipeline.

**One item could not be settled from a primary source** and needs a manual check on
the driving dev's machine: the exact runtime behaviour of an `accessory` -> `regular`
switch in Electron 43 on macOS 15.6.1+ (do open windows hide? does the app menu
freeze until the first focus change?). See "Not verified" below. This only matters
if the hybrid toggle is pursued; the v1.0 recommendation avoids it entirely.

---

## What the sources establish

### 1. The three activation policies, verbatim

`app.setActivationPolicy(policy)` on macOS
([app API docs](https://www.electronjs.org/docs/latest/api/app#appsetactivationpolicypolicy-macos)):

- **`'regular'`** - "The application is an ordinary app that appears in the Dock and
  may have a user interface."
- **`'accessory'`** - "The application doesn't appear in the Dock and doesn't have a
  menu bar, but it may be activated programmatically or by clicking on one of its
  windows."
- **`'prohibited'`** - "The application doesn't appear in the Dock and may not create
  windows or be activated."

`app.dock.hide()` puts the app in the equivalent of `accessory`. The two "doesn't"
clauses in the `accessory` definition are the whole problem for a windowed app: **no
Dock presence and no menu bar.**

### 2. A Dock-less app is not in the Cmd-Tab switcher

[electron/electron#6283](https://github.com/electron/electron/issues/6283): "When
using `app.dock.hide()` in Electron on macOS, the application becomes inaccessible
via Command+Tab app switcher, even though the app is still running." This is macOS
behaviour, not an Electron bug - `LSUIElement` / accessory apps are excluded from
the switcher by design. Consequence: if the user clicks away from the OpenStream
window, the *only* ways back are the tray menu or clicking a still-visible sliver of
the window. There is no Cmd-Tab, no Dock icon, no Mission Control app grouping.

### 3. `show()` focuses, `showInactive()` does not

From the [BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window):

- `win.show()` - "Shows and gives focus to the window."
- `win.showInactive()` - "Shows the window but doesn't focus on it."
- `win.focus()` - "Focuses on the window."
- `win.moveTop()` - "Moves window to top(z-order) regardless of focus."
- `app.show()` (macOS) - "Shows application windows after they were hidden. **Does
  not automatically focus them.**"

`app.focus(options)` on macOS takes `{ steal: boolean }`; the docs say "You should
seek to use the `steal` option as sparingly as possible." `steal: true` "makes the
receiver the active app regardless of current focus state" - i.e. it *will* pull
focus from the user's target app. It must never be called from anywhere near the
dictation path.

The current `createWindow()` does `win.show()` then `win.focus()` on re-open. For an
explicit user action (they clicked "Open Window") that is correct - taking focus is
what the user asked for. The risk is only if that function is ever reachable from
the pipeline.

### 4. Focus-stealing is a real, shipped bug in this app category

[electron/electron#40307](https://github.com/electron/electron/pull/40307) ("Do not
activate app when calling focus on inactive panel window"): on macOS Sonoma a panel
`BrowserWindow` "could no longer be focused without also making the app the
foregrounded app if `activateIgnoringOtherApps` was incorrectly being called."
Superwhisper shipped and then had to fix "the mini window stealing focus from other
apps if mode switching occurred during dictation" (issue #207 findings). The general
rule from the Electron tray guidance: for a window that should appear without
activating the app, use `showInactive()` and never a bare `focus()`.

Note this is about *panel* / dropdown windows attached to a tray. OpenStream's
push-to-talk overlay already handles this correctly (`overlayWin.showInactive()`,
`focusable: false`, `visualEffectState: "active"`). The **desktop window is the
opposite case** - when the user opens it they *want* it focused - so it should be a
normal window that takes focus on explicit open, and simply is never opened
implicitly.

### 5. An accessory app's window has no Edit menu, so no clipboard shortcuts

Well-established Electron behaviour, stated in the
[Application Menu tutorial](https://www.electronjs.org/docs/latest/tutorial/application-menu)
and many write-ups: on macOS, Cmd-C / Cmd-V / Cmd-X / Cmd-A / Cmd-Z in a text field
only work if the application menu contains items with the corresponding `role`
(`copy`, `paste`, `cut`, `selectAll`, `undo`, ...). `main.js` never calls
`Menu.setApplicationMenu`, and an `accessory` app shows no menu bar at all. So the
text `<input>` in `BreakSafeAppsSettings` (and any future settings field) currently
has no working copy/paste. A `regular` app with a standard menu template fixes this
for free.

### 6. `dock.show()` is async; `dock.hide()` has a 1-second floor

From the [Dock API docs](https://www.electronjs.org/docs/latest/api/dock):

- `dock.show()` - "Returns `Promise<void>` - Resolves when the dock icon is shown."
- `dock.hide()` - "Calling `dock.hide()` within one second of a previous call will
  have no effect. As a workaround, ensure at least one second has elapsed between
  calls - for example, by deferring with a `setTimeout` of 1100ms or more."
- `dock.isVisible()` - returns a boolean.

The 1-second floor makes a per-window-open/close hybrid toggle inherently racy: open
window, show Dock, close window quickly, and the `hide()` silently no-ops, leaving a
Dock icon with no window.

### 7. `titleBarStyle` values, verbatim

From the [BaseWindow docs](https://www.electronjs.org/docs/latest/api/base-window):

- `'default'` - "the standard title bar for macOS".
- `'hidden'` - "a hidden title bar and a full size content window. On macOS, the
  window still has the standard window controls ('traffic lights') in the top left."
- `'hiddenInset'` (macOS only) - "a hidden title bar with an alternative look where
  the traffic light buttons are slightly more inset from the window edge."
- `'customButtonsOnHover'` (macOS only, "currently experimental") - traffic lights
  appear only on hover.

`trafficLightPosition` / `win.setWindowButtonPosition(point)` sets a custom traffic
-light offset for frameless windows. `hiddenInset` is the common choice for a
modern-looking macOS app window that still wants a normal draggable top area; it
needs a CSS `-webkit-app-region: drag` strip at the top of the renderer.

### 8. `activate` and `second-instance`

- The `activate` event ([app docs](https://www.electronjs.org/docs/latest/api/app#event-activate-macos))
  fires "when the application is activated" including "clicking on its dock icon",
  with signature `(event, hasVisibleWindows)`. A `regular` app **must** handle this
  to recreate/show its window when the Dock icon is clicked and no window is open.
  `main.js` has no `activate` handler today (harmless only because there is no Dock
  icon).
- `main.js` already handles `second-instance` by calling `createWindow()`, and
  `requestSingleInstanceLock()` runs first thing (line 23). That stays correct for a
  `regular` app.
- `window-all-closed` currently `preventDefault()`s to keep the app resident with no
  windows. That is still what we want (the app is a background dictation tool);
  closing the window must not quit. Quit stays on the tray menu, and gains an
  App-menu "Quit OpenStream" item once there is an application menu.

### 9. The runtime hybrid (`accessory` at rest, `regular` while window open)

Apple developer-forum consensus (threads
[774096](https://developer.apple.com/forums/thread/774096),
[67584](https://developer.apple.com/forums/thread/67584),
[756322](https://developer.apple.com/forums/thread/756322)): switching
`accessory` -> `regular` at runtime often needs an explicit activate call to bring the
window forward, "can cause the app main menu to be frozen until the first app front
status change", and "the app may not always get placed front in the application
order". `NSApp.activate(ignoringOtherApps: true)` is the historical fix but
`NSApplicationActivateIgnoringOtherApps` is **deprecated as of Sonoma**. Electron
exposes this switch as `app.setActivationPolicy('regular'|'accessory')` plus
`app.dock.show()/hide()`, but does not paper over the quirks.

This is why the hybrid is a *later* option, not v1.0: it trades a permanent Dock
icon for a set of documented, version-sensitive edge cases.

---

## Recommendation for the map

For **[Is OpenStream a menu-bar utility or a Dock app...](https://github.com/Nabzx/openstream/issues/209)**:

1. **v1.0: `regular` app.** Delete the `app.dock.hide()` call. The app appears in
   the Dock and Cmd-Tab like any other app. The tray icon stays as the live
   dictation-state indicator. This is the "normal desktop app" the map asks for and
   it makes the platform stop fighting the window.
2. **Add an application menu** via `Menu.setApplicationMenu(Menu.buildFromTemplate(...))`
   with at least: the app menu (About OpenStream via `app.setAboutPanelOptions`,
   Settings/Preferences accelerator, Hide, Quit) and a standard Edit menu (`undo`,
   `redo`, `cut`, `copy`, `paste`, `selectAll` roles). Add View/Window as needed.
3. **Add an `activate` handler** that shows/creates the window (Dock-icon click with
   no window open).
4. **Keep `window-all-closed` preventing quit.** Closing the window backgrounds the
   app; Quit is explicit (tray + App menu).
5. **Window shape:** resizable, `titleBarStyle: 'hiddenInset'`, sensible
   `minWidth`/`minHeight`, and persist size+position (a `settingsStore` field or a
   small `windowState` helper). Remove `resizable: false`.
6. **Invariant to write down and guard:** nothing in `electron/dictationCoordinator.js`,
   `transcribeAndPrint`, or any pipeline callback may call `createWindow()`,
   `win.show()`, `win.focus()`, or `app.focus()`. The desktop window opens only from
   explicit user entry points. Consider a one-line comment at `createWindow()` and a
   note in `AGENTS.md`.
7. **"Show in Dock" toggle:** out of scope for v1.0. If added later, implement as the
   runtime hybrid in section 9 and budget for the quirks + a manual test pass.

---

## Not verified (needs a manual check)

These could not be settled from documentation and want a check on the driving dev's
M3 Air (macOS 15.6.1 or later), in the same spirit as the repo's other prototypes:

- **`accessory` -> `regular` at runtime in Electron 43 on current macOS:** does calling
  `app.setActivationPolicy('regular')` while a `BrowserWindow` is open hide that
  window (as the Apple forums report for native apps)? Does the newly-created
  application menu respond to clicks immediately, or is it frozen until the app is
  deactivated and reactivated once? Only blocks the hybrid toggle, not v1.0.
- **Does `showInactive()` from the tray put a *normal* (non-panel) app window
  visibly in front of the frontmost app without focusing it,** or does it render
  behind? (Relevant only if any "peek" affordance is ever wanted; the v1.0 plan
  always focuses on open.)
- **Cold Dock-icon flash:** with `app.dock.hide()` removed and no `LSUIElement`,
  confirm there is no unwanted behaviour change at launch (there should not be - the
  app becomes a plain `regular` app - but worth eyeballing once).
- **Traffic-light vertical alignment** with `hiddenInset` against whatever top-bar
  height the design lands on - may need `trafficLightPosition`.
