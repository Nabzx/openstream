import ApplicationServices
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
