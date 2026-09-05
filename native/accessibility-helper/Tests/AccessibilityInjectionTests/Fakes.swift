import Foundation
import AccessibilityInjection

// Drives InjectionEngine's injected `sleep`/`now` deterministically: every
// simulated sleep advances a counter instead of blocking, so a test that
// exercises the settle guard's polling loop runs in microseconds rather
// than the real 400-1200ms. Same "time is an input" principle the #62
// prototype used.
final class SimulatedTime {
    private(set) var elapsedMs: Double = 0

    func sleep(_ seconds: TimeInterval) {
        elapsedMs += seconds * 1000
    }

    func now() -> Date {
        Date(timeIntervalSince1970: elapsedMs / 1000)
    }
}

final class FakeAccessibilityTarget: AccessibilityTarget {
    var fieldInfo: FieldInfo
    var writeSucceeds: Bool
    var valueToReadBack: String?
    private(set) var writtenText: String?

    init(fieldInfo: FieldInfo, writeSucceeds: Bool = true, valueToReadBack: String? = nil) {
        self.fieldInfo = fieldInfo
        self.writeSucceeds = writeSucceeds
        self.valueToReadBack = valueToReadBack
    }

    func writeAtCaret(_ text: String) -> Bool {
        writtenText = text
        return writeSucceeds
    }

    func readValue() -> String? {
        valueToReadBack
    }
}

final class FakeFocusResolver: FocusResolving {
    var target: AccessibilityTarget?
    // #227: the injection path now retries within a budget. A positive
    // value here makes the first N reads miss, so a test can prove the
    // retry recovers a briefly-not-ready AX tree.
    var missesBeforeSuccess: Int
    private(set) var callCount = 0

    init(target: AccessibilityTarget?, missesBeforeSuccess: Int = 0) {
        self.target = target
        self.missesBeforeSuccess = missesBeforeSuccess
    }

    func resolveFocusedElement(deadlineMs _: Double) -> AccessibilityTarget? {
        callCount += 1
        if callCount <= missesBeforeSuccess {
            return nil
        }
        return target
    }
}

final class FakePaster: ClipboardPasting {
    var result: PasteResult
    private(set) var callCount = 0
    private(set) var lastVerifyAgainst: AccessibilityTarget?

    init(result: PasteResult) {
        self.result = result
    }

    func paste(text _: String, verifyAgainst: AccessibilityTarget?) -> PasteResult {
        callCount += 1
        lastVerifyAgainst = verifyAgainst
        return result
    }
}

final class FakeTyper: KeyTyping {
    private(set) var typedText: String?
    private(set) var completed: Bool?
    // Test config: when true (the default), shouldAbort is polled once, as
    // if it were the first character - enough to prove the engine wires it
    // through, without simulating a full character-by-character loop.
    var checksAbort = true

    func type(_ text: String, shouldAbort: () -> Bool) -> Bool {
        typedText = text
        if checksAbort && shouldAbort() {
            completed = false
            return false
        }
        completed = true
        return true
    }
}

final class FakeTracker: AppSwitchTracking {
    var ageProvider: () -> Double
    var appName: String?
    var bundleId: String?

    init(age: @escaping () -> Double, appName: String?, bundleId: String? = nil) {
        self.ageProvider = age
        self.appName = appName
        self.bundleId = bundleId
    }

    func ageMs() -> Double {
        ageProvider()
    }

    func currentFrontmostName() -> String? {
        appName
    }

    func currentFrontmostBundleId() -> String? {
        bundleId
    }
}
