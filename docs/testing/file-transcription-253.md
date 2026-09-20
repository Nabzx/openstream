# Manual check: drop-a-file transcription (#253)

CI covers the queue coordinator (`fileTranscriptionQueue.test.js`) and the
`transcribeFile` request/reply shape (`transcriptionHelper.test.js`) against
fakes. What it can't drive: the real Swift command, drag-and-drop, the file
picker, or a real audio file actually decoding.

**The Swift side (`transcribeFile` in `native/transcription-helper`) is
compile-verified only** - it was never executed in the session that wrote it;
every attempt to run `transcription-helper` there got killed by the sandbox
within seconds. Run `npm run build:transcription-helper` before testing any
of this - the checked-in `resources/bin/transcription-helper` predates the
change.

## Steps

1. **Basic drop.** Open the **Files** tab. Drag a short `.wav` or `.m4a`
   file (a Voice Memo works) onto the drop zone - it highlights on
   dragover, and the file appears in the queue as "Transcribing…" then
   "Done" with a transcript.
2. **The file picker.** Click **Choose files…**, pick 2-3 files at once
   (multi-select) in different formats - `.wav`, `.m4a`, `.mp3` if you
   have one handy. All three should queue and process one at a time, in
   the order picked - confirm only one row ever shows "Transcribing…" at
   once.
3. **A long file.** Drop something over ~30s (FluidAudio's own streaming
   threshold) - a longer Voice Memo or an exported meeting recording.
   Confirm it still produces a full transcript, not just the first ~30s -
   this is what confirms the file-URL `transcribe()` overload is really
   auto-chunking rather than silently truncating.
4. **A bad file.** Drop something that isn't audio (a `.txt`, a `.jpg`).
   The row should land on "Failed" with a readable error, not crash the
   queue or the app - and the next queued file (if any) should still run.
5. **Copy / Save.** On a done job, click **Copy** - paste somewhere to
   confirm the clipboard has the transcript. Click **Save** - a `.txt`
   with the same base name should appear next to the source file; open it
   to confirm the text matches. Save again - it overwrites without asking
   (deliberate, see the #253 PR).
6. **Retry / Remove.** On a failed job, **Retry** re-queues it. On any
   job that isn't currently transcribing, **Remove** drops it from the
   list. Confirm **Remove** is unavailable (or a no-op) on the row that's
   actively transcribing.
7. **Clear finished.** With a mix of done/failed/queued jobs, **Clear
   finished** should drop the done and failed rows and leave anything
   still queued or transcribing.
8. **Concurrency with live dictation - the known tradeoff.** Drop a longish
   file, and while it's transcribing, hold push-to-talk and dictate
   normally. Confirm what actually happens: does the live dictation wait
   behind the file job (expected, per the #253 PR), or does something worse
   happen (a crash, a lost dictation, the overlay hanging)? This is the one
   behaviour the PR flagged as accepted-but-unverified.
9. **No persistence across restart.** Quit and relaunch with jobs still in
   the queue - it should come back empty. This is deliberate for v1 (no
   backing store yet - see #253's PR for the "ties into #136" follow-up),
   confirm it's not silently losing an in-flight job's *file* (the source
   file on disk is never touched, only the in-app queue state resets).
