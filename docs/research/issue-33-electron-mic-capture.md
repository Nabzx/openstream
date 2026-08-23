# Issue #33 - Does audio capture need a native helper, or is Electron enough?

Research note for [Nabzx/openstream#33](https://github.com/Nabzx/openstream/issues/33).
Written 2026-08-22. Primary sources only: W3C specs, Chromium/Blink source, whisper.cpp
source, Electron API docs, Apple developer documentation.

## The question

`README.md` assigns "mic access" to the macOS native helpers, alongside Accessibility
context detection and text injection. Issue #26 settled a two-helper topology (a hotkey
helper holding Input Monitoring, an accessibility helper holding Accessibility) and left
mic access with no home. #33 asks which of three things is true:

1. The README is wrong - Electron captures audio itself, no native code.
2. It works but needs deliberate structure (a hidden renderer).
3. It genuinely needs a third native helper holding a third TCC grant.

Sub-questions: (a) can a menu bar app with no visible window capture the mic, and what does
that require structurally; (b) can it produce raw PCM at whisper.cpp's sample rate with no
native step; (c) latency and reliability under constant push-to-talk start/stop; (d) where
the Microphone TCC grant sits relative to the two grants already in play.

## Summary of the answer

**Outcome 2, with a caveat.** Electron can capture the microphone with no native code, and
it can produce exactly the buffer format whisper.cpp wants (mono `float` PCM at 16 kHz) with
no native step and no resampling code of our own. But it does require a renderer document to
live in, because `navigator.mediaDevices` is a `Window`-only interface - Electron's
`utilityProcess` and the main process cannot call it. A permanently hidden `BrowserWindow`
is the structural consequence, and the specs and Chromium source say hiding it is safe:
`getUserMedia` gates on the document being *fully active*, not *visible*, and the Chromium
autoplay gate that would otherwise block an `AudioContext` in a gesture-less window has an
explicit carve-out for documents that are capturing user media.

The Microphone TCC grant therefore sits on the **app bundle itself**, not on a helper. That
is a third grant in play (Microphone, alongside Input Monitoring on the hotkey helper and
Accessibility on the accessibility helper) but it is not a third *process*. The `#26`
topology does not grow.

The README line needs correcting either way, as the issue predicted.

The caveat, and the one thing I could not settle from a primary source, is capture *start*
latency on macOS under repeated push-to-talk. See "Not verified" below.

---

## What the sources establish

### 1. whisper.cpp wants mono `float` PCM at 16 kHz

`WHISPER_SAMPLE_RATE` is defined as `16000` in the public header, and the transcription
entry point takes a `const float *` sample buffer:

