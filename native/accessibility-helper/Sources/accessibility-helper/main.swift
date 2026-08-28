import AccessibilityInjection
import ApplicationServices
import AppKit
import Foundation
import IOKit.hid

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
        guard let context = focusResolver.focusContext(
            deadlineMs: config.axDeadlineMs,
            budgetMs: config.axReadyBudgetMs
        ) else {
            // Post-#181 a not-ready AX tree no longer lands here - it comes
            // back as a context with axReady:false. This nil now means the
            // tracker has no frontmost app or it carries no bundle id.
            // trusted is included so a lost Accessibility grant (#46/#88)
            // is distinguishable from a genuinely missing frontmost app.
            emit([
                "id": id,
                "status": "error",
                "reason": "no frontmost application",
                "trusted": AXIsProcessTrusted(),
            ])
            continue
        }
        emit([
            "id": id,
            "status": "ok",
            "bundleId": context.bundleId,
            "isOneLineField": context.isOneLineField,
            // #181: false when the focused element never became AX-ready and
            // isOneLineField is the safe default rather than the real role.
            "axReady": context.axReady,
        ])
    case "insert", "inject":
        guard let text = obj["text"] as? String, !text.isEmpty else {
            emit(["id": id, "status": "error", "reason": "insert requires non-empty \"text\""])
            continue
        }
        var reply = engine.decide(text: text).replyFields
        reply["id"] = id
        emit(reply)
    case "permissions":
        // #47: the two grants the app can't function without. Reported from
        // here because macOS attributes both to the Electron host that
        // spawned this process (issue #46), so this reads the same state the
        // pipeline actually depends on. IOHIDCheckAccess is a passive query -
        // it does not claim Input Monitoring, so it can't clash with the
        // hotkey helper's event tap.
        func inputMonitoring() -> String {
            switch IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) {
            case kIOHIDAccessTypeGranted: return "granted"
            case kIOHIDAccessTypeDenied: return "denied"
            default: return "unknown"
            }
        }
        emit([
            "id": id,
            "status": "ok",
            "accessibility": AXIsProcessTrusted(),
            "inputMonitoring": inputMonitoring(),
        ])
    case "selection":
        // #17: a get-only read of the focused field's current selection,
        // used at push-to-talk key-down to tell a voice edit from an
        // ordinary dictation. No settle guard, no injection.
        guard let context = focusResolver.selectionContext(
            deadlineMs: config.axDeadlineMs,
            budgetMs: config.axReadyBudgetMs
        ) else {
            emit(["id": id, "status": "error", "reason": "focused element unavailable"])
            continue
        }
        if context.selectedText.isEmpty {
            emit(["id": id, "status": "empty"])
            continue
        }
        emit([
            "id": id,
            "status": "ok",
            "text": context.selectedText,
            "bundleId": context.bundleId,
            "isOneLineField": context.isOneLineField,
        ])
    default:
        emit(["id": id, "status": "error", "reason": "unknown command \"\(cmd)\""])
    }
}
