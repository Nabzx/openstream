import ApplicationServices
import AppKit
import Foundation

func eprint(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

// The thresholds #62 left as placeholders, pending real measurement in #74.
// stableForBlindPasteMs is deliberately 2x settleMs: settleMs asks "has the
// target stopped moving", stableForBlindPasteMs asks "have we watched it
// stand still long enough to believe the user is looking at it" - see #62.
struct Config {
    var settleMs: Double = 400
    var settleBudgetMs: Double = 1200
    var axDeadlineMs: Double = 150
    var restoreMs: Double = 300
    var axValueMaxChars = 2000
    var longTextChars = 120
    var stableForBlindPasteMs: Double? = 800
}
let config = Config()

// Tracks when the frontmost app last changed, so delivery can be gated on it
// rather than trusting a possibly-stale pid - see #62's settle guard. Runs on
// its own thread with its own run loop: NSWorkspace notifications need a
// pumping run loop to arrive, and the main thread spends its time blocked in
// readLine() and in the AX calls below.
final class AppSwitchTracker {
    private let lock = NSLock()
    private var switchedAt = Date()

    func recordSwitch() {
        lock.lock()
        switchedAt = Date()
        lock.unlock()
    }

    func ageMs(now: Date = Date()) -> Double {
        lock.lock()
        defer { lock.unlock() }
        return now.timeIntervalSince(switchedAt) * 1000
    }
}
let tracker = AppSwitchTracker()

Thread {
    NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.didActivateApplicationNotification,
        object: nil,
        queue: nil
    ) { _ in tracker.recordSwitch() }
    RunLoop.current.run()
}.start()

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
    default:
        emit(["id": id, "status": "error", "reason": "unknown command \"\(cmd)\""])
    }
}
