function createTranscriptionHttpAdapter(options) {
  const { inferenceUrl, fetchImpl = fetch } = options;
  if (typeof inferenceUrl !== "function") {
    throw new Error("Transcription HTTP adapter requires an inferenceUrl function");
  }

  // prompt is optional - #16's vocabulary scanner builds it from project
  // identifiers, but plenty of dictations happen with no project configured
  // at all, and whisper-server treats a missing/empty prompt exactly like
  // it always has.
  async function transcribe(wavBuffer, prompt) {
    const formData = new FormData();
    formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "dictation.wav");
    formData.append("response_format", "json");
    if (prompt) formData.append("prompt", prompt);

    const res = await fetchImpl(inferenceUrl(), { method: "POST", body: formData });
    if (!res.ok) throw new Error(`transcription model server returned ${res.status}`);

    const body = await res.json();
    return (body.text || "").trim();
  }

  return { transcribe };
}

module.exports = { createTranscriptionHttpAdapter };
