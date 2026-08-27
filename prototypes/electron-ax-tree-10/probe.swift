// PROTOTYPE — throwaway measurement harness for issue #10.
// Single-shot probe: run it once per manual trial, against whatever app is
// currently frontmost, after you've clicked into a real editable field in
// it. Not production code - see ../injection-thresholds-74/probe.swift,
// which this borrows its logging/AXError-naming conventions from.
//
// Question: for a Chromium/Electron target, does AXManualAccessibility (the
// mechanism RealAdapters.swift already calls) actually unlock a real,
// navigable accessibility tree, or only sometimes make a single leaf query
// succeed while everything around it stays a stub? And does the private
// AXEnhancedUserInterface attribute (electron/electron#37465's named
// workaround) do any better, when it's implemented at all?
//
// "Tree richness" here means: from the focused element's containing window,
// walk kAXChildrenAttribute breadth-first up to `treeCap` nodes / 4 levels
// deep and count what's actually reachable. A single stub AXWebArea reports
// as depth 1, node count 1 or 2. A real tree reports dozens+ even capped.

import AppKit
import ApplicationServices
import Foundation

struct Options {
    var mechanism = "manual" // manual | enhanced | both | none
    var output = "logs/probe.jsonl"
    var note = ""
    var deadlineMs = 3_000
    var treeCap = 50
}

func parseOptions() -> Options {
    var out = Options()
    let args = Array(CommandLine.arguments.dropFirst())
    var i = 0
    while i < args.count {
        switch args[i] {
        case "--mechanism": i += 1; out.mechanism = args[i]
        case "--output": i += 1; out.output = args[i]
        case "--note": i += 1; out.note = args[i]
        case "--deadline-ms": i += 1; out.deadlineMs = Int(args[i]) ?? out.deadlineMs
        case "--tree-cap": i += 1; out.treeCap = Int(args[i]) ?? out.treeCap
        default: fputs("Unknown argument: \(args[i])\n", stderr); exit(2)
        }
        i += 1
    }
    return out
}

let options = parseOptions()

final class EventLog {
    private let handle: FileHandle
    init(path: String) {
        if !FileManager.default.fileExists(atPath: path) {
            FileManager.default.createFile(atPath: path, contents: nil)
        }
        guard let handle = FileHandle(forWritingAtPath: path) else {
            fputs("Cannot open output: \(path)\n", stderr)
            exit(2)
        }
        handle.seekToEndOfFile()
        self.handle = handle
    }
    func emit(_ event: String, _ fields: [String: Any] = [:]) {
        var row = fields
        row["event"] = event
        row["wallTime"] = ISO8601DateFormatter().string(from: Date())
        guard JSONSerialization.isValidJSONObject(row),
              let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        handle.write(data)
        handle.write(Data([0x0a]))
    }
}

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

func children(_ element: AXUIElement) -> [AXUIElement] {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success else { return [] }
    return (value as? [AXUIElement]) ?? []
}

// Breadth-first, capped both in node count and depth, so a genuinely large
// real tree can't turn this into a multi-second walk - the point is only to
// distinguish "stub" from "real", not to fully enumerate anything.
func treeRichness(from root: AXUIElement, cap: Int) -> (nodeCount: Int, maxDepth: Int, cappedAt: Bool, roles: [String]) {
    var queue: [(AXUIElement, Int)] = [(root, 0)]
    var seenCount = 0
    var maxDepth = 0
    var roleSample: [String] = []
    while !queue.isEmpty && seenCount < cap {
        let (el, depth) = queue.removeFirst()
        seenCount += 1
        maxDepth = max(maxDepth, depth)
        if roleSample.count < 10, let role = stringAttribute(el, kAXRoleAttribute as String) {
            roleSample.append(role)
        }
        if depth < 4 {
            for child in children(el) {
                if seenCount + queue.count >= cap { break }
                queue.append((child, depth + 1))
            }
        }
    }
    return (seenCount, maxDepth, seenCount >= cap, roleSample)
}

func tryFocusedElement(_ appElement: AXUIElement) -> (AXError, AXUIElement?) {
    var ref: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &ref)
    return (err, err == .success ? (ref as! AXUIElement) : nil)
}

