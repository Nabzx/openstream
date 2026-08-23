// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "hotkey-helper",
    platforms: [.macOS(.v11)],
    targets: [
        .executableTarget(
            name: "hotkey-helper",
            path: "Sources/hotkey-helper"
        )
    ]
)
