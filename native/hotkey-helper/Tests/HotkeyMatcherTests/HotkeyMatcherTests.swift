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
            matcher.handle(
                HotkeyEvent(keyCode: HotkeyMatcher.standaloneOptionKeyCode, type: .flagsChanged, flags: [.command])
            )
        )
    }

    func testMalformedEmptyModifierIdentityNeverMatches() {
        var matcher = HotkeyMatcher(keyCode: 2, flags: [])

        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 2, type: .keyDown)))
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 2, type: .keyUp)))
        XCTAssertNil(matcher.handle(HotkeyEvent(keyCode: 2, type: .flagsChanged, flags: [.alternate])))
    }
}
