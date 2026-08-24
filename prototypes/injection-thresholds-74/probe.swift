// PROTOTYPE — throwaway measurement harness for issue #74.
// Measures NSWorkspace activation, frontmost-app observation, and AX focused-element
// readiness on real app switches. This is evidence gathering, not production code.

import AppKit
import ApplicationServices
import Foundation

struct Target: Codable {
    let name: String
    let bundleID: String
}

let targets = [
    Target(name: "Terminal", bundleID: "com.apple.Terminal"),
    Target(name: "TextEdit", bundleID: "com.apple.TextEdit"),
    Target(name: "Notes", bundleID: "com.apple.Notes"),
    Target(name: "Safari", bundleID: "com.apple.Safari"),
    Target(name: "Google Chrome", bundleID: "com.google.Chrome"),
    Target(name: "Visual Studio Code", bundleID: "com.microsoft.VSCode"),
    Target(name: "Cursor", bundleID: "com.todesktop.230313mzl4w4u92"),
    Target(name: "Obsidian", bundleID: "md.obsidian"),
    Target(name: "Slack", bundleID: "com.tinyspeck.slackmacgap"),
    Target(name: "WhatsApp", bundleID: "net.whatsapp.WhatsApp"),
]

struct Options {
    var mode = "manual"
    var output = "measurement.jsonl"
    var condition = "idle"
    var repetitions = 20
    var dwellMs = 4_000
    var controlApp = "Terminal"
}

func parseOptions() -> Options {
    var out = Options()
    let args = Array(CommandLine.arguments.dropFirst())
    var i = 0
    while i < args.count {
        switch args[i] {
        case "--mode": i += 1; out.mode = args[i]
        case "--output": i += 1; out.output = args[i]
        case "--condition": i += 1; out.condition = args[i]
        case "--repetitions": i += 1; out.repetitions = Int(args[i]) ?? out.repetitions
        case "--dwell-ms": i += 1; out.dwellMs = Int(args[i]) ?? out.dwellMs
        case "--control-app": i += 1; out.controlApp = args[i]
        default: fputs("Unknown argument: \(args[i])\n", stderr); exit(2)
        }
        i += 1
    }
    return out
}

let options = parseOptions()
let startedUptime = ProcessInfo.processInfo.systemUptime
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]

final class EventLog: @unchecked Sendable {
    private let lock = NSLock()
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
        row["uptimeMs"] = Int(ProcessInfo.processInfo.systemUptime * 1_000)
        row["elapsedMs"] = Int((ProcessInfo.processInfo.systemUptime - startedUptime) * 1_000)
        row["wallTime"] = ISO8601DateFormatter().string(from: Date())
        guard JSONSerialization.isValidJSONObject(row),
              let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        lock.lock()
        handle.write(data)
        handle.write(Data([0x0a]))
        handle.synchronizeFile()
        lock.unlock()
    }
}

let log = EventLog(path: options.output)

func axErrorName(_ error: AXError) -> String {
    switch error {
    case .success: return "success"
    case .failure: return "failure"
    case .illegalArgument: return "illegalArgument"
    case .invalidUIElement: return "invalidUIElement"
    case .invalidUIElementObserver: return "invalidUIElementObserver"
    case .cannotComplete: return "cannotComplete"
    case .attributeUnsupported: return "attributeUnsupported"
    case .actionUnsupported: return "actionUnsupported"
    case .notificationUnsupported: return "notificationUnsupported"
    case .notImplemented: return "notImplemented"
    case .notificationAlreadyRegistered: return "notificationAlreadyRegistered"
    case .notificationNotRegistered: return "notificationNotRegistered"
    case .apiDisabled: return "apiDisabled"
    case .noValue: return "noValue"
    case .parameterizedAttributeUnsupported: return "parameterizedAttributeUnsupported"
    case .notEnoughPrecision: return "notEnoughPrecision"
    @unknown default: return "unknown(\(error.rawValue))"
    }
}

func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
    return value as? String
}

let watcherQueue = DispatchQueue(label: "openstream.issue74.ax-watchers", attributes: .concurrent)
let watcherLock = NSLock()
var watcherGeneration = 0
var pokedPIDs = Set<pid_t>()

