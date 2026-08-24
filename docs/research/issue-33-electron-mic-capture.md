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

## Follow-up: gaps closed 2026-08-22

A second pass went back to primary sources for the four items this note originally listed as
unverified. Three are now closed and one remains genuinely open. Sources accessed 2026-08-22.
None of this changes the ticket's answer - outcome 2 stands, and no third native helper is
needed. One item reverses a piece of implementation advice this note previously gave.

### Closed: an unconnected `AudioWorkletNode` IS pulled - and the "insurance" was a trap

This note previously suggested connecting the worklet to a `GainNode` with gain 0 and
connecting that to `context.destination` as cheap insurance. **Do not do that.** It is
unnecessary under the spec and actively dangerous under Chromium's implementation.

The spec is normative and unambiguous once the right section is read. In the graph ordering
algorithm ([Web Audio API, § 2.6 Rendering an Audio Graph](https://webaudio.github.io/web-audio-api/#rendering-loop)),
the set of nodes to be processed is defined as:

> Let `nodes` be the set of all nodes created by this `BaseAudioContext`, and still alive.

Not "all nodes reachable from the destination". Ordering is then a topological visit over
that whole set, and the per-node step that invokes the worklet's `process` callback is
applied "For each `AudioNode`, in `ordered node list`". Reachability from
`AudioDestinationNode` is nowhere in the algorithm.

[§ 1.5.3 AudioNode Lifetime](https://webaudio.github.io/web-audio-api/#AudioNode-actively-processing)
agrees, and its rule for worklets keys on the *input* side only:

> An `AudioWorkletNode` is actively processing when its `AudioWorkletProcessor`'s
> `[[callable process]]` returns `true` and either its active source flag is `true` or any
> `AudioNode` connected to one of its inputs is actively processing.

and in the same section:

> A `MediaStreamAudioSourceNode` or a `MediaStreamTrackAudioSourceNode` are actively
> processing when the associated `MediaStreamTrack` object has a `readyState` attribute equal
> to `"live"`, a `muted` attribute equal to `false` and an `enabled` attribute equal to
> `true`.

So a worklet fed by a live capture track is actively processing regardless of what its output
is connected to.

Blink implements this, but by a specific mechanism worth knowing about, because the mechanism
is what makes the GainNode idea hazardous. Chromium's renderer pulls the graph from the
destination, and compensates with an explicit "automatic pull node" list for nodes that are
not connected to anything. `RealtimeAudioDestinationHandler::Render` runs it on every audio
callback ([`realtime_audio_destination_handler.cc:278-280`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/realtime_audio_destination_handler.cc)):

> ```cpp
> // Processes "automatic" nodes that are not connected to anything. This can
> // be done after copying because it does not affect the rendered result.
> context->GetDeferredTaskHandler().ProcessAutomaticPullNodes(number_of_frames);
> ```

`AudioWorkletNode` registers itself on that list at construction, before any `connect()` call
([`audio_worklet_node.cc:197-203`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/audio_worklet_node.cc)):

> ```cpp
> // The node should be manually added to the automatic pull node list,
> // even without a `connect()` call.
> DeferredTaskHandler::GraphAutoLocker locker(
>     context->GetDeferredTaskHandler());
> node->Handler().UpdatePullStatusIfNeeded();
> ```

And membership of that list is maintained purely by whether the node's output is connected
([`audio_worklet_handler.cc:243-261`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/audio_worklet_handler.cc)):

> ```cpp
> // If no output is connected, add the node to the automatic pull list.
> // Otherwise, remove it out of the list.
> if (!is_output_connected) {
>   Context()->GetDeferredTaskHandler().AddAutomaticPullNode(this);
> } else {
>   Context()->GetDeferredTaskHandler().RemoveAutomaticPullNode(this);
> }
> ```

Read that carefully: the moment you connect the worklet's output to anything, Blink drops it
from the automatic pull list and assumes the destination will pull it. If the thing you
connected it to does not itself reach `context.destination`, the worklet stops being pulled
entirely. The "insurance" therefore converts a case that works into a case that silently
produces no audio if the second `connect()` is ever forgotten, refactored away, or fails.

**Implementation rule:** leave the capture worklet's output unconnected. That is correct
under the spec and correct under Blink, and it is the configuration Blink explicitly
special-cases for. The only real obligation is to keep a live JavaScript reference to the
node so it stays "still alive" in the spec's sense.

### Closed: on macOS the audio service is out of process, and sandboxed

Both are on by default for macOS in
[`content/public/common/content_features.cc:157-173`](https://chromium.googlesource.com/chromium/src/+/main/content/public/common/content_features.cc):

> ```cpp
> BASE_FEATURE(kAudioServiceOutOfProcess,
> #if BUILDFLAG(IS_WIN) || BUILDFLAG(IS_MAC) || BUILDFLAG(IS_LINUX)
>              base::FEATURE_ENABLED_BY_DEFAULT
> #else
>              base::FEATURE_DISABLED_BY_DEFAULT
> #endif
> );
>
> // Enables the audio-service sandbox. This feature has an effect only when the
> // kAudioServiceOutOfProcess feature is enabled.
> BASE_FEATURE(kAudioServiceSandbox,
> #if BUILDFLAG(IS_WIN) || BUILDFLAG(IS_MAC) || BUILDFLAG(IS_FUCHSIA)
>              base::FEATURE_ENABLED_BY_DEFAULT
> #else
>              base::FEATURE_DISABLED_BY_DEFAULT
> #endif
> );
> ```

So the CoreAudio input device is opened by a separate, sandboxed Audio Service process, not
by the renderer that called `getUserMedia()` and not by the browser process. As previously
suspected this changes nothing in the design, but it is worth knowing for two practical
reasons: the process that appears in Activity Monitor holding the mic is an Electron Helper
(Audio) process rather than the main app, and any future attempt to reason about the mic from
the main process must not assume the main process owns the device.

For the record, the concrete input stream implementation reached on macOS is
`AUAudioInputStream`, constructed in `AudioManagerMac::MakeLowLatencyInputStream`
([`media/audio/mac/audio_manager_mac.cc:944-976`](https://chromium.googlesource.com/chromium/src/+/main/media/audio/mac/audio_manager_mac.cc)).
Note that the file this note's earlier draft looked for,
`media/audio/mac/audio_low_latency_input_mac.cc`, no longer exists - the implementation now
lives at [`media/audio/apple/audio_low_latency_input.cc`](https://chromium.googlesource.com/chromium/src/+/main/media/audio/apple/audio_low_latency_input.cc),
shared with iOS.

### Partly closed: TCC, entitlements, and where the grant attaches

Apple's own documentation is explicit about three things and silent on the fourth.

Explicit, from [Requesting authorization to capture and save media](https://developer.apple.com/documentation/avfoundation/requesting-authorization-to-capture-and-save-media):

> In iOS and macOS 10.14 and later, the user must explicitly grant permission for each app to
> access the camera and microphone.

> If your app uses device microphones, include the key in your app's `Info.plist` file.

> Your app needs to contain the appropriate key in its `Info.plist` file, and the appropriate
> entitlement enabled in macOS, before it requests authorization or attempts to use a capture
> device. Otherwise, the system terminates your app.

That last sentence is a hard failure mode, not a warning: a missing
`NSMicrophoneUsageDescription` or a missing entitlement terminates the process rather than
returning an error. The macOS entitlement required is
[`com.apple.security.device.audio-input`](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input),
described as:

> A Boolean value that indicates whether the app may record audio using the built-in
> microphone and access audio input using Core Audio. To add this entitlement to your app,
> first enable the Hardened Runtime capability in Xcode, and then under Resource Access,
> select Audio Input.

Given that Chromium opens the device from a sandboxed Audio Service helper (above), this
entitlement has to be present on the helper that actually touches Core Audio, not only on the
top-level app. Electron's standard packaging handles this, but it is the thing to check first
if capture dies on a signed build while working in development.

Still silent: I did not find a first-party Apple document stating normatively that a TCC
*consent record* attaches to the signed app bundle rather than to each executable within it.
The nearest primary signal points mildly the other way in wording - Apple defines
[Entitlements](https://developer.apple.com/documentation/bundleresources/entitlements) as
"Key-value pairs that grant an **executable** permission to use a service or technology"
(emphasis mine). But entitlements are not TCC grants, and this does not settle the question.

**My inference, not the sources'**: this remains unresolved and #26's premise-check comment
should still be treated as unverified. It continues not to matter for #33, because under the
recommendation nothing outside the Electron app bundle ever opens the microphone.

### Still open: cold-start capture latency

No first-party number exists, and I now believe none will - Apple does not document Core
Audio device acquisition latency, and Chromium does not instrument it as a duration. This has
to be measured on target hardware, exactly as the note already said.

What the second pass *did* find is a documented worst case that matters more for this product
than the average case. Chromium deliberately defers starting an input stream around system
suspend and resume ([`media/audio/mac/audio_manager_mac.h:141-153`](https://chromium.googlesource.com/chromium/src/+/main/media/audio/mac/audio_manager_mac.h)):

> ```cpp
> // OSX has issues with starting streams as the system goes into suspend and
> // immediately after it wakes up from resume.  See http://crbug.com/160920.
> // As a workaround we delay Start() when it occurs after suspend and for a
> // small amount of time after resume.
> //
> // Streams should consult ShouldDeferStreamStart() and if true check the value
> // again after |kStartDelayInSecsForPowerEvents| has elapsed. If false, the
> // stream may be started immediately.
> //
> // As of Nov 2025, this is still helpful, see https://crbug.com/447640763.
> enum { kStartDelayInSecsForPowerEvents = 5 };
> ```

The deferral is applied in `AUAudioInputStream::Start`, which posts the real start behind a
five-second delayed task and returns immediately, logging "Start of input audio is deferred"
([`media/audio/apple/audio_low_latency_input.cc:742-756`](https://chromium.googlesource.com/chromium/src/+/main/media/audio/apple/audio_low_latency_input.cc)).
Chromium separately allows five seconds before it even considers a start to have failed
(`kInputCallbackStartTimeout = base::Seconds(5)`, same file).

**My inference, not the sources'**: this is a direct argument for the always-on stream the
note already recommends. A dictation app is used constantly right after opening the lid, and
that is precisely the window in which a per-press `Start()` can be silently deferred by up to
five seconds. A stream acquired once and held is started once, most likely well before the
user's first push-to-talk press, and a deferral that lands there is invisible. A stream
started per keypress puts a documented five-second worst case directly on the user's critical
path, on the single most common cold-start path the app has. Whoever measures acquisition
latency should measure it immediately after a lid-open, not on a warm idle machine, or the
measurement will look far better than reality.

## Still not verified from a primary source

- **Cold-start capture acquisition latency on macOS.** See above. Not documented by Apple or
  Chromium; must be measured on target hardware, and specifically measured shortly after
  resume from sleep. This is the one input to the always-on-vs-per-press decision that no
  document can supply - though the five-second power-event deferral above is a strong
  argument for always-on without needing the measurement.
- **TCC grant inheritance by spawned helpers.** See above. No normative first-party statement
  found. Does not affect this ticket's conclusion.
