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
//   -> {"id":"3","cmd":"transcribeFile","path":"/abs/path.m4a","lang":"auto"}
//   <- {"id":"3","status":"ok","text":"...","ms":48213}
//   <- {"id":"3","status":"error","reason":"..."}
//   -> {"id":"4","cmd":"transcribeWithVocabulary","wav":"<base64 WAV>","lang":"en"}
//   <- {"id":"4","status":"ok","text":"...","ms":612,"vocabularyApplied":true,"vocabularyReplacements":1}
//   <- {"id":"4","status":"error","reason":"..."}
//   startup: {"event":"ready"} once the model is loaded, or
//            {"event":"error","message":"..."} then exit(1) if it can't load.
//
// #253: "transcribeFile" is the drop-a-file path - unlike "transcribe" it
// reads straight from disk (no base64 round-trip; the file is already
// there and could be long) and hands the URL to AVAudioFile-backed
// decoding, which resamples whatever format AVFoundation can open and
// auto-chunks past ASRConfig.default's 30s streamingThreshold. No ffmpeg,
// no manual chunking - FluidAudio already does both for the file-URL
// overload of transcribe(). Runs on the same resident model as live
// dictation, so a long file transcription can delay a concurrent
// push-to-talk until it finishes - accepted for now, see #253's PR.
//
// #322: "transcribeWithVocabulary" is a SPIKE, not a shipped feature - not
// called from any Electron code path. It exists to be compiled and run on a
// real Mac to check the one thing source-reading couldn't answer: the ANE
// latency cost of FluidAudio's CTC keyword-spotting rescore pass, layered
// on top of the exact same asr.transcribe() call "transcribe" already
// makes (see the #322 issue comment for why this composes as a side-channel
// pass rather than swapping AsrManager for a different class). The
// vocabulary is hardcoded - a real vocabulary source is a separate,
// unresolved product question, not this spike's job.

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

