import AccessibilityInjection
import ApplicationServices
import AppKit
import Foundation

func eprint(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

// stdout carries protocol only - every line here must be one JSON object.
func emit(_ dict: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: dict),
          let line = String(data: data, encoding: .utf8) else {
        eprint("accessibility-helper: failed to serialise a reply, dropping it")
        return
    }
    print(line)
    fflush(stdout)
}

// Accessibility, never Input Monitoring - the hotkey helper (#5) holds that
// separately, per the two-helper split settled in #26.
if !AXIsProcessTrusted() {
    eprint("accessibility-helper: Accessibility access not yet granted, requesting it now")
    let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: true]
    _ = AXIsProcessTrustedWithOptions(options)
}

let tracker = RealAppSwitchTracker()

// NSWorkspace notifications need a pumping run loop to arrive, and the main
// thread spends its time blocked in readLine() and the AX calls the engine
// makes - see RealAppSwitchTracker's doc comment.
Thread {
    tracker.startObserving()
    RunLoop.current.run()
}.start()

let config = Config()
let focusResolver = RealFocusResolver(tracker: tracker, log: eprint)
let engine = InjectionEngine(
    config: config,
    focusResolver: focusResolver,
    paster: RealClipboardPaster(restoreMs: config.restoreMs, log: eprint),
    typer: RealKeyTyper(),
    tracker: tracker,
    log: eprint
)

emit(["event": "ready"])

// Command loop: one newline-delimited JSON object per line on stdin, one
// reply per line on stdout, tagged with the same id so a slow request never
// head-of-line-blocks whatever the main process sent after it.
while let line = readLine(strippingNewline: true) {
    guard !line.isEmpty,
          let data = line.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = obj["id"] as? String,
          let cmd = obj["cmd"] as? String else {
        eprint("accessibility-helper: ignoring malformed request: \(line)")
        continue
    }

    switch cmd {
    case "context":
        guard let context = focusResolver.focusContext(deadlineMs: config.axDeadlineMs) else {
            emit(["id": id, "status": "error", "reason": "focused element unavailable"])
            continue
        }
        emit([
            "id": id,
            "status": "ok",
            "bundleId": context.bundleId,
            "isOneLineField": context.isOneLineField,
        ])
    case "insert", "inject":
        guard let text = obj["text"] as? String, !text.isEmpty else {
            emit(["id": id, "status": "error", "reason": "insert requires non-empty \"text\""])
            continue
        }
        var reply = engine.decide(text: text).replyFields
        reply["id"] = id
        emit(reply)
    default:
        emit(["id": id, "status": "error", "reason": "unknown command \"\(cmd)\""])
    }
}
