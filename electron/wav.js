// Wraps mono 16-bit PCM samples in a minimal WAV header. whisper-server's
// /inference endpoint expects a WAV file, not raw PCM - see the curl example
// in examples/server/README.md and the mic-capture research in issue #33.
const SAMPLE_RATE = 16000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

function encodeWav(int16Samples) {
  const dataSize = int16Samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");

  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28); // byte rate
  buffer.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32); // block align
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);

  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < int16Samples.length; i++) {
    buffer.writeInt16LE(int16Samples[i], 44 + i * 2);
  }

  return buffer;
}

module.exports = { encodeWav, SAMPLE_RATE };