- [`include/whisper.h` line 33](https://github.com/ggml-org/whisper.cpp/blob/master/include/whisper.h#L33): `#define WHISPER_SAMPLE_RATE 16000`
- [`include/whisper.h`, `whisper_full`](https://github.com/ggml-org/whisper.cpp/blob/master/include/whisper.h#L603): `int whisper_full(struct whisper_context * ctx, struct whisper_full_params params, const float * samples, int n_samples)`, documented as "Run the entire model: PCM -> log mel spectrogram -> encoder -> decoder -> text".
- [`include/whisper.h`, `whisper_pcm_to_mel`](https://github.com/ggml-org/whisper.cpp/blob/master/include/whisper.h#L276) is documented as "Convert RAW PCM audio to log mel spectrogram" and takes the same `const float *`.

The reference realtime example confirms the rate is not negotiable: `examples/stream`
initialises its capture device with `WHISPER_SAMPLE_RATE` directly
([`examples/stream/stream.cpp` line 148](https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream/stream.cpp#L148): `audio.init(params.capture_id, WHISPER_SAMPLE_RATE)`).

That example's capture layer is SDL2
([`examples/common-sdl.h`](https://github.com/ggml-org/whisper.cpp/blob/master/examples/common-sdl.h) declares `class audio_async` over `SDL_AudioDeviceID`), which is what a "native
capture" path would look like. It is a reference implementation, not a requirement of the
library - the library's contract is only the `float *` buffer.

The project also ships a browser build that captures through `getUserMedia` and feeds the
same library, which is direct upstream evidence that a web-stack capture path is a supported
shape: [`examples/stream.wasm/index-tmpl.html`](https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream.wasm/index-tmpl.html) sets `const kSampleRate = 16000`, constructs
`new AudioContext({ sampleRate: kSampleRate, ... })`, and calls
`navigator.mediaDevices.getUserMedia({audio: true, video: false})`.

Note for our own implementation: that example then routes audio through `MediaRecorder` to
Opus and back through `decodeAudioData` + `OfflineAudioContext`. That is a lossy,
high-latency round trip and we should not copy it - see the recommendation below.

### 2. `navigator.mediaDevices` exists only on `Window`

The Media Capture and Streams spec defines the interface as
`partial interface Navigator { [SameObject, SecureContext] readonly attribute MediaDevices mediaDevices; }`
and `MediaDevices` itself as `[Exposed=Window, SecureContext]`
([mediacapture-main, MediaDevices interface](https://w3c.github.io/mediacapture-main/#mediadevices)).

Electron's `utilityProcess` "creates a child process with Node.js and Message ports enabled"
([Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)) -
a Node runtime, not a Blink renderer, so it has no `Window` and no `navigator.mediaDevices`.
The main process is likewise Node.

**Consequence:** capture must live in a renderer. There is no Electron-native process type
that can do it without one.

### 3. A hidden renderer is fine - the gate is "fully active", not "visible"

The `getUserMedia()` algorithm's document precondition is exactly one check:

> Let document be the relevant global object's associated `Document`. If document is NOT
> fully active, return a promise rejected with a `DOMException` object whose `name`
> attribute has the value `"InvalidStateError"`.

([mediacapture-main, `getUserMedia()`](https://w3c.github.io/mediacapture-main/#dom-mediadevices-getusermedia))

The spec does define a visibility-based check - "To perform an *is in view check* [...] If
mediaDevices's relevant global object's associated `Document` is fully active and its
visibility state is `"visible"`, return `true`" - but that algorithm is defined for use by
device-information exposure and is not invoked anywhere in the `getUserMedia()` algorithm
itself (grepping the editor's draft, "is in view check" appears once, at its own definition).
So document visibility does not gate capture.

"Fully active" is a document/navigable property, not a window-visibility property. A
`BrowserWindow` created with `show: false` still has a loaded, fully active document; the
`show` option only controls whether the OS window is displayed
([Electron BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window)).

The permissions-policy default allowlist for the `"microphone"` feature is `"self"`
([mediacapture-main, Permissions Policy Integration](https://w3c.github.io/mediacapture-main/#permissions-policy-integration)),
so a top-level document in our own window is allowed by default with no policy work.

**`file://` is a secure context in Chromium**, which matters because Electron apps commonly
load the renderer from disk. Chromium implements step 6 of the secure-contexts algorithm
verbatim:

```cpp
// 6. If origin's scheme component is file, return "Potentially Trustworthy".
if (origin.scheme() == url::kFileScheme) {
  return true;
}
```

([`net/base/is_potentially_trustworthy.cc`](https://chromium.googlesource.com/chromium/src/+/main/net/base/is_potentially_trustworthy.cc), in `IsOriginPotentiallyTrustworthy`)

So the `[SecureContext]` requirement on `MediaDevices` is satisfied by a `file://` renderer.

### 4. Background throttling does not stop capture, and the autoplay gate has a gUM carve-out

Two things could plausibly break a hidden capture renderer. Neither does.

**Background throttling.** Electron's `backgroundThrottling` web preference is documented as
"Whether to throttle animations and timers when the page becomes background. This also
affects the Page Visibility API"
([Electron BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window)).
Timers and animation are not the audio path. Audio worklet processing runs on a dedicated
real-time thread, not on the main thread's timer queue - Blink creates it with
`ThreadCreationParams(ThreadType::kRealtimeAudioWorkletThread)` and
`params.base_thread_type = base::ThreadType::kRealtimeAudio`
([`third_party/blink/renderer/modules/webaudio/realtime_audio_worklet_thread.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/realtime_audio_worklet_thread.cc), lines 58-71).
Setting `backgroundThrottling: false` is still worth doing so that JS on the main thread
(IPC forwarding, VAD bookkeeping) is not throttled, but the capture itself does not depend
on it.

**Chromium's autoplay policy.** The Web Audio spec permits a UA to refuse to start an
`AudioContext`: "An `AudioContext` is said to be *allowed to start* if the user agent allows
the context state to transition from `"suspended"` to `"running"`. A user agent may disallow
this initial transition, and to allow it only when the `AudioContext`'s relevant global
object has sticky activation"
([Web Audio API 1.1, AudioContext](https://www.w3.org/TR/webaudio-1.1/#AudioContext)).
A permanently hidden window that the user never clicks has no user activation, so this is a
real hazard.

Chromium resolves it in our favour. `AudioContext::AreAutoplayRequirementsFulfilled()`
delegates to `AutoplayPolicy::IsDocumentAllowedToPlay()` under the desktop policy
([`audio_context.cc` lines 1388-1400](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/audio_context.cc)), and that function's second
check is:

```cpp
bool AutoplayPolicy::IsDocumentAllowedToPlay(const Document& document) {
  if (DocumentHasForceAllowFlag(document))
    return true;

  if (DocumentIsCapturingUserMedia(document))
    return true;
  ...
```

([`third_party/blink/renderer/core/html/media/autoplay_policy.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/html/media/autoplay_policy.cc), lines 82-88; `DocumentIsCapturingUserMedia` returns `document.GetFrame()->IsCapturingMedia()` at line 153)

A document that is actively capturing the microphone is allowed to start its `AudioContext`
regardless of user activation. Ordering matters: resolve `getUserMedia()` first, then
construct or resume the `AudioContext`.

### 5. The 16 kHz conversion is free - the platform does it

Two spec facts combine to remove any resampling code from our side.

`new AudioContext({ sampleRate: 16000 })` is legal. The Web Audio spec allows a requested
sample rate, and Chromium validates it against
`IsValidAudioBufferSampleRate`, which is `sample_rate >= 3000 && sample_rate <= 768000`
([`third_party/blink/renderer/platform/audio/audio_utilities.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/platform/audio/audio_utilities.cc), lines 116-128), throwing `NotSupportedError` otherwise
([`audio_context.cc` lines 502-512](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/audio_context.cc)). 16000 is comfortably in range.

The mic's native rate (typically 44.1 or 48 kHz) is then resampled to the context rate by
the UA, normatively:

> If the sample rate of the `MediaStreamTrack` differs from the sample rate of the
> associated `AudioContext`, then the output of the `MediaStreamTrack` is resampled to match
> the context's sample rate.

([Web Audio API 1.1, MediaStreamAudioSourceNode](https://www.w3.org/TR/webaudio-1.1/#MediaStreamAudioSourceNode))

Inside an `AudioWorkletProcessor`, `process(inputs, outputs, parameters)` receives
per-channel `Float32Array`s of one render quantum, which is 128 frames by default
("`"default"` - The AudioContext's render quantum size is the default value of 128 frames",
[Web Audio API 1.1, AudioContextRenderSizeCategory](https://www.w3.org/TR/webaudio-1.1/#enumdef-audiocontextrendersizecategory)).

`Float32Array` of mono samples at 16 kHz is bit-for-bit what `whisper_full` takes as
`const float * samples`. No conversion, no native step.

Mono is requestable: `channelCount` is a constrainable audio property, "The number of
independent channels of sound that the audio data contains"
([mediacapture-main, channelCount](https://w3c.github.io/mediacapture-main/#dfn-channelcount)),
as are `echoCancellation`, `autoGainControl` and `noiseSuppression`
([mediacapture-main, constrainable properties](https://w3c.github.io/mediacapture-main/#dfn-echocancellation)) - these belong in the
`getUserMedia` constraints, not in `AudioContextOptions` (the whisper.cpp WASM example puts
them in `AudioContextOptions`, where they are ignored).

**Do not use `MediaStreamTrackProcessor` for this.** It looks like the natural raw-frame API,
but the spec states there is "no WG consensus on whether or not creating a
`MediaStreamTrackProcessor` from a `MediaStreamTrack` of kind `'audio'` should be supported",
and its IDL is `[Exposed=DedicatedWorker]` only
([mediacapture-transform](https://w3c.github.io/mediacapture-transform/)). `AudioWorklet` is
the standardised path.

### 6. Where the Microphone grant sits

`NSMicrophoneUsageDescription` is "A message that tells people why the app is requesting
access to the device's microphone [...] This key is required if your app uses APIs that
access the device's microphone", introduced on macOS 10.14
([Apple, NSMicrophoneUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription)).
It is a key in the **app bundle's** `Info.plist`.

For a hardened-runtime (notarised) build we also need the audio-input entitlement:
`com.apple.security.device.audio-input` - "A Boolean value that indicates whether the app may
record audio using the built-in microphone and access audio input using Core Audio [...]
first enable the Hardened Runtime capability [...] and then under Resource Access, select
Audio Input"
([Apple, com.apple.security.device.audio-input](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input)).
This is an entitlement on the signed app, again not on a helper.

Electron exposes the prompt from the **main** process:
`systemPreferences.askForMediaAccess('microphone')` (macOS only) returns a promise resolving
to whether access was granted, and `systemPreferences.getMediaAccessStatus('microphone')`
returns `not-determined` / `granted` / `denied` / `restricted` / `unknown`. The docs state
`NSMicrophoneUsageDescription` must be set in `Info.plist`, that consent is required from
macOS 10.14 Mojave onward, and that once denied the setting can only be changed in System
Settings and the app must be restarted for a change to take effect
([Electron systemPreferences docs](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesaskformediaaccessmediatype-macos)).

Electron also has its own in-app permission layer on top of the OS one: `media` is a
permission string for both `session.setPermissionRequestHandler` and
`session.setPermissionCheckHandler`, with a `mediaType` of `video` / `audio` / `unknown` in
the request details, and the docs note that you generally need both handlers because "most
web APIs do a permission check and then make a permission request if the check is denied"
([Electron session docs](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler)).

So the grant map becomes:

| Grant | Held by | Source |
|---|---|---|
| Input Monitoring | hotkey helper | settled in #26 |
| Accessibility | accessibility helper | settled in #26 |
| **Microphone** | **the app bundle itself** | this issue |

Three grants, still two helpers.

---

## Inference and recommendation (mine, not the sources')

### Answer to the ticket: outcome 2

No third native helper. The README's "and mic access" attribution to the native helpers is
wrong and should be removed. Suggested correction to the `README.md` architecture bullet:

> **macOS native helpers**: small Swift/Objective-C binaries for Accessibility API context
> detection and text injection, plus global hotkey capture. Microphone capture is handled by
> Electron itself via `getUserMedia` in a hidden renderer; the Microphone permission is held
> by the app bundle.

### The structural choice this ticket should ratify

A single permanently hidden `BrowserWindow` dedicated to audio capture, created at app start
and never shown, with:

- `show: false`, `backgroundThrottling: false`
- context isolation on, a preload exposing a narrow start/stop/onChunk bridge
- a `MediaStream` obtained once at startup (or on first PTT) with
  `{ audio: { channelCount: 1, echoCancellation: false, autoGainControl: true, noiseSuppression: true } }`
- `new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' })`
- `MediaStreamAudioSourceNode` -> `AudioWorkletNode` -> the worklet posts `Float32Array`
  chunks to the main thread, which forwards them to whisper.cpp

Rationale: this is the only shape that satisfies the `[Exposed=Window]` constraint (fact 2)
without showing UI, and every hazard that shape raises is closed by facts 3, 4 and 5.

Two engineering cautions that follow from the same sources:

- **Order of operations.** Call `getUserMedia()` and let it resolve *before* creating or
  resuming the `AudioContext`, so the `DocumentIsCapturingUserMedia` carve-out is already
  true when the autoplay gate is evaluated (fact 4). Getting this backwards produces an
  `AudioContext` stuck in `"suspended"` in a window that can never receive a user gesture -
  a silent, confusing failure.
- **Prompt the mic permission deliberately.** Call
  `systemPreferences.askForMediaAccess('microphone')` from the main process during onboarding
  rather than letting the first `getUserMedia()` trigger the TCC dialog. This puts the prompt
  in the onboarding flow the roadmap already plans for Phase 4, alongside the Accessibility
  and Input Monitoring prompts, instead of surprising the user mid-dictation.

### On push-to-talk start/stop (question 3)

The mechanism to prefer: **acquire the `MediaStream` and `AudioContext` once and keep them
alive**, and let push-to-talk toggle only whether the worklet forwards buffers. Do not call
`getUserMedia()` per keypress.

This is inference, not a sourced claim, but the reasoning is: `getUserMedia` returns a
promise and the underlying device open on macOS goes through CoreAudio device setup, so
per-press acquisition puts an unbounded async step on the critical path of "user pressed the
key and started talking immediately". Keeping the stream open converts that to a boolean
flip on the audio thread.

The cost of keeping it open is the macOS orange microphone indicator staying lit for the
whole session, which is a genuine product decision (an always-on mic indicator on a
dictation app may alarm users or may correctly signal what the app is). If we want the
indicator off between presses, we pay the acquisition latency per press and should measure
it before committing. That measurement is the concrete follow-up this ticket should spawn.

### Where whisper.cpp receives the samples

Out of scope for #33 but worth flagging for whoever implements: whisper.cpp ships an
official Node addon ([`examples/addon.node`](https://github.com/ggml-org/whisper.cpp/tree/master/examples/addon.node)) and an HTTP server ([`examples/server`](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server)), so the `Float32Array` can go from the
renderer to the main process over IPC and then into the library without ever touching disk
or a WAV file. The README's current "run as a subprocess" plan implies a file or stdin
handoff and may be worth revisiting separately.

---

## Not verified from a primary source

- **Capture start latency on macOS.** I found no first-party number for how long
  `getUserMedia()` (or the underlying CoreAudio input device open) takes on a cold start on
  Apple Silicon. Chromium's macOS input buffer bounds are documented in source
  (`kMinAudioBufferSize = 128`, `kMaxAudioBufferSize = 4096` under `BUILDFLAG(IS_MAC)`,
  [`media/base/limits.h`](https://chromium.googlesource.com/chromium/src/+/main/media/base/limits.h)), which bounds *steady-state* buffer latency to roughly 8-256 ms at 16 kHz, but says
  nothing about *acquisition* latency. This needs measuring on the target hardware; it is the
  one input to the always-on-vs-per-press decision that no document can supply.
- **TCC grant inheritance by spawned helpers.** #26's premise-check comment asserts that TCC
  grants attach to the signed bundle rather than to each executable. I did not find a
  first-party Apple document stating this normatively, and the same caveat noted in #26
  applies here. It does not change this ticket's conclusion, because under the recommendation
  the microphone is opened by Electron's own processes inside the app bundle and no helper is
  involved.
- **Which Chromium process opens the macOS input device.** Chromium can run its audio service
  in or out of the browser process, and which one holds the CoreAudio connection on macOS
  affects nothing in this design, but I was unable to locate the current
  `IsAudioServiceOutOfProcess` decision point in the tree via the source browser. Flagged as
  unresolved rather than asserted.
- **Whether an `AudioWorkletNode` renders when not connected to the destination.** The Web
  Audio spec's AudioNode Lifetime section defines "actively processing" per node type but I
  could not extract a normative statement that a worklet with no path to
  `AudioDestinationNode` is guaranteed to be pulled. Safe implementation: connect the worklet
  to a `GainNode` with gain 0 and connect that to `context.destination`. Cheap insurance,
  untested claim.