// Shared by "transcribe" and "transcribeFile" (#253).
func languageHint(_ object: [String: Any]) -> Language? {
    guard let code = object["lang"] as? String, code != "auto" else { return nil }
    return Language(rawValue: code)
}

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

        let language = languageHint(object)

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

    case "transcribeWithVocabulary":
        // #322 spike - see the file header comment. Same request shape as
        // "transcribe"; the vocabulary itself is hardcoded, not read from
        // the request.
        guard let base64 = object["wav"] as? String,
              let wav = Data(base64Encoded: base64),
              wav.count > 44
        else {
            emit([
                "id": id, "status": "error",
                "reason": "transcribeWithVocabulary needs a base64 \"wav\" field carrying a WAV payload",
            ])
            continue
        }

        let language = languageHint(object)
        let scratch = FileManager.default.temporaryDirectory
            .appendingPathComponent("openstream-vocab-spike-\(id).wav")
        do {
            try wav.write(to: scratch)
        } catch {
            emit(["id": id, "status": "error", "reason": "could not stage the audio: \(error)"])
            continue
        }

        let startedAt = Date()
        let outcome = blocking { () -> Result<(text: String, applied: Bool, replacements: Int), Error> in
            do {
                var state = TdtDecoderState.make(decoderLayers: await asr.decoderLayerCount)
                // Exactly the "transcribe" call, unmodified - the boosting
                // pass below is a side-channel over its output, not a
                // different transcription class.
                let result = try await asr.transcribe(scratch, decoderState: &state, language: language)

                // A representative sample per #321 (proper nouns) and #320
                // (spoken commands) - not a real vocabulary source. Deciding
                // where that comes from (the existing term-corrections list
                // is one candidate) is separate, unresolved product work.
                let vocabularyText = """
                    OpenStream
                    Parakeet
                    FluidAudio
                    new paragraph: new line
                    bullet point: bullet points
                    """
                let vocabPath = FileManager.default.temporaryDirectory
                    .appendingPathComponent("openstream-vocab-list-\(id).txt")
                try vocabularyText.write(to: vocabPath, atomically: true, encoding: .utf8)
                defer { try? FileManager.default.removeItem(at: vocabPath) }

                // First run downloads the ~97.5MB CTC keyword-spotter model
                // bundle from Hugging Face (FluidInference/parakeet-ctc-110m
                // -coreml) - separate from, and on top of, the Parakeet TDT
                // bundle loaded at startup above.
                let (vocabulary, ctcModels) = try await CustomVocabularyContext.loadWithCtcTokens(from: vocabPath.path)
                let blankId = ctcModels.vocabulary.count
                let spotter = CtcKeywordSpotter(models: ctcModels, blankId: blankId)
                let samples = try AudioConverter().resampleAudioFile(scratch)
                let spotResult = try await spotter.spotKeywordsWithLogProbs(
                    audioSamples: samples, customVocabulary: vocabulary, minScore: nil)

                guard let tokenTimings = result.tokenTimings, !tokenTimings.isEmpty, !spotResult.logProbs.isEmpty else {
                    return .success((result.text, false, 0))
                }

                let rescorer = try await VocabularyRescorer.create(
                    spotter: spotter, vocabulary: vocabulary,
                    ctcModelDirectory: CtcModels.defaultCacheDirectory(for: ctcModels.variant))
                let rescoreOutput = rescorer.ctcTokenRescore(
                    transcript: result.text, tokenTimings: tokenTimings,
                    logProbs: spotResult.logProbs, frameDuration: spotResult.frameDuration)

                if rescoreOutput.wasModified {
                    return .success((rescoreOutput.text, true, rescoreOutput.replacements.count))
                }
                return .success((result.text, false, 0))
            } catch {
                return .failure(error)
            }
        }
        try? FileManager.default.removeItem(at: scratch)

        switch outcome {
        case .success(let outcome):
            let ms = Int(Date().timeIntervalSince(startedAt) * 1000)
            emit([
                "id": id, "status": "ok", "text": outcome.text, "ms": ms,
                "vocabularyApplied": outcome.applied, "vocabularyReplacements": outcome.replacements,
            ])
            elog(
                "transcribed with vocabulary boosting in \(ms)ms (applied=\(outcome.applied), replacements=\(outcome.replacements))"
            )
        case .failure(let error):
            emit(["id": id, "status": "error", "reason": "\(error)"])
            elog("vocabulary-boosted transcription failed: \(error)")
        }

    case "transcribeFile":
        // #253: dropped-file transcription. No base64, no temp copy, no
        // manual chunking - the file is already on disk, and the file-URL
        // overload of transcribe() resamples via AVAudioFile (whatever
        // format AVFoundation can open: WAV, AIFF, CAF, M4A/AAC, MP3, …)
        // and auto-chunks past the 30s streaming threshold on its own.
        guard let path = object["path"] as? String, !path.isEmpty else {
            emit(["id": id, "status": "error", "reason": "transcribeFile needs a non-empty \"path\" field"])
            continue
        }
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: url.path) else {
            emit(["id": id, "status": "error", "reason": "no file at \(path)"])
            continue
        }

        let language = languageHint(object)
        let startedAt = Date()
        let outcome = blocking { () -> Result<String, Error> in
            do {
                var state = TdtDecoderState.make(decoderLayers: await asr.decoderLayerCount)
                let result = try await asr.transcribe(url, decoderState: &state, language: language)
                return .success(result.text)
            } catch {
                return .failure(error)
            }
        }

        switch outcome {
        case .success(let text):
            let ms = Int(Date().timeIntervalSince(startedAt) * 1000)
            emit(["id": id, "status": "ok", "text": text, "ms": ms])
            elog("transcribed file \(url.lastPathComponent) in \(ms)ms")
        case .failure(let error):
            emit(["id": id, "status": "error", "reason": "\(error)"])
            elog("file transcription failed for \(url.lastPathComponent): \(error)")
        }

    default:
        emit(["id": id, "status": "error", "reason": "unknown command \"\(command)\""])
    }
}
