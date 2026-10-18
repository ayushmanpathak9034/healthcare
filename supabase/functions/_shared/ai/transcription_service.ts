/**
 * In-memory audio transcription service.
 * Enforces strict limits:
 * - webm, ogg
 * - <= 30 seconds
 * - <= 2 MB
 * - Immediate memory cleanup (never written to disk)
 * - Deterministic error codes for client fallback
 */

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_DURATION_SECONDS = 30;
export const MIN_AUDIO_BYTES = 512; // Minimum threshold to prevent empty buffers

export type SupportedAudioMimeType = "audio/webm" | "audio/ogg" | "audio/opus";

export type TranscriptionErrorCode =
  | "AUDIO_TOO_LARGE"
  | "AUDIO_TOO_SHORT"
  | "AUDIO_TOO_LONG"
  | "UNSUPPORTED_FORMAT"
  | "LOW_CONFIDENCE"
  | "TRANSCRIPTION_FAILED";

export interface TranscriptionInput {
  audioBuffer: Uint8Array | ArrayBuffer;
  mimeType: string;
  durationSeconds?: number;
  language?: "hi" | "en" | "auto";
}

export interface TranscriptionSuccess {
  success: true;
  transcript: string;
  confidence: number;
  detected_language: string;
}

export interface TranscriptionFailure {
  success: false;
  error_code: TranscriptionErrorCode;
  message: string;
  fallback_to_client_speech: true;
}

export type TranscriptionResult = TranscriptionSuccess | TranscriptionFailure;

export type AudioTranscriberFn = (
  audioBase64: string,
  mimeType: string,
  language?: string
) => Promise<{ transcript: string; confidence: number; detected_language: string }>;

export class TranscriptionService {
  private transcriberFn: AudioTranscriberFn | null = null;

  constructor(customTranscriber?: AudioTranscriberFn) {
    if (customTranscriber) {
      this.transcriberFn = customTranscriber;
    }
  }

  public setTranscriber(fn: AudioTranscriberFn | null) {
    this.transcriberFn = fn;
  }

  /**
   * Validates and transcribes in-memory audio.
   * Wipes audio buffer references immediately after use.
   */
  public async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const { mimeType, durationSeconds, language } = input;
    let buffer: Uint8Array | null =
      input.audioBuffer instanceof Uint8Array
        ? input.audioBuffer
        : new Uint8Array(input.audioBuffer);

    try {
      // 1. Format Check (webm / ogg)
      const cleanMime = (mimeType || "").toLowerCase().split(";")[0].trim();
      const isSupported =
        cleanMime === "audio/webm" ||
        cleanMime === "audio/ogg" ||
        cleanMime === "audio/opus" ||
        cleanMime === "video/webm"; // Some browsers send WebM audio as video/webm

      if (!isSupported) {
        return {
          success: false,
          error_code: "UNSUPPORTED_FORMAT",
          message: `Format '${mimeType}' is not supported. Please send audio/webm or audio/ogg.`,
          fallback_to_client_speech: true,
        };
      }

      // 2. Size Checks
      const byteLength = buffer.byteLength;
      if (byteLength < MIN_AUDIO_BYTES) {
        return {
          success: false,
          error_code: "AUDIO_TOO_SHORT",
          message: "Audio stream is too short or empty.",
          fallback_to_client_speech: true,
        };
      }

      if (byteLength > MAX_AUDIO_BYTES) {
        return {
          success: false,
          error_code: "AUDIO_TOO_LARGE",
          message: `Audio file size (${(byteLength / 1024 / 1024).toFixed(2)} MB) exceeds 2 MB limit.`,
          fallback_to_client_speech: true,
        };
      }

      // 3. Duration Check
      if (typeof durationSeconds === "number" && durationSeconds > MAX_DURATION_SECONDS) {
        return {
          success: false,
          error_code: "AUDIO_TOO_LONG",
          message: `Audio duration (${durationSeconds}s) exceeds maximum 30 seconds limit.`,
          fallback_to_client_speech: true,
        };
      }

      // 4. Transcription Execution (in-memory)
      if (this.transcriberFn) {
        const base64Data = Buffer.from(buffer).toString("base64");
        // Clear buffer early
        buffer = null;

        const res = await this.transcriberFn(base64Data, cleanMime, language);

        if (res.confidence < 0.35) {
          return {
            success: false,
            error_code: "LOW_CONFIDENCE",
            message: "Audio transcription confidence is too low to guarantee clinical accuracy.",
            fallback_to_client_speech: true,
          };
        }

        return {
          success: true,
          transcript: res.transcript.trim(),
          confidence: res.confidence,
          detected_language: res.detected_language || language || "hi",
        };
      }

      // If no live transcriber hooked, fallback to deterministic transcription error so client uses speech-to-text
      return {
        success: false,
        error_code: "TRANSCRIPTION_FAILED",
        message: "Transcription engine is currently in standby mode.",
        fallback_to_client_speech: true,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error_code: "TRANSCRIPTION_FAILED",
        message: err instanceof Error ? err.message : "Internal transcription error.",
        fallback_to_client_speech: true,
      };
    } finally {
      // Memory cleanup: Wipe references
      buffer = null;
    }
  }
}
