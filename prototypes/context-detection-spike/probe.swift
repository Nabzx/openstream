// PROTOTYPE - throwaway spike for issue #28 ("Can context-awareness be detected
// reliably enough to carry the product?"). Not production code, not a native
// helper, not tested. It exists to produce a map of where macOS Accessibility
// context detection works, where it lies, and where it returns nothing.
//
// Run:  swift probe.swift            (poll, print on change)
//       swift probe.swift --prompt   (same, but ask for Accessibility trust first)
//       swift probe.swift --poke     (same, but set AXManualAccessibility on each
//                                     frontmost app before reading it - the knob
//                                     Chromium/Electron apps gate their a11y tree behind)
//       swift probe.swift --once     (single sample, then exit)

import Foundation
import AppKit
import ApplicationServices

// ---------------------------------------------------------------- arguments
let args = Set(CommandLine.arguments.dropFirst())
let wantPrompt = args.contains("--prompt")
let wantPoke = args.contains("--poke")
let onceOnly = args.contains("--once")
let intervalSeconds = 0.4

// ---------------------------------------------------------------- AX helpers

func axErrorName(_ e: AXError) -> String {
    switch e {
    case .success: return "success"
    case .failure: return "kAXErrorFailure"
    case .illegalArgument: return "kAXErrorIllegalArgument"
    case .invalidUIElement: return "kAXErrorInvalidUIElement"
    case .invalidUIElementObserver: return "kAXErrorInvalidUIElementObserver"
    case .cannotComplete: return "kAXErrorCannotComplete"
    case .attributeUnsupported: return "kAXErrorAttributeUnsupported"
    case .actionUnsupported: return "kAXErrorActionUnsupported"
    case .notificationUnsupported: return "kAXErrorNotificationUnsupported"
    case .notImplemented: return "kAXErrorNotImplemented"
    case .notificationAlreadyRegistered: return "kAXErrorNotificationAlreadyRegistered"
    case .notificationNotRegistered: return "kAXErrorNotificationNotRegistered"
    case .apiDisabled: return "kAXErrorAPIDisabled"
    case .noValue: return "kAXErrorNoValue"
    case .parameterizedAttributeUnsupported: return "kAXErrorParameterizedAttributeUnsupported"
    case .notEnoughPrecision: return "kAXErrorNotEnoughPrecision"
    @unknown default: return "kAXErrorUnknown(\(e.rawValue))"
    }
}

/// Reads one attribute. Returns either the value or the exact AXError name,
/// because "which flavour of nothing" is the actual deliverable of this spike.
func copyAttr(_ element: AXUIElement, _ attribute: String) -> (value: CFTypeRef?, error: AXError) {
    var out: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(element, attribute as CFString, &out)
    return (out, err)
}

func stringAttr(_ element: AXUIElement, _ attribute: String) -> String {
    let (value, err) = copyAttr(element, attribute)
    if err != .success { return "<\(axErrorName(err))>" }
    guard let value = value else { return "<nil>" }
    if let s = value as? String { return s.isEmpty ? "<empty>" : s }
    if let n = value as? NSNumber { return n.stringValue }
    return "<non-string value>"
}

/// Can we read the text out of this element at all? Separate from "is there a role",
/// because an element with a role but no readable value is still useless to us.
func valueReadability(_ element: AXUIElement) -> String {
    let (value, err) = copyAttr(element, kAXValueAttribute as String)
    if err != .success { return "no (\(axErrorName(err)))" }
    guard let value = value else { return "no (nil)" }
    if let s = value as? String { return "yes (\(s.count) chars)" }
    return "yes (non-string)"
}

func selectedTextReadability(_ element: AXUIElement) -> String {
    let (value, err) = copyAttr(element, kAXSelectedTextAttribute as String)
    if err != .success { return "no (\(axErrorName(err)))" }
    guard let s = value as? String else { return "no (non-string)" }
    return "yes (\(s.count) chars)"
}

/// The Chromium / Electron knob. Setting AXManualAccessibility on the application
/// element is what makes those apps build and expose their a11y tree at all.
@discardableResult
func pokeManualAccessibility(_ appElement: AXUIElement) -> String {
    let err = AXUIElementSetAttributeValue(appElement,
                                           "AXManualAccessibility" as CFString,
                                           kCFBooleanTrue)
    return axErrorName(err)
}

// ---------------------------------------------------------------- sampling

struct Sample {
    var frontApp: String
    var bundleID: String
    var pid: String
    var trusted: String
    var pokeResult: String
    var systemWideFocus: String
    var appFocusRole: String
    var appFocusSubrole: String
    var appFocusRoleDescription: String
    var appFocusTitle: String
    var readableValue: String
    var readableSelection: String
    var windowTitle: String

    /// What changes trigger a new log record. Deliberately excludes the value
    /// length, so typing into one field does not spam the log.
    var identity: String {
        [bundleID, pid, systemWideFocus, appFocusRole, appFocusSubrole,
         appFocusRoleDescription, appFocusTitle, windowTitle].joined(separator: "|")
    }
}

