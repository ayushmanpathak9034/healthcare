import { TranscriptionService } from "../_shared/ai/transcription_service.ts";
import { evaluateRedFlags, checkModerateConcern } from "../_shared/ai/red_flags.ts";
import { getNextFollowupQuestion, type ConversationTurn } from "../_shared/ai/followup_manager.ts";
import { GeminiClient } from "../_shared/ai/gemini_client.ts";
import { extractClinicalCaseSheet } from "../_shared/ai/extractor.ts";
import { computePriorityScore, type UrgencyColour } from "../_shared/ai/priority_score.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const transcriptionService = new TranscriptionService();
const geminiClient = new GeminiClient();

/**
 * Canonical handler for Swasthya Setu Intake routes:
 * - POST /intake/voice
 * - POST /intake/followup
 * - POST /intake/extract
 */
export async function handleIntakeRequest(req: Request): Promise<Response> {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/+$/, ""); // normalize trailing slash

  try {
    // 1. ROUTE: /intake/voice
    if (pathname.endsWith("/voice") || pathname.endsWith("/intake/voice")) {
      const contentType = req.headers.get("content-type") || "";

      if (!contentType.includes("multipart/form-data")) {
        return new Response(
          JSON.stringify({
            success: false,
            error_code: "UNSUPPORTED_FORMAT",
            message: "Content-Type must be multipart/form-data containing 'audio'",
            fallback_to_client_speech: true,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const formData = await req.formData();
      const audioFile = formData.get("audio");
      const language = (formData.get("language") as "hi" | "en" | "auto") || "auto";
      const currentColour = (formData.get("current_colour") as UrgencyColour) || "green";

      if (!audioFile || !(audioFile instanceof Blob)) {
        return new Response(
          JSON.stringify({
            success: false,
            error_code: "AUDIO_TOO_SHORT",
            message: "Missing 'audio' file in multipart body.",
            fallback_to_client_speech: true,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const buffer = new Uint8Array(await audioFile.arrayBuffer());
      const transcribeResult = await transcriptionService.transcribe({
        audioBuffer: buffer,
        mimeType: audioFile.type || "audio/webm",
        language,
      });

      if (!transcribeResult.success) {
        return new Response(JSON.stringify(transcribeResult), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Immediate Safety Net evaluation on the transcribed speech
      const redFlagResult = evaluateRedFlags(transcribeResult.transcript, currentColour);

      return new Response(
        JSON.stringify({
          success: true,
          transcript: transcribeResult.transcript,
          detected_language: transcribeResult.detected_language,
          confidence: transcribeResult.confidence,
          red_flag: {
            is_escalated: redFlagResult.is_escalated,
            escalated_colour: redFlagResult.escalated_colour,
            matched_trigger: redFlagResult.matched_type,
            evidence: redFlagResult.evidence,
            required_resources: redFlagResult.required_resources,
            alert_dispatched_immediately: redFlagResult.immediate_alert,
            explanation: redFlagResult.explanation,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. ROUTE: /intake/followup
    if (pathname.endsWith("/followup") || pathname.endsWith("/intake/followup")) {
      const body = await req.json();
      const conversationTurns: ConversationTurn[] = body.conversation_turns || [];
      const askedQuestionIds: string[] = body.asked_question_ids || [];
      const currentColour: UrgencyColour = body.current_colour || "green";

      const decision = getNextFollowupQuestion(conversationTurns, askedQuestionIds, currentColour);

      return new Response(JSON.stringify(decision), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. ROUTE: /intake/extract
    if (pathname.endsWith("/extract") || pathname.endsWith("/intake/extract")) {
      const body = await req.json();
      const fullTranscript = String(body.full_transcript || "");
      const currentColour: UrgencyColour = body.colour || "green";
      const patientContext = body.patient_context || {};

      // 1. Extract clinical draft with evidence guarding
      const extractionRes = await extractClinicalCaseSheet(fullTranscript, geminiClient, "voice");

      // 2. Check for moderate concern bonus in priority score
      const hasModerate = checkModerateConcern(fullTranscript);

      // 3. Deterministic Priority Score calculation
      const priorityRes = computePriorityScore({
        urgencyColour: currentColour,
        hasModerateRedFlag: hasModerate,
        age: typeof patientContext.age === "number" ? patientContext.age : null,
        isPregnant: Boolean(patientContext.pregnancy),
        hasChronicCondition: Boolean(patientContext.known_chronic_condition),
        waitingMinutes: typeof patientContext.waiting_minutes === "number" ? patientContext.waiting_minutes : 0,
      });

      return new Response(
        JSON.stringify({
          success: true,
          draft_case_sheet: extractionRes.case_sheet,
          priority_score: priorityRes,
          used_fallback: extractionRes.used_fallback,
          clinical_disclaimer: extractionRes.clinical_disclaimer,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unmatched path
    return new Response(
      JSON.stringify({
        error: "Not Found",
        available_endpoints: ["POST /intake/voice", "POST /intake/followup", "POST /intake/extract"],
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

// Default export for Supabase Edge Functions runtime (Deno)
if (typeof Deno !== "undefined" && "serve" in Deno) {
  // @ts-ignore: Deno global is available in Supabase Edge Functions runtime
  Deno.serve(handleIntakeRequest);
}
