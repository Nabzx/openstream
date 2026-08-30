// swift-tools-version:6.0
import PackageDescription

// The transcription model server (#204). Replaces the pinned whisper.cpp
// `whisper-server` binary: Parakeet TDT 0.6b v3 runs as CoreML on the Apple
// Neural Engine via FluidAudio, so there is no C++ build and no ggml weight
// to fetch - FluidAudio pulls the CoreML bundles from Hugging Face on first
// run. FluidAudio needs Swift 6 and macOS 14, which is why this package sits
// on a newer toolchain than the other two helpers.
let package = Package(
    name: "transcription-helper",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.15.6"),
    ],
    targets: [
        .executableTarget(
            name: "transcription-helper",
            dependencies: [
                .product(name: "FluidAudio", package: "FluidAudio"),
            ],
            path: "Sources/transcription-helper"
        ),
    ]
)