func sampleNow() -> Sample {
    let trusted = AXIsProcessTrusted()
    var s = Sample(frontApp: "<none>", bundleID: "<none>", pid: "<none>",
                   trusted: trusted ? "yes" : "NO",
                   pokeResult: wantPoke ? "<not attempted>" : "<skipped>",
                   systemWideFocus: "<not read>",
                   appFocusRole: "<not read>", appFocusSubrole: "<not read>",
                   appFocusRoleDescription: "<not read>", appFocusTitle: "<not read>",
                   readableValue: "<not read>", readableSelection: "<not read>",
                   windowTitle: "<not read>")

    // Layer 1: frontmost app. Needs no Accessibility permission whatsoever.
    guard let app = NSWorkspace.shared.frontmostApplication else { return s }
    s.frontApp = app.localizedName ?? "<unnamed>"
    s.bundleID = app.bundleIdentifier ?? "<no bundle id>"
    s.pid = String(app.processIdentifier)

    // Layer 2: focused element. Needs Accessibility trust, and needs the app to
    // actually publish a tree.
    let appElement = AXUIElementCreateApplication(app.processIdentifier)
    if wantPoke {
        s.pokeResult = pokeManualAccessibility(appElement)
    }

    let systemWide = AXUIElementCreateSystemWide()
    let (swFocus, swErr) = copyAttr(systemWide, kAXFocusedUIElementAttribute as String)
    if swErr != .success {
        s.systemWideFocus = "<\(axErrorName(swErr))>"
    } else if let swFocus = swFocus {
        let el = swFocus as! AXUIElement
        s.systemWideFocus = stringAttr(el, kAXRoleAttribute as String)
    } else {
        s.systemWideFocus = "<nil>"
    }

    let (focused, focusErr) = copyAttr(appElement, kAXFocusedUIElementAttribute as String)
    if focusErr != .success || focused == nil {
        let reason = (focused == nil && focusErr == .success) ? "<nil>" : "<\(axErrorName(focusErr))>"
        s.appFocusRole = reason
        s.appFocusSubrole = reason
        s.appFocusRoleDescription = reason
        s.appFocusTitle = reason
        s.readableValue = reason
        s.readableSelection = reason
    } else {
        let el = focused as! AXUIElement
        s.appFocusRole = stringAttr(el, kAXRoleAttribute as String)
        s.appFocusSubrole = stringAttr(el, kAXSubroleAttribute as String)
        s.appFocusRoleDescription = stringAttr(el, kAXRoleDescriptionAttribute as String)
        s.appFocusTitle = stringAttr(el, kAXTitleAttribute as String)
        s.readableValue = valueReadability(el)
        s.readableSelection = selectedTextReadability(el)
    }

    let (window, winErr) = copyAttr(appElement, kAXFocusedWindowAttribute as String)
    if winErr != .success || window == nil {
        s.windowTitle = "<\(axErrorName(winErr))>"
    } else {
        s.windowTitle = stringAttr(window as! AXUIElement, kAXTitleAttribute as String)
    }
    return s
}

// ---------------------------------------------------------------- output

func stamp() -> String {
    let f = DateFormatter()
    f.dateFormat = "HH:mm:ss"
    return f.string(from: Date())
}

func emit(_ s: Sample) {
    print("""
    ---------------------------------------------------------------
    [\(stamp())] frontmost app     : \(s.frontApp)
                bundle id         : \(s.bundleID)  (pid \(s.pid))
                AX trusted        : \(s.trusted)
                AXManualAccess.   : \(s.pokeResult)
                window title      : \(s.windowTitle)
                system-wide focus : \(s.systemWideFocus)
                focused role      : \(s.appFocusRole)
                focused subrole   : \(s.appFocusSubrole)
                role description  : \(s.appFocusRoleDescription)
                focused title     : \(s.appFocusTitle)
                AXValue readable  : \(s.readableValue)
                AXSelectedText    : \(s.readableSelection)
    """)
    fflush(stdout)
}

// ---------------------------------------------------------------- main

if wantPrompt {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(options)
}

print("OpenStream context-detection spike (issue #28) - PROTOTYPE, throwaway")
print("AXIsProcessTrusted() = \(AXIsProcessTrusted())")
if !AXIsProcessTrusted() {
    print("NOT TRUSTED: every focused-element read below will fail with kAXErrorAPIDisabled.")
    print("Grant Accessibility to the app running this process, then re-run.")
}
print("poke AXManualAccessibility = \(wantPoke)   interval = \(intervalSeconds)s")
print("Switch apps and click into text fields. Records print only when something changes.")
print("Ctrl-C to stop.")

if onceOnly {
    emit(sampleNow())
    exit(0)
}

var lastIdentity = ""
while true {
    let s = sampleNow()
    if s.identity != lastIdentity {
        lastIdentity = s.identity
        emit(s)
    }
    // Must pump the run loop, not sleep. NSWorkspace.frontmostApplication is
    // updated by notifications delivered on the run loop; a process that only
    // sleeps keeps reporting whichever app was frontmost when it launched.
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(intervalSeconds))
}
