# Manual check: voice editing

Issue [#17](https://github.com/Nabzx/openstream/issues/17). The command grammar, the
transforms, the coordinator branches and the `getSelection()` protocol have unit
coverage (`electron/voiceEditCommands.test.js`, `electron/voiceEditCoordinator.test.js`,
`electron/accessibilityHelper.test.js`). What CI cannot drive: reading a real
selection over the Accessibility API in a real app, and replacing that selection
in place across different app types.

## Prerequisites

OpenStream running with Accessibility, Input Monitoring and Microphone granted, both
model servers up. Fresh-install default hotkey `Option` (existing saved combinations remain supported).

## Checks

Do each in the apps listed. **Select the target text first**, then hold the hotkey,
speak the command, and release.

| # | App | Selection | Say | Expect |
|---|---|---|---|---|
| 1 | A code editor (VS Code) | `getUserProfileData` | "snake case" | replaced with `get_user_profile_data` |
| 2 | VS Code | `user profile name` | "camel case" | `userProfileName` |
| 3 | VS Code | `MAX RETRY COUNT` | "screaming snake case" | `MAX_RETRY_COUNT` |
| 4 | TextEdit / Notes | `milk, eggs, bread and coffee` | "bullet list" | four `- ` lines replace the selection |
| 5 | TextEdit | `first open settings, then pick a shortcut and finally relaunch` | "numbered list" | three numbered lines |
| 6 | Any app | `npm test` | "wrap in backticks" | `` `npm test` `` |
| 7 | VS Code | a whole sentence of prose | "snake case" | **nothing changes**; the overlay briefly says the selection doesn't look like an identifier |
| 8 | Any app | any selection | "make this sound nicer" | **nothing changes**; the overlay briefly says "Command not recognised" |
| 9 | A **terminal** (not on the break-safe list) | `milk, eggs and bread` | "bullet list" | the result is **held** in the overlay for manual copy, not pasted with newlines |
| 10 | A one-line field (a search box) | `foo, bar and baz` | "bullet list" | held, not inserted |
| 11 | Anywhere, **nothing selected** | — | speak normally | ordinary dictation, exactly as before - no regression |

## Also confirm

- The "Editing…" overlay state appears briefly while the command transcribes.
- With nothing selected, a slow or failed selection read never delays the start of an ordinary dictation.
- `release-to-insertion` is logged for a delivered edit (`[voice-edit] release-to-insertion: …ms`).
- Selecting a very large block (a whole file) and speaking a command falls through to ordinary dictation rather than trying to transform it.

## Known gaps

- No cancel: pressing the hotkey again during the (~300 ms) transcribe window does not abort an in-flight edit. Deferred - see #17.
- Case transforms on text that mixes an identifier and prose ("`const foo` = bar.") are best-effort.
