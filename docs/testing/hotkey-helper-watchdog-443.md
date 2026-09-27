# Manual check: hotkey-helper watchdog (#443)

`hotkey-helper` never reads stdin - it parses its CLI args once, then
calls `CFRunLoopRun()`, which never returns on its own. A hard kill of
the Electron parent (Force Quit, `kill -9`, a native crash) used to
leave it running forever, still holding the Input Monitoring
`CGEventTap` - a relaunch would then race a second tap against it on
every keystroke.

The fix adds a watchdog timer that polls `getppid()` every 2 seconds
and exits once it changes from the pid captured at startup (macOS
reparents an orphan to launchd almost immediately, so this is a
reliable, portable signal - no pipe of our own needed).

**Verified this session**, without a Mac's Input Monitoring permission
in the way: a standalone binary with the identical polling logic
(same `getppid()` + `Timer` + `CFRunLoopAddTimer`/`CFRunLoopRun`
shape, no CGEventTap) was spawned as a child, its parent was
`kill -9`'d, and it detected the reparent and exited within one poll
cycle. `swift build --package-path native/hotkey-helper` is clean.
What's unverified: everything that needs the real tap and a real
Electron parent, below.

## Steps

1. **Build.** `npm run build:hotkey-helper` (or
   `swift build --package-path native/hotkey-helper`).
2. **Baseline: normal shutdown still works.** Launch OpenStream, quit
   it normally (Cmd+Q or the menu). `hotkey-helper` should exit with
   everything else - no change expected here, this is the regression
   check.
3. **Hard-kill orphan check.** Launch OpenStream, find `hotkey-helper`'s
   pid (`ps aux | grep hotkey-helper`), then `kill -9` the main
   OpenStream/Electron process (not the helper). Within a couple of
   seconds, confirm `hotkey-helper` has also exited
   (`ps -p <pid>` should report nothing) - before this fix it would
   still be running indefinitely.
4. **Relaunch after a hard kill doesn't double-tap.** After step 3,
   relaunch OpenStream and confirm push-to-talk fires exactly once per
   press - no missed presses, no doubled/garbled events (the symptom
   two racing taps would cause).
5. **Input Monitoring is actually released.** After step 3, check
   System Settings -> Privacy & Security -> Input Monitoring while no
   OpenStream process is running - there should be no indication a tap
   is still active (this is more of a sanity check than something with
   a precise UI signal; the practical proof is step 4 behaving
   normally).