func pollUntilReady(_ appElement: AXUIElement, deadlineMs: Int, log: EventLog, mechanism: String) {
    let start = Date()
    var attempt = 0
    while Date().timeIntervalSince(start) * 1000 < Double(deadlineMs) {
        attempt += 1
        let (err, focused) = tryFocusedElement(appElement)
        let elapsedMs = Int(Date().timeIntervalSince(start) * 1000)
        if err == .success, let focused {
            var richness: (nodeCount: Int, maxDepth: Int, cappedAt: Bool, roles: [String])? = nil
            var windowRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &windowRef) == .success,
               let windowRef {
                richness = treeRichness(from: windowRef as! AXUIElement, cap: options.treeCap)
            }
            log.emit("pollSucceeded", [
                "mechanism": mechanism,
                "attempt": attempt,
                "elapsedMs": elapsedMs,
                "focusedRole": stringAttribute(focused, kAXRoleAttribute as String) ?? "<unreadable>",
                "focusedSubrole": stringAttribute(focused, kAXSubroleAttribute as String) ?? "<none>",
                "treeNodeCount": richness?.nodeCount ?? -1,
                "treeMaxDepth": richness?.maxDepth ?? -1,
                "treeCappedAt": richness?.cappedAt ?? false,
                "treeRoleSample": richness?.roles ?? [],
            ])
            print("  \(mechanism): succeeded after \(elapsedMs)ms (\(attempt) attempts) - tree nodes=\(richness?.nodeCount ?? -1) depth=\(richness?.maxDepth ?? -1)")
            return
        }
        Thread.sleep(forTimeInterval: 0.01)
    }
    log.emit("pollTimedOut", ["mechanism": mechanism, "attempts": attempt, "deadlineMs": deadlineMs])
    print("  \(mechanism): never succeeded within \(deadlineMs)ms (\(attempt) attempts)")
}

guard let frontApp = NSWorkspace.shared.frontmostApplication else {
    print("no frontmost app")
    exit(1)
}
let appElement = AXUIElementCreateApplication(frontApp.processIdentifier)
let log = EventLog(path: options.output)

log.emit("trialStart", [
    "appName": frontApp.localizedName ?? "",
    "bundleId": frontApp.bundleIdentifier ?? "",
    "pid": Int(frontApp.processIdentifier),
    "axTrusted": AXIsProcessTrusted(),
    "mechanism": options.mechanism,
    "note": options.note,
])
print("target: \(frontApp.localizedName ?? "?") (\(frontApp.bundleIdentifier ?? "?"), pid \(frontApp.processIdentifier))")
print("AXIsProcessTrusted: \(AXIsProcessTrusted())")

let (baselineErr, _) = tryFocusedElement(appElement)
log.emit("baseline", ["result": axErrorName(baselineErr)])
print("baseline kAXFocusedUIElementAttribute: \(axErrorName(baselineErr))")

func runMechanism(_ name: String, attribute: String) {
    let setStart = Date()
    let setErr = AXUIElementSetAttributeValue(appElement, attribute as CFString, kCFBooleanTrue)
    let setDurationMs = Int(Date().timeIntervalSince(setStart) * 1000)
    log.emit("setAttribute", ["mechanism": name, "attribute": attribute, "result": axErrorName(setErr), "durationMs": setDurationMs])
    print("\(name): AXUIElementSetAttributeValue(\(attribute)) -> \(axErrorName(setErr))")
    pollUntilReady(appElement, deadlineMs: options.deadlineMs, log: log, mechanism: name)
}

switch options.mechanism {
case "manual":
    runMechanism("axManualAccessibility", attribute: "AXManualAccessibility")
case "enhanced":
    runMechanism("axEnhancedUserInterface", attribute: "AXEnhancedUserInterface")
case "both":
    runMechanism("axManualAccessibility", attribute: "AXManualAccessibility")
    runMechanism("axEnhancedUserInterface", attribute: "AXEnhancedUserInterface")
case "none":
    pollUntilReady(appElement, deadlineMs: options.deadlineMs, log: log, mechanism: "none")
default:
    fputs("--mechanism must be manual, enhanced, both, or none\n", stderr)
    exit(2)
}
