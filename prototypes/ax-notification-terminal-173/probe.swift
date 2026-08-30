// PROTOTYPE — throwaway measurement harness for issue #173.
// Registers NSWorkspace.didActivateApplicationNotification exactly the way
// RealAppSwitchTracker does (background thread, pumped run loop) and logs
// every event it actually receives, alongside a periodic direct poll of
// NSWorkspace.shared.frontmostApplication from the same thread as ground
// truth. Run this once from a plain Terminal window and once from VS
// Code's integrated terminal, switch apps a few times during each run,
// and compare - if the notification-driven log stays silent while the
// periodic poll shows real transitions, that's the bug reproduced with a
// minimal, isolated repro instead of the full app.
import AppKit
import Foundation

let start = Date()
func elapsedMs() -> Int { Int(Date().timeIntervalSince(start) * 1000) }

final class EventLog {
    private let handle: FileHandle
    init(path: String) {
        FileManager.default.createFile(atPath: path, contents: nil)
        guard let handle = FileHandle(forWritingAtPath: path) else {
            fputs("Cannot open output: \(path)\n", stderr)
            exit(2)
        }
        self.handle = handle
    }
    func emit(_ event: String, _ fields: [String: Any] = [:]) {
        var row = fields
        row["event"] = event
        row["elapsedMs"] = elapsedMs()
        guard JSONSerialization.isValidJSONObject(row),
              let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        handle.write(data)
        handle.write(Data([0x0a]))
        print("[\(elapsedMs())ms] \(event) \(fields)")
    }
}

let outputPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "probe.jsonl"
let log = EventLog(path: outputPath)

// Walk the parent process chain so we have hard evidence of what this
// process was actually launched under, not just an assumption from which
// terminal window we typed the command into.
func processName(pid: pid_t) -> String {
    var buffer = [CChar](repeating: 0, count: 4096)
    let len = proc_name(pid, &buffer, UInt32(buffer.count))
    return len > 0 ? String(cString: buffer) : "?"
}
func parentPid(of pid: pid_t) -> pid_t {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
    sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
    return info.kp_eproc.e_ppid
}

var chain: [[String: Any]] = []
var pid = getpid()
for _ in 0..<8 {
    chain.append(["pid": Int(pid), "name": processName(pid: pid)])
    let parent = parentPid(of: pid)
    if parent <= 1 || parent == pid { break }
    pid = parent
}
log.emit("processAncestry", ["chain": chain])

print("PROTOTYPE #173 - NSWorkspace notification delivery probe")
print("Run this from a plain Terminal window in one pass, VS Code's integrated terminal in another.")
print("Switch between 2-3 real apps a few times over the next 30s while this runs.")
print("Writing \(outputPath)")

var lastKnownFrontmost: String? = nil

// Same pattern as RealAppSwitchTracker: register + pump from the same
// background thread, per the documented reason real reads of
// NSWorkspace.shared.frontmostApplication go stale on a thread that never
// pumps a run loop.
Thread {
    let notificationCenter = NSWorkspace.shared.notificationCenter
    _ = notificationCenter.addObserver(
        forName: NSWorkspace.didActivateApplicationNotification,
        object: nil,
        queue: nil
    ) { note in
        let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        lastKnownFrontmost = app?.localizedName
        log.emit("notificationReceived", [
            "appName": app?.localizedName ?? "?",
            "bundleId": app?.bundleIdentifier ?? "?",
        ])
    }

    let pollTimer = Timer(timeInterval: 1.0, repeats: true) { _ in
        let direct = NSWorkspace.shared.frontmostApplication
        log.emit("directPoll", [
            "appName": direct?.localizedName ?? "?",
            "matchesNotificationCache": (direct?.localizedName ?? "?") == (lastKnownFrontmost ?? "?"),
        ])
    }
    RunLoop.current.add(pollTimer, forMode: .common)
    RunLoop.current.run(until: Date().addingTimeInterval(35))
    log.emit("done", [:])
    exit(0)
}.start()

RunLoop.main.run(until: Date().addingTimeInterval(36))
