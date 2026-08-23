// Runs in the hidden capture window's renderer. Captures mono 16kHz PCM
// while recording is toggled on, and hands it back to main on stop.
//
// Per issue #33: acquire the MediaStream and AudioContext once and keep
// them alive, then let start/stop toggle only whether samples are kept -
// not per-press getUserMedia calls, which would put an unbounded async
// step on the critical path of "user pressed the key and started talking".
let audioContext = null;
let processorNode = null;
let isRecording = false;
let chunks = [];

async function ensureCapture() {
  if (audioContext) return;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);

  // ScriptProcessorNode only fires onaudioprocess while connected to a
  // destination. Route through a silent gain node rather than the real
  // output so capture keeps running without the user hearing themselves.
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  processorNode.onaudioprocess = (event) => {
    if (!isRecording) return;
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;

  source.connect(processorNode);
  processorNode.connect(silentGain);
  silentGain.connect(audioContext.destination);
}

function floatTo16BitPCM(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Int16Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const clamped = Math.max(-1, Math.min(1, chunk[i]));
      result[offset++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
  }
  return result;
}

window.capture.onStart(async () => {
  try {
    await ensureCapture();
    chunks = [];
    isRecording = true;
  } catch (err) {
    window.capture.sendError(String(err));
  }
});

window.capture.onStop(() => {
  isRecording = false;
  const samples = floatTo16BitPCM(chunks);
  chunks = [];
  window.capture.sendAudio(samples.buffer);
});
