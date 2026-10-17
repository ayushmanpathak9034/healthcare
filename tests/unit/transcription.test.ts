import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptionService } from "../../supabase/functions/_shared/ai/transcription_service.ts";

test("Transcription Service: Rejects Unsupported Formats", async () => {
  const service = new TranscriptionService();
  const dummyBuffer = new Uint8Array(1024);

  const res = await service.transcribe({
    audioBuffer: dummyBuffer,
    mimeType: "audio/mp3", // not webm or ogg
  });

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.error_code, "UNSUPPORTED_FORMAT");
    assert.equal(res.fallback_to_client_speech, true);
  }
});

test("Transcription Service: Rejects Files Exceeding 2 MB", async () => {
  const service = new TranscriptionService();
  // 2.5 MB buffer
  const largeBuffer = new Uint8Array(2.5 * 1024 * 1024);

  const res = await service.transcribe({
    audioBuffer: largeBuffer,
    mimeType: "audio/webm",
  });

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.error_code, "AUDIO_TOO_LARGE");
    assert.equal(res.fallback_to_client_speech, true);
  }
});

test("Transcription Service: Rejects Durations Exceeding 30 Seconds", async () => {
  const service = new TranscriptionService();
  const dummyBuffer = new Uint8Array(2048);

  const res = await service.transcribe({
    audioBuffer: dummyBuffer,
    mimeType: "audio/ogg",
    durationSeconds: 45, // > 30s
  });

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.error_code, "AUDIO_TOO_LONG");
    assert.equal(res.fallback_to_client_speech, true);
  }
});

test("Transcription Service: Rejects Too Short/Empty Buffers", async () => {
  const service = new TranscriptionService();
  const tinyBuffer = new Uint8Array(50); // < 512 bytes

  const res = await service.transcribe({
    audioBuffer: tinyBuffer,
    mimeType: "audio/webm",
  });

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.error_code, "AUDIO_TOO_SHORT");
  }
});

test("Transcription Service: Low Confidence Triggers Deterministic Fallback", async () => {
  const service = new TranscriptionService(async () => ({
    transcript: "muffled audio noise...",
    confidence: 0.2, // < 0.35 threshold
    detected_language: "hi",
  }));

  const dummyBuffer = new Uint8Array(2048);
  const res = await service.transcribe({
    audioBuffer: dummyBuffer,
    mimeType: "audio/webm",
    durationSeconds: 10,
  });

  assert.equal(res.success, false);
  if (!res.success) {
    assert.equal(res.error_code, "LOW_CONFIDENCE");
    assert.equal(res.fallback_to_client_speech, true);
  }
});

test("Transcription Service: Successful In-Memory Hindi/English Transcription", async () => {
  const service = new TranscriptionService(async () => ({
    transcript: "2 din se tez bukhar hai aur badan me dard hai",
    confidence: 0.94,
    detected_language: "hi",
  }));

  const validBuffer = new Uint8Array(4096);
  const res = await service.transcribe({
    audioBuffer: validBuffer,
    mimeType: "audio/webm",
    durationSeconds: 8,
    language: "hi",
  });

  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.transcript, "2 din se tez bukhar hai aur badan me dard hai");
    assert.equal(res.confidence, 0.94);
    assert.equal(res.detected_language, "hi");
  }
});
