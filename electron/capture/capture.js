// Runs in the permanently hidden capture renderer. The microphone and audio
// graph stay alive between dictations; start and stop only control which input
// frames belong to the current complete recording.
const SAMPLE_RATE = 16000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

let audioContext = null;
let processorNode = null;
let capturePromise = null;
let isRecording = false;
let chunks = [];

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWav(recordedChunks) {
  const sampleCount = recordedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const dataSize = sampleCount * (BITS_PER_SAMPLE / 8);
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), true);
  view.setUint16(32, CHANNELS * (BITS_PER_SAMPLE / 8), true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const chunk of recordedChunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample));
      const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }

  return wav;
}

function soundLevel(samples) {
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  return Math.sqrt(sumOfSquares / samples.length);
}

async function prepareCapture() {
  if (capturePromise) return capturePromise;

  capturePromise = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: CHANNELS },
    });
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (audioContext.sampleRate !== SAMPLE_RATE) {
      const actualSampleRate = audioContext.sampleRate;
      for (const track of stream.getTracks()) track.stop();
      await audioContext.close();
      audioContext = null;
      throw new Error(`Microphone sample rate is ${actualSampleRate} Hz, expected ${SAMPLE_RATE} Hz`);
    }
    const source = audioContext.createMediaStreamSource(stream);

    // ScriptProcessorNode must connect to a destination to receive frames.
    // A zero-gain route keeps capture active without playing the microphone.
    processorNode = audioContext.createScriptProcessor(2048, CHANNELS, CHANNELS);
    processorNode.onaudioprocess = (event) => {
      if (!isRecording) return;
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      chunks.push(samples);
      window.capture.sendSoundLevel(soundLevel(samples));
    };

    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    source.connect(processorNode);
    processorNode.connect(silentGain);
    silentGain.connect(audioContext.destination);
  })();

  try {
    await capturePromise;
    window.capture.sendReady();
  } catch (error) {
    capturePromise = null;
    window.capture.sendError(String(error));
  }
}

window.capture.onStart(() => {
  if (!audioContext) {
    window.capture.sendError("Microphone capture is not ready");
    return;
  }

  chunks = [];
  isRecording = true;
});

window.capture.onStop(() => {
  isRecording = false;
  const wav = encodeWav(chunks);
  chunks = [];
  window.capture.sendSoundLevel(0);
  window.capture.sendRecording(wav);
});

prepareCapture();
