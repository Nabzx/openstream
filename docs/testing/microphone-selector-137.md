# Manual check: microphone device selector (#137)

CI covers `settingsStore`'s `microphoneDeviceId` validation and persistence
against fakes. What it can't drive: real `getUserMedia`, a real second
input device, or the live capture renderer's audio graph.

**`capture.js`'s device-switching path is unexercised** - this session's
sandbox has no real microphone hardware to test against, and this repo's
capture pipeline was never run live here (same constraint as the file
-transcription work in #253). Everything below needs a real Mac with at
least one alternate input device (an external mic, a webcam mic, a
Bluetooth headset - USB or built-in both count) to actually check.

## Steps

1. **The list populates.** Open Settings → Microphone. It should show
   "System default" plus a real, named entry per connected input device
   (not "Microphone 1" placeholders - if you see those, the app doesn't
   have mic permission yet in that window; dictate once first, or check
   System Settings → Privacy & Security → Microphone).
2. **Picking a device sticks.** Select a specific device, then reopen
   Settings (or restart the app) - it should still show that device
   selected, not have reverted to System default.
3. **Dictation still works.** With a specific device selected, dictate
   normally. Confirm the words are actually coming from that device (mute
   or unplug your system-default mic first, if you have two, to be sure).
4. **Switching while idle.** With the app idle (not recording), change
   the selected device in Settings. The very next dictation should use the
   new device, with no restart needed.
5. **Switching mid-recording.** Hold push-to-talk, and while still holding
   it, switch the device in Settings. The recording in progress should
   finish normally (against whichever device it started with) rather than
   glitching or dropping audio - the switch should only take effect
   starting with the *next* dictation. Console logs around
   `[capture]`/`switchDevice` confirm the queued-switch path ran.
6. **A device that disappears.** Select a specific external device, then
   physically disconnect it (unplug it, or turn off a Bluetooth headset),
   then dictate. Confirm the app falls back to the system default rather
   than the dictation silently failing - check the console for
   `[capture] selected microphone unavailable ... falling back to the
   system default`. Reselecting a connected device in Settings should
   recover normal operation.
7. **System default, unchanged.** With System default selected (the
   out-of-the-box setting), dictation should behave exactly as it did
   before this change - this is the regression check.
