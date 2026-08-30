import Foundation
import FluidAudio

// Transcription model server (#204). Same shape as the other Swift helpers:
// one newline-delimited JSON object per line on stdin, one reply per line on
// stdout, everything human-readable goes to stderr. The Electron side
// (electron/transcriptionHelper.js) supervises this process and waits for
// the {"event":"ready"} line before it lets a dictation through.
//
// Protocol
//   -> {"id":"1","cmd":"transcribe","wav":"<base64 WAV>","lang":"en"}
//   <- {"id":"1","status":"ok","text":"...","ms":312}
//   <- {"id":"1","status":"error","reason":"..."}
//   -> {"id":"2","cmd":"ping"}          <- {"id":"2","status":"ok"}
//   startup: {"event":"ready"} once the model is loaded, or
//            {"event":"error","message":"..."} then exit(1) if it can't load.

func elog(_ message: String) {
    FileHandle.standardError.write(Data(("transcription-helper: " + message + "\n").utf8))
}

// stdout carries protocol only - every write here is exactly one JSON line.
func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object) else {
        elog("failed to serialise a reply, dropping it")
        return
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

// Bridge the async FluidAudio API into this blocking read loop. Dictation is
// already serialised upstream (one push-to-talk at a time), so a request at a
// time is exactly right and there is no queue to manage here.
final class ResultBox<T>: @unchecked Sendable {
    var value: Result<T, Error>?
}

func blocking<T>(_ operation: @Sendable @escaping () async -> Result<T, Error>) -> Result<T, Error> {
    let box = ResultBox<T>()
    let semaphore = DispatchSemaphore(value: 0)
    Task.detached {
        box.value = await operation()
        semaphore.signal()
    }
    semaphore.wait()
    return box.value!
}

// MARK: - Model load

elog("loading Parakeet TDT 0.6b v3 (CoreML / ANE) - the first run downloads the model bundles from Hugging Face, which takes a few minutes")

let loaded = blocking { () -> Result<AsrManager, Error> in
    do {
        let models = try await AsrModels.downloadAndLoad(version: .v3)
        let manager = AsrManager(config: .default)
        try await manager.loadModels(models)
        return .success(manager)
    } catch {
        return .failure(error)
    }
}

let asr: AsrManager
switch loaded {
case .success(let manager):
    asr = manager
case .failure(let error):
    emit(["event": "error", "message": "\(error)"])
    elog("model load failed: \(error)")
    exit(1)
}

emit(["event": "ready"])
elog("ready")

// MARK: - Command loop

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    guard let data = line.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = object["id"] as? String,
          let command = object["cmd"] as? String
    else {
        elog("ignoring a malformed request line")
        continue
    }

    switch command {
    case "ping":
        emit(["id": id, "status": "ok"])

    case "transcribe":
        guard let base64 = object["wav"] as? String,
              let wav = Data(base64Encoded: base64),
              wav.count > 44
        else {
            emit(["id": id, "status": "error", "reason": "transcribe needs a base64 \"wav\" field carrying a WAV payload"])
            continue
        }

        // v3 auto-detects, but the app is English-first, so bias to English
        // unless the request overrides it. An unknown code falls back rather
        // than failing the dictation.
        let language = (object["lang"] as? String).flatMap(Language.init(rawValue:)) ?? .english

        let scratch = FileManager.default.temporaryDirectory
            .appendingPathComponent("openstream-dictation-\(id).wav")
        do {
            try wav.write(to: scratch)
        } catch {
            emit(["id": id, "status": "error", "reason": "could not stage the audio: \(error)"])
            continue
        }

        let startedAt = Date()
        let outcome = blocking { () -> Result<String, Error> in
            do {
                var state = TdtDecoderState.make(decoderLayers: await asr.decoderLayerCount)
                let result = try await asr.transcribe(scratch, decoderState: &state, language: language)
                return .success(result.text)
            } catch {
                return .failure(error)
            }
        }
        try? FileManager.default.removeItem(at: scratch)

        switch outcome {
        case .success(let text):
            let ms = Int(Date().timeIntervalSince(startedAt) * 1000)
            emit(["id": id, "status": "ok", "text": text, "ms": ms])
            elog("transcribed \(wav.count) bytes of audio in \(ms)ms")
        case .failure(let error):
            emit(["id": id, "status": "error", "reason": "\(error)"])
            elog("transcription failed: \(error)")
        }

    default:
        emit(["id": id, "status": "error", "reason": "unknown command \"\(command)\""])
    }
}
