// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "accessibility-helper",
    platforms: [.macOS(.v11)],
    targets: [
        .executableTarget(
            name: "accessibility-helper",
            path: "Sources/accessibility-helper"
        )
    ]
)
