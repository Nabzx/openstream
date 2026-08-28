// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "hotkey-helper",
    platforms: [.macOS(.v11)],
    targets: [
        .target(
            name: "HotkeyMatcher",
            path: "Sources/HotkeyMatcher"
        ),
        .executableTarget(
            name: "hotkey-helper",
            dependencies: ["HotkeyMatcher"],
            path: "Sources/hotkey-helper"
        ),
        .testTarget(
            name: "HotkeyMatcherTests",
            dependencies: ["HotkeyMatcher"],
            path: "Tests/HotkeyMatcherTests"
        )
    ]
)
