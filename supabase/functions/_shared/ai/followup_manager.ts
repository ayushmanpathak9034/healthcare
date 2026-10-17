import questionBankConfig from "./question_bank.json" with { type: "json" };
import { evaluateRedFlags, type RedFlagCheckResult } from "./red_flags.ts";

export interface ConversationTurn {
  speaker: "patient" | "system";
  transcript: string;
}

export interface FollowupQuestion {
  question_id: string;
  category: string;
  text: string; // Hindi or target language
  text_en: string;
  text_hinglish: string;
}

export interface FollowupDecision {
  is_complete: boolean;
  turn_count: number;
  max_turns: number;
  red_flag_detected: boolean;
  immediate_alert_dispatched: boolean;
  review_suggested: boolean;
  escalated_colour: "green" | "yellow" | "red";
  next_question: FollowupQuestion | null;
  explanation: string | null;
}

const MAX_FOLLOWUP_TURNS = 3;

/**
 * Normalizes text for keyword matching.
 */
function normalize(str: string): string {
  return str.toLowerCase().replace(/[\r\n\t]+/g, " ").trim();
}

/**
 * Determines the most relevant unasked clinical question category from the question bank.
 */
function selectNextQuestionId(
  combinedTranscript: string,
  askedIds: string[]
): string {
  const norm = normalize(combinedTranscript);
  const askedSet = new Set(askedIds);

  // Category heuristics based on patient-reported keywords
  if (
    (norm.includes("saanp") || norm.includes("snake") || norm.includes("dhas")) &&
    !askedSet.has("snakebite_time_bite_site")
  ) {
    return "snakebite_time_bite_site";
  }
  if (
    (norm.includes("saanp") || norm.includes("snake")) &&
    !askedSet.has("snakebite_visible_symptoms")
  ) {
    return "snakebite_visible_symptoms";
  }

  if (
    (norm.includes("chot") || norm.includes("injury") || norm.includes("accident") || norm.includes("gir gaya")) &&
    !askedSet.has("injury_mechanism_site")
  ) {
    return "injury_mechanism_site";
  }

  if (
    (norm.includes("saans") || norm.includes("breath") || norm.includes("khansi") || norm.includes("cough")) &&
    !askedSet.has("breathing_triggers_posture")
  ) {
    return "breathing_triggers_posture";
  }

  if (
    (norm.includes("bukhar") || norm.includes("fever") || norm.includes("tapman") || norm.includes("temperature")) &&
    !askedSet.has("fever_duration_temperature")
  ) {
    return "fever_duration_temperature";
  }

  if (
    (norm.includes("pet") || norm.includes("stomach") || norm.includes("abdomen") || norm.includes("dast") || norm.includes("ulti")) &&
    !askedSet.has("stomach_pain_meals_relation")
  ) {
    return "stomach_pain_meals_relation";
  }

  if (
    (norm.includes("dard") || norm.includes("pain") || norm.includes("chubhan") || norm.includes("ache")) &&
    !askedSet.has("pain_location_duration")
  ) {
    return "pain_location_duration";
  }

  // Fallbacks from general questions
  if (!askedSet.has("general_current_medications")) {
    return "general_current_medications";
  }

  if (!askedSet.has("general_known_allergies")) {
    return "general_known_allergies";
  }

  // Next available unasked question from the bank
  for (const q of questionBankConfig.questions) {
    if (!askedSet.has(q.question_id)) {
      return q.question_id;
    }
  }

  return "general_current_medications";
}

/**
 * Manages bounded clinical follow-ups.
 * Enforces:
 * 1. Immediate RED emergency escalation (never waits for follow-ups).
 * 2. Strict maximum 3 follow-up questions.
 * 3. Only questions from question_bank.json (no yes/no questions).
 */
export function getNextFollowupQuestion(
  conversationTurns: ConversationTurn[],
  askedQuestionIds: string[] = [],
  currentColour: "green" | "yellow" | "red" = "green"
): FollowupDecision {
  const patientTurns = conversationTurns.filter((t) => t.speaker === "patient");
  const fullTranscript = patientTurns.map((t) => t.transcript).join(" ");
  const latestTranscript = patientTurns.length > 0 ? patientTurns[patientTurns.length - 1].transcript : "";

  // 1. SAFETY NET FIRST: Run deterministic red flag rule engine on the latest answer
  const redFlagResult: RedFlagCheckResult = evaluateRedFlags(latestTranscript || fullTranscript, currentColour);

  if (redFlagResult.is_escalated || redFlagResult.escalated_colour === "red") {
    // Immediate RED escalation: NEVER wait for follow-up questions
    // An emergency pre-arrival alert is flagged immediately
    const shortRedQuestion =
      askedQuestionIds.length < MAX_FOLLOWUP_TURNS
        ? questionBankConfig.questions.find((q) => q.question_id === "snakebite_time_bite_site" || q.question_id === "pain_nature_severity") || null
        : null;

    return {
      is_complete: true,
      turn_count: askedQuestionIds.length,
      max_turns: MAX_FOLLOWUP_TURNS,
      red_flag_detected: true,
      immediate_alert_dispatched: true,
      review_suggested: false,
      escalated_colour: "red",
      next_question: null, // Routine intake halts immediately for emergency routing
      explanation: redFlagResult.explanation || "Emergency red flag detected. Alert dispatched immediately.",
    };
  }

  // 2. Strict Bound Check: Maximum 3 follow-up turns
  if (askedQuestionIds.length >= MAX_FOLLOWUP_TURNS) {
    return {
      is_complete: true,
      turn_count: askedQuestionIds.length,
      max_turns: MAX_FOLLOWUP_TURNS,
      red_flag_detected: false,
      immediate_alert_dispatched: false,
      review_suggested: false,
      escalated_colour: currentColour,
      next_question: null,
      explanation: "Maximum 3 bounded follow-up questions reached. Intake complete.",
    };
  }

  // 3. Select next controlled question from question bank
  const nextQId = selectNextQuestionId(fullTranscript, askedQuestionIds);
  const matchedQ = questionBankConfig.questions.find((q) => q.question_id === nextQId);

  if (!matchedQ) {
    return {
      is_complete: true,
      turn_count: askedQuestionIds.length,
      max_turns: MAX_FOLLOWUP_TURNS,
      red_flag_detected: false,
      immediate_alert_dispatched: false,
      review_suggested: false,
      escalated_colour: currentColour,
      next_question: null,
      explanation: "All pertinent clinical questions addressed.",
    };
  }

  return {
    is_complete: false,
    turn_count: askedQuestionIds.length + 1,
    max_turns: MAX_FOLLOWUP_TURNS,
    red_flag_detected: false,
    immediate_alert_dispatched: false,
    review_suggested: false,
    escalated_colour: currentColour,
    next_question: {
      question_id: matchedQ.question_id,
      category: matchedQ.category,
      text: matchedQ.hi,
      text_en: matchedQ.en,
      text_hinglish: matchedQ.hinglish,
    },
    explanation: null,
  };
}
