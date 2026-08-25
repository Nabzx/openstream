// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "accessibility-helper",
    platforms: [.macOS(.v11)],
    targets: [
        .target(
            name: "AccessibilityInjection",
            path: "Sources/AccessibilityInjection"
        ),
        .executableTarget(
            name: "accessibility-helper",
            dependencies: ["AccessibilityInjection"],
            path: "Sources/accessibility-helper"
        ),
        .testTarget(
            name: "AccessibilityInjectionTests",
            dependencies: ["AccessibilityInjection"],
            path: "Tests/AccessibilityInjectionTests"
        )
    ]
)
