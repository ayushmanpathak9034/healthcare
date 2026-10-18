import { GeminiClient } from "./gemini_client.ts";
import { EXTRACTION_SYSTEM_PROMPT, CONTROLLED_SYMPTOMS } from "./schemas.ts";
import { guardExtractedData, type GuardedClinicalCaseSheet, type RawClinicalCaseSheet } from "./evidence_guard.ts";
import { isMatchNegated } from "./red_flags.ts";

export interface ExtractionResult {
  success: boolean;
  used_fallback: boolean;
  case_sheet: GuardedClinicalCaseSheet;
  clinical_disclaimer: string;
  source_tag: "voice" | "document" | "abha";
}

const CLINICAL_DISCLAIMER =
  "AI assists with clinical documentation and intake structuring only. AI never provides medical diagnoses, treatment plans, or prescriptions. All clinical decisions strictly remain with verified doctors.";

/**
 * Deterministic rule-based fallback when LLM fails or produces malformed JSON twice.
 */
function extractWithRulesFallback(rawTranscript: string): RawClinicalCaseSheet {
  const norm = rawTranscript.toLowerCase();
  const symptoms: { value: string; evidence: string }[] = [];

  const symptomKeywords: Record<string, string[]> = {
    fever: ["bukhar", "fever", "tapman", "तेज बुखार", "बुखार"],
    cough: ["khansi", "cough", "balgam", "खांसी"],
    chest_pain: ["chest pain", "chhati me dard", "seene me dard", "सीने में दर्द"],
    shortness_of_breath: ["shortness of breath", "saans lene me", "dam ghut", "saans phool", "breathless", "सांस लेने में"],
    headache: ["sar dard", "sir dard", "headache", "सिर दर्द"],
    abdominal_pain: ["pet dard", "pet ke dahine hisse me", "stomach pain", "abdominal pain", "pet me", "पेट दर्द"],
    vomiting: ["ulti", "vomiting", "उल्टी"],
    diarrhea: ["dast", "loose motion", "दस्त"],
    dizziness: ["chakkar", "dizziness", "चक्कर"],
    fatigue: ["thakan", "kamzori", "fatigue", "कमजोरी"],
    body_ache: ["badan dard", "body ache", "शरीर में दर्द"],
    back_pain: ["kamar dard", "back pain", "flank", "कमर दर्द"],
    snakebite: ["snakebite", "snake bite", "saanp", "सांप"],
    injury: ["cut", "machine cut", "injury", "chot", "wound", "fracture", "accident", "fisal kar", "twisted", "ankle sprain", "चोट"],
    bleeding: ["bleeding", "khoon", "रक्तस्राव", "खून"],
    rash: ["rash", "khujli", "chakatte", "चकत्ते", "खुजली"],
    joint_pain: ["ghutne me", "joint pain", "jodon me dard"],
    cold: ["zukaam", "cold", "runny nose", "जुकाम"],
    sore_throat: ["throat", "gale me", "गले में"],
    weakness: ["weakness", "kamzori", "chehra tedha", "slurred speech"],
  };

  for (const [sym, keywords] of Object.entries(symptomKeywords)) {
    for (const kw of keywords) {
      if (norm.includes(kw)) {
        if (!isMatchNegated(norm, kw)) {
          symptoms.push({ value: sym, evidence: kw });
          break;
        }
      }
    }
  }

  // Duration
  let duration_bucket: { value: string; evidence: string } | null = null;
  const durationPatterns = [
    { regex: /(\d+\s*(?:din|days?|hafte|weeks?|mahine|months?))/i, bucket: "1-3d" },
    { regex: /(\d+\s*(?:ghante|hours?))/i, bucket: "1-6h" },
    { regex: /(aaj\s*subah|today\s*morning|subah\s*se)/i, bucket: "1-6h" },
    { regex: /(kal\s*se|since\s*yesterday)/i, bucket: "6-24h" },
  ];

  for (const dp of durationPatterns) {
    const match = rawTranscript.match(dp.regex);
    if (match) {
      duration_bucket = { value: dp.bucket, evidence: match[1] };
      break;
    }
  }

  // Medications
  const meds: { value: string; evidence: string }[] = [];
  const medMatch = rawTranscript.match(/(?:dawai|medicine|tablets?|goli)\s+([a-zA-Z0-9\s]+)/i);
  if (medMatch) {
    meds.push({ value: medMatch[1].trim(), evidence: medMatch[0].trim() });
  }

  return {
    chief_complaint: symptoms.length > 0 ? symptoms[0] : null,
    symptoms,
    severity: null, // will default to moderate (2) in evidence_guard
    severity_evidence: null,
    duration_bucket,
    current_medications: meds,
  };
}

/**
 * Executes clinical case-sheet extraction with:
 * - PII scrubbing
 * - Temperature = 0 pinned Gemini model
 * - Attempt 1 -> retry once (attempt 2)
 * - Attempt 2 failure -> deterministic rule-based fallback
 * - Grounding evidence guardrail (drops fields without verbatim evidence in transcript)
 */
export async function extractClinicalCaseSheet(
  rawTranscript: string,
  geminiClient: GeminiClient,
  sourceTag: "voice" | "document" | "abha" = "voice"
): Promise<ExtractionResult> {
  let rawExtracted: RawClinicalCaseSheet | null = null;
  let usedFallback = false;

  // Try LLM extraction (with internal 1 retry in GeminiClient)
  try {
    const prompt = `Extract structured clinical summary from this patient intake transcript:\n"""\n${rawTranscript}\n"""`;
    const responseText = await geminiClient.generateText(prompt, EXTRACTION_SYSTEM_PROMPT);

    // Clean JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      rawExtracted = JSON.parse(jsonMatch[0]) as RawClinicalCaseSheet;
    } else {
      throw new Error("No valid JSON found in LLM response.");
    }
  } catch (_err) {
    // If LLM extraction fails twice, engage rule-based fallback
    usedFallback = true;
    rawExtracted = extractWithRulesFallback(rawTranscript);
  }

  // Guard extracted data against verbatim transcript evidence
  const guardedCaseSheet = guardExtractedData(rawTranscript, rawExtracted || {});

  return {
    success: true,
    used_fallback: usedFallback,
    case_sheet: guardedCaseSheet,
    clinical_disclaimer: CLINICAL_DISCLAIMER,
    source_tag: sourceTag,
  };
}
