# prototypes/desktop-ui-211 — desktop app window mock

Throwaway visual mock for [issue #211](https://github.com/Nabzx/openstream/issues/211),
a child of the desktop-app UI map ([#206](https://github.com/Nabzx/openstream/issues/206)).
Not shipping code — it exists so [#212](https://github.com/Nabzx/openstream/issues/212)
(the build) is a translation job, not a design job.

## Published canvas

<https://claude.ai/code/artifact/50569a07-ab64-4fb0-a170-f2f067d80d73>

The `.dc.html` files here are the working source; `openstream-desktop-window.html`
is the seeded canvas that gets published. To change anything: edit the `.dc.html`
files, re-run the seed helper from the `design` skill, republish the same path.

## What it covers

Grounded in the decisions from [#209](https://github.com/Nabzx/openstream/issues/209)
(regular Dock app, tray stays, close backgrounds) and
[#210](https://github.com/Nabzx/openstream/issues/210) (two pages: Home + Settings).

| Artboard | |
| --- | --- |
| `Main.dc.html` | Home, light — status hero, shortcut, health rows, empty "Recent" region |
| `HomeDark.dc.html` | Home, dark — semantic colour swap only |
| `Settings.dc.html` | Settings, light — one scrolling page: Hotkey, Break-safe apps, Startup (#135), Microphone (#137) |
| `SettingsDark.dc.html` | Settings, dark |
| `FirstLaunch.dc.html` | the window state a fresh install opens to (permissions not yet granted) |
| `DesignSystem.dc.html` | type scale, colour (light + dark), spacing, radii, components, chrome/vibrancy notes |
| `NavAlternate.dc.html` | Rejected — sidebar instead of toolbar tabs (kept for the record) |

## Navigation model — decided

**Direction A (toolbar tabs)** was chosen on 2026-08-28: lighter, right-sized for
two pages, and it keeps the full window width for content. `NavAlternate.dc.html`
is the rejected sidebar sketch, kept on page 2 so the rationale stays visible.
The map ([#206](https://github.com/Nabzx/openstream/issues/206)) is complete;
[#212](https://github.com/Nabzx/openstream/issues/212) is the build.

## Design language

Extends the push-to-talk overlay (`electron/overlay/`): Apple system-blue accent
(`#007AFF` / `#0A84FF`), SF, matching radii. Solid window (not glass);
`titleBarStyle: 'hiddenInset'`; vibrancy only on the 52px toolbar strip. Default
760×580, min 560×440.
