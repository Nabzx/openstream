function createTranscriptionHttpAdapter(options) {
  const { inferenceUrl, fetchImpl = fetch } = options;
  if (typeof inferenceUrl !== "function") {
    throw new Error("Transcription HTTP adapter requires an inferenceUrl function");
  }

  async function transcribe(wavBuffer) {
    const formData = new FormData();
    formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "dictation.wav");
    formData.append("response_format", "json");

    const res = await fetchImpl(inferenceUrl(), { method: "POST", body: formData });
    if (!res.ok) throw new Error(`transcription model server returned ${res.status}`);

    const body = await res.json();
    return { text: (body.text || "").trim() };
  }

  return { transcribe };
}

module.exports = { createTranscriptionHttpAdapter };