func startAXWatcher(app: NSRunningApplication, activationUptimeMs: Int) {
    watcherLock.lock()
    watcherGeneration += 1
    let generation = watcherGeneration
    watcherLock.unlock()

    watcherQueue.async {
        let appElement = AXUIElementCreateApplication(app.processIdentifier)
        watcherLock.lock()
        let alreadyPoked = pokedPIDs.contains(app.processIdentifier)
        if !alreadyPoked { pokedPIDs.insert(app.processIdentifier) }
        watcherLock.unlock()

        if !alreadyPoked {
            let pokeStarted = ProcessInfo.processInfo.systemUptime
            let pokeError = AXUIElementSetAttributeValue(appElement, "AXManualAccessibility" as CFString, kCFBooleanTrue)
            log.emit("axManualAccessibility", [
                "activationUptimeMs": activationUptimeMs,
                "bundleID": app.bundleIdentifier ?? "",
                "pid": Int(app.processIdentifier),
                "result": axErrorName(pokeError),
                "durationMs": Int((ProcessInfo.processInfo.systemUptime - pokeStarted) * 1_000),
            ])
        }

        let deadline = ProcessInfo.processInfo.systemUptime + 5.0
        var attempt = 0
        while ProcessInfo.processInfo.systemUptime < deadline {
            watcherLock.lock()
            let currentGeneration = watcherGeneration
            watcherLock.unlock()
            if generation != currentGeneration { return }

            attempt += 1
            let queryStarted = ProcessInfo.processInfo.systemUptime
            var focused: CFTypeRef?
            let error = AXUIElementCopyAttributeValue(
                appElement,
                kAXFocusedUIElementAttribute as CFString,
                &focused
            )
            let queryEnded = ProcessInfo.processInfo.systemUptime
            let queryDurationMs = Int((queryEnded - queryStarted) * 1_000)
            let sinceActivationMs = Int(queryEnded * 1_000) - activationUptimeMs

            if error == .success, let focused {
                let element = focused as! AXUIElement
                log.emit("axReady", [
                    "activationUptimeMs": activationUptimeMs,
                    "attempt": attempt,
                    "bundleID": app.bundleIdentifier ?? "",
                    "pid": Int(app.processIdentifier),
                    "queryDurationMs": queryDurationMs,
                    "sinceActivationMs": sinceActivationMs,
                    "role": stringAttribute(element, kAXRoleAttribute as String) ?? "<unreadable>",
                    "subrole": stringAttribute(element, kAXSubroleAttribute as String) ?? "<none>",
                ])
                return
            }

            log.emit("axNotReady", [
                "activationUptimeMs": activationUptimeMs,
                "attempt": attempt,
                "bundleID": app.bundleIdentifier ?? "",
                "pid": Int(app.processIdentifier),
                "queryDurationMs": queryDurationMs,
                "sinceActivationMs": sinceActivationMs,
                "error": axErrorName(error),
            ])
            Thread.sleep(forTimeInterval: 0.010)
        }

        log.emit("axTimedOut", [
            "activationUptimeMs": activationUptimeMs,
            "bundleID": app.bundleIdentifier ?? "",
            "pid": Int(app.processIdentifier),
            "timeoutMs": 5_000,
        ])
    }
}

func activatedApp(from note: Notification) -> NSRunningApplication? {
    note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
}

let notificationCenter = NSWorkspace.shared.notificationCenter
let activationObserver = notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification,
    object: nil,
    queue: .main
) { note in
    guard let app = activatedApp(from: note) else { return }
    let now = Int(ProcessInfo.processInfo.systemUptime * 1_000)
    log.emit("workspaceActivation", [
        "activationUptimeMs": now,
        "appName": app.localizedName ?? "",
        "bundleID": app.bundleIdentifier ?? "",
        "pid": Int(app.processIdentifier),
    ])
    startAXWatcher(app: app, activationUptimeMs: now)
}

var lastFrontmostPID: pid_t = -1
let frontmostTimer = Timer(timeInterval: 0.010, repeats: true) { _ in
    guard let app = NSWorkspace.shared.frontmostApplication else { return }
    if app.processIdentifier != lastFrontmostPID {
        lastFrontmostPID = app.processIdentifier
        log.emit("frontmostObserved", [
            "appName": app.localizedName ?? "",
            "bundleID": app.bundleIdentifier ?? "",
            "pid": Int(app.processIdentifier),
        ])
    }
}
RunLoop.main.add(frontmostTimer, forMode: .common)

func activate(_ appName: String) -> Int32 {
    let script = Process()
    script.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    script.arguments = ["-e", "tell application \"\(appName)\" to activate"]
    script.standardOutput = FileHandle.nullDevice
    script.standardError = FileHandle.nullDevice
    do {
        try script.run()
        script.waitUntilExit()
        return script.terminationStatus
    } catch {
        return -1
    }
}

func startAutomatedSweep() {
    DispatchQueue.global(qos: .userInitiated).async {
        Thread.sleep(forTimeInterval: 1.0)
        var trial = 0
        for repetition in 1...options.repetitions {
            for target in targets {
                trial += 1
                let control = target.name == options.controlApp ? "TextEdit" : options.controlApp
                log.emit("controlActivationRequest", [
                    "appName": control,
                    "repetition": repetition,
                    "trial": trial,
                ])
                _ = activate(control)
                Thread.sleep(forTimeInterval: 1.0)

                log.emit("activationRequest", [
                    "appName": target.name,
                    "bundleID": target.bundleID,
                    "condition": options.condition,
                    "repetition": repetition,
                    "trial": trial,
                ])
                let status = activate(target.name)
                if status != 0 {
                    log.emit("activationFailed", [
                        "appName": target.name,
                        "bundleID": target.bundleID,
                        "status": Int(status),
                        "trial": trial,
                    ])
                }
                Thread.sleep(forTimeInterval: Double(options.dwellMs) / 1_000.0)
            }
        }
        log.emit("sweepComplete", ["trials": trial])
        // Give the final AX watcher time to finish, then terminate. RunLoop.run()
        // otherwise stays alive forever because the frontmost timer is repeating.
        DispatchQueue.main.asyncAfter(deadline: .now() + 6.0) { exit(0) }
    }
}

log.emit("runStarted", [
    "axTrusted": AXIsProcessTrusted(),
    "condition": options.condition,
    "dwellMs": options.dwellMs,
    "mode": options.mode,
    "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
    "repetitions": options.repetitions,
])

print("OpenStream injection timing prototype (issue #74)")
print("mode=\(options.mode) condition=\(options.condition) output=\(options.output)")
print("Accessibility trusted: \(AXIsProcessTrusted() ? "yes" : "NO")")
if !AXIsProcessTrusted() {
    print("Grant Accessibility to Terminal (or the host running this process), then re-run.")
}

if options.mode == "automated" {
    print("Automated sweep: \(targets.count) apps × \(options.repetitions) repetitions.")
    startAutomatedSweep()
} else {
    print("Manual pass: switch with Cmd+Tab or click app windows. Press Ctrl-C when done.")
}

RunLoop.main.run()
notificationCenter.removeObserver(activationObserver)
