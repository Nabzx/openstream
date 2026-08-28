import XCTest
@testable import HotkeyMatcher

final class HotkeyMatcherTests: XCTestCase {
    func testLegacyKeyUpUsesThePressThatStartedThePair() {
        var matcher = HotkeyMatcher(keyCode: 2, flags: [.control, .alternate])

        XCTAssertEqual(
            matcher.handle(HotkeyEvent(keyCode: 2, type: .keyDown, flags: [.control, .alternate])),
            .down
        )
        XCTAssertEqual(matcher.handle(HotkeyEvent(keyCode: 2, type: .keyUp)), .up)
    }

    func testLegacyKeyRepeatAndUnrelatedInputAreIgnored() {
        var matcher = HotkeyMatcher(keyCode: 2, flags: [.control, .alternate])

        XCTAssertNil(
            matcher.handle(
                HotkeyEvent(keyCode: 2, type: .keyDown, flags: [.control, .alternate], isAutorepeat: true)
            )
        )
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 3, type: .keyDown, flags: [.control, .alternate])))
        XCTAssertEqual(
            matcher.handle(HotkeyEvent(keyCode: 2, type: .keyDown, flags: [.control, .alternate])),
            .down
        )
        XCTAssertNil(
            matcher.handle(
                HotkeyEvent(keyCode: 2, type: .keyDown, flags: [.control, .alternate], isAutorepeat: true)
            )
        )
        XCTAssertEqual(matcher.handle(HotkeyEvent(keyCode: 2, type: .keyUp, flags: [.control])), .up)
    }

    func testStandaloneOptionUsesModifierStateTransitions() {
        var matcher = HotkeyMatcher(keyCode: HotkeyMatcher.standaloneOptionKeyCode, flags: [])

        XCTAssertEqual(
            matcher.handle(
                HotkeyEvent(
                    keyCode: HotkeyMatcher.standaloneOptionKeyCode,
                    type: .flagsChanged,
                    flags: [.alternate]
                )
            ),
            .down
        )
        XCTAssertNil(
            matcher.handle(
                HotkeyEvent(
                    keyCode: HotkeyMatcher.standaloneOptionKeyCode,
                    type: .flagsChanged,
                    flags: [.alternate]
                )
            )
        )
        XCTAssertNil(
            matcher.handle(
                HotkeyEvent(keyCode: 55, type: .flagsChanged, flags: [.alternate, .command])
            )
        )
        XCTAssertNil(
            matcher.handle(HotkeyEvent(keyCode: 55, type: .flagsChanged, flags: [.alternate]))
        )
        XCTAssertEqual(
            matcher.handle(HotkeyEvent(keyCode: 61, type: .flagsChanged, flags: [])),
            .up
        )
    }

    func testStandaloneOptionAcceptsEitherPhysicalOptionKey() {
        var matcher = HotkeyMatcher(keyCode: HotkeyMatcher.standaloneOptionKeyCode, flags: [])

        XCTAssertEqual(
            matcher.handle(HotkeyEvent(keyCode: 61, type: .flagsChanged, flags: [.alternate])),
            .down
        )
        XCTAssertEqual(matcher.handle(HotkeyEvent(keyCode: 61, type: .flagsChanged)), .up)
    }

    func testFunctionKeysEmitOnePairAndIgnoreRepeatsAndModifiers() {
        let functionKeyCodes: [Int64] = [
            122, 120, 99, 118, 96, 97, 98, 100, 101, 109,
            103, 111, 105, 107, 113, 106, 64, 79, 80
        ]

        for keyCode in functionKeyCodes {
            var matcher = HotkeyMatcher(keyCode: keyCode, flags: [])

            XCTAssertNil(
                matcher.handle(HotkeyEvent(keyCode: keyCode, type: .flagsChanged)),
                "function-key flagsChanged events should be ignored for F\(keyCode)"
            )
            XCTAssertNil(
                matcher.handle(HotkeyEvent(keyCode: keyCode, type: .keyUp)),
                "a release before a press should be ignored for F\(keyCode)"
            )
            XCTAssertNil(
                matcher.handle(HotkeyEvent(keyCode: 2, type: .keyDown)),
                "unrelated input should be ignored for F\(keyCode)"
            )
            XCTAssertNil(
                matcher.handle(HotkeyEvent(keyCode: keyCode, type: .keyDown, flags: [.command])),
                "additional modifiers should be ignored for F\(keyCode)"
            )
            XCTAssertEqual(
                matcher.handle(HotkeyEvent(keyCode: keyCode, type: .keyDown)),
                .down,
                "F\(keyCode) should start one pair"
            )
            XCTAssertNil(
                matcher.handle(HotkeyEvent(keyCode: keyCode, type: .keyDown, isAutorepeat: true)),
                "autorepeat should not emit another down for F\(keyCode)"
            )
            XCTAssertEqual(
                matcher.handle(HotkeyEvent(keyCode: keyCode, type: .keyUp)),
                .up,
                "F\(keyCode) should end its pair"
            )
        }
    }

    func testStandaloneCommandAcceptsEitherSideAndSurvivesOtherModifierChanges() {
        var matcher = HotkeyMatcher(keyCode: HotkeyMatcher.standaloneCommandKeyCode, flags: [])

        XCTAssertEqual(
            matcher.handle(HotkeyEvent(keyCode: 55, type: .flagsChanged, flags: [.command])),
            .down
        )
        XCTAssertNil(
            matcher.handle(HotkeyEvent(keyCode: 56, type: .flagsChanged, flags: [.command, .shift]))
        )
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 56, type: .flagsChanged, flags: [.command])))
        XCTAssertEqual(matcher.handle(HotkeyEvent(keyCode: 54, type: .flagsChanged)), .up)
    }

    func testStandaloneControlAcceptsEitherPhysicalControlKey() {
        var matcher = HotkeyMatcher(keyCode: HotkeyMatcher.standaloneControlKeyCode, flags: [])

        XCTAssertEqual(
            matcher.handle(HotkeyEvent(keyCode: 62, type: .flagsChanged, flags: [.control])),
            .down
        )
        XCTAssertEqual(matcher.handle(HotkeyEvent(keyCode: 62, type: .flagsChanged)), .up)
    }

    func testStandaloneFnUsesTheSecondaryFunctionFlag() {
        var matcher = HotkeyMatcher(keyCode: HotkeyMatcher.standaloneFnKeyCode, flags: [])

        XCTAssertEqual(
            matcher.handle(
                HotkeyEvent(
                    keyCode: HotkeyMatcher.standaloneFnKeyCode,
                    type: .flagsChanged,
                    flags: [.secondaryFunction]
                )
            ),
            .down
        )
        XCTAssertNil(
            matcher.handle(
                HotkeyEvent(
                    keyCode: HotkeyMatcher.standaloneFnKeyCode,
                    type: .flagsChanged,
                    flags: [.secondaryFunction]
                )
            )
        )
        XCTAssertEqual(
            matcher.handle(HotkeyEvent(keyCode: HotkeyMatcher.standaloneFnKeyCode, type: .flagsChanged)),
            .up
        )
    }

    func testStandaloneCapsLockRequiresAUsableKeyPair() {
        var matcher = HotkeyMatcher(keyCode: HotkeyMatcher.standaloneCapsLockKeyCode, flags: [])

        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 57, type: .keyUp)))
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 57, type: .keyDown, flags: [.shift])))
        XCTAssertEqual(matcher.handle(HotkeyEvent(keyCode: 57, type: .keyDown)), .down)
        XCTAssertNil(
            matcher.handle(HotkeyEvent(keyCode: 57, type: .keyDown, isAutorepeat: true))
        )
        XCTAssertEqual(matcher.handle(HotkeyEvent(keyCode: 57, type: .keyUp, flags: [.shift])), .up)
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 57, type: .keyUp)))
    }

    func testStandaloneOptionRejectsAnAdditionalModifierOnPress() {
        var matcher = HotkeyMatcher(keyCode: HotkeyMatcher.standaloneOptionKeyCode, flags: [])

        XCTAssertNil(
            matcher.handle(
                HotkeyEvent(
                    keyCode: HotkeyMatcher.standaloneOptionKeyCode,
                    type: .flagsChanged,
                    flags: [.command, .alternate]
                )
            )
        )
        XCTAssertNil(
            matcher.handle(HotkeyEvent(keyCode: HotkeyMatcher.standaloneOptionKeyCode, type: .flagsChanged, flags: [.command]))
        )
    }

    func testMalformedEmptyModifierIdentityNeverMatches() {
        var matcher = HotkeyMatcher(keyCode: 2, flags: [])

        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 2, type: .keyDown)))
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 2, type: .keyUp)))
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 2, type: .flagsChanged, flags: [.alternate])))
    }
}
