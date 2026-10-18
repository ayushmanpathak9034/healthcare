import emergencyConfig from "./emergency_types.json" with { type: "json" };

export interface EmergencyTypeConfig {
  type: string;
  severity: string;
  required_resources: string[];
  keywords_en: string[];
  keywords_hinglish: string[];
  keywords_hi: string[];
}

export interface RedFlagCheckResult {
  is_escalated: boolean;
  escalated_colour: "green" | "yellow" | "red";
  matched_type: string | null;
  matched_keyword: string | null;
  evidence: string | null;
  required_resources: string[];
  immediate_alert: boolean;
  explanation: string | null;
}

/**
 * Normalizes text for robust matching.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether a matched keyword occurrence is negated in its immediate local context.
 */
export function isMatchNegated(normalizedText: string, keyword: string): boolean {
  const normKw = normalizeText(keyword);
  // If the keyword itself contains a negative word (e.g. "hosh me nahi hai"), it is an affirmative emergency trigger
  if (normKw.includes("nahi") || normKw.includes("नहीं")) {
    return false;
  }

  const kwIndex = normalizedText.indexOf(normKw);
  if (kwIndex === -1) return false;

  // Immediate prefix check (up to 25 characters immediately preceding the keyword)
  const preText = normalizedText.slice(Math.max(0, kwIndex - 25), kwIndex).trim();
  const prefixRegex = /\b(no|not|denies|denied|without|negative for|free of|never had)\s*(?:any\s+|other\s+)?$/i;
  if (prefixRegex.test(preText)) {
    return true;
  }
  const hindiPreRegex = /\b(koi\s+|bina\s+|kisi\s+)?(nahi|नहीं)$/i;
  if (hindiPreRegex.test(preText)) {
    return true;
  }

  // Immediate postfix check (up to 30 characters immediately following the keyword)
  const postText = normalizedText.slice(kwIndex + normKw.length, kwIndex + normKw.length + 30).trim();
  const postfixRegex = /^(?:to\s+)?(?:bhi\s+)?(?:bilkul\s+)?(nahi hai|nahi tha|nahi ho raha|nahi tha|nahi ho|nahi|नहीं है|नहीं था|नहीं)/i;
  if (postfixRegex.test(postText)) {
    return true;
  }

  // Specific Hindi negation pattern: "chhati/seene me koi dard nahi"
  const localSlice = normalizedText.slice(Math.max(0, kwIndex - 15), kwIndex + normKw.length + 20);
  if (/koi\s+.*(nahi|नहीं)/i.test(localSlice)) {
    return true;
  }

  return false;
}

/**
 * Inspects the raw transcript independently of the LLM.
 * Returns immediate RED escalation if any trigger matches without negation.
 * Invariant: Can ONLY escalate, never downgrade.
 */
export function evaluateRedFlags(
  rawTranscript: string,
  currentColour: "green" | "yellow" | "red" = "green"
): RedFlagCheckResult {
  const normalized = normalizeText(rawTranscript);

  // Invariant: If already RED, never downgrade
  if (currentColour === "red") {
    return {
      is_escalated: false,
      escalated_colour: "red",
      matched_type: null,
      matched_keyword: null,
      evidence: null,
      required_resources: [],
      immediate_alert: true,
      explanation: "Patient is already under Red emergency status. Escalation cannot be downgraded.",
    };
  }

  const emergencyTypes: EmergencyTypeConfig[] = emergencyConfig.emergency_types;

  for (const item of emergencyTypes) {
    const allKeywords = [
      ...item.keywords_en,
      ...item.keywords_hinglish,
      ...item.keywords_hi,
    ];

    for (const kw of allKeywords) {
      const normKw = normalizeText(kw);
      if (!normKw) continue;

      if (normalized.includes(normKw)) {
        // Check if negated
        if (isMatchNegated(normalized, kw)) {
          // Negated match - do not escalate
          continue;
        }

        // Positive, un-negated red flag match!
        return {
          is_escalated: true,
          escalated_colour: "red",
          matched_type: item.type,
          matched_keyword: kw,
          evidence: kw,
          required_resources: item.required_resources,
          immediate_alert: true,
          explanation: `Immediate emergency detected (${item.type}): matched "${kw}". Safety net escalated case to RED.`,
        };
      }
    }
  }

  // No red flags matched
  return {
    is_escalated: false,
    escalated_colour: currentColour,
    matched_type: null,
    matched_keyword: null,
    evidence: null,
    required_resources: [],
    immediate_alert: false,
    explanation: null,
  };
}

/**
 * Helper to identify moderate concern symptoms (for priority score +30 bonus).
 */
export function checkModerateConcern(rawTranscript: string): boolean {
  const normalized = normalizeText(rawTranscript);
  const moderateTriggers = [
    "fever with breathing",
    "fever and breathing discomfort",
    "high fever with chills and vomiting",
    "severe continuous abdominal pain",
    "repeated vomiting unable to keep fluids",
    "bukhar aur saans lene me takleef",
    "bukhar ke sath saans",
    "tez bukhar aur ulti",
    "लगातार उल्टी और तेज बुखार",
    "बुखार के साथ सांस लेने में परेशानी",
  ];

  for (const trigger of moderateTriggers) {
    if (normalized.includes(normalizeText(trigger))) {
      if (!isMatchNegated(normalized, trigger)) {
        return true;
      }
    }
  }
  return false;
}
