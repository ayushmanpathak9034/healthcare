/**
 * Clinical schemas, controlled vocabularies, and JSON schemas for LLM structured output.
 */

export const CONTROLLED_SYMPTOMS = [
  "fever",
  "cough",
  "chest_pain",
  "shortness_of_breath",
  "headache",
  "abdominal_pain",
  "vomiting",
  "diarrhea",
  "dizziness",
  "fatigue",
  "body_ache",
  "rash",
  "joint_pain",
  "injury",
  "snakebite",
  "palpitations",
  "bleeding",
  "back_pain",
  "sore_throat",
  "ear_pain",
  "eye_redness",
  "burning_micturition",
  "weakness",
  "cold",
  "loss_of_appetite",
] as const;

export type ControlledSymptom = (typeof CONTROLLED_SYMPTOMS)[number];

export const DURATION_BUCKETS = ["<1h", "1-6h", "6-24h", "1-3d", ">3d", "unknown"] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export const AGE_BANDS = ["infant_child_<5", "adult_5_59", "senior_>=60", "unknown"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export interface EvidenceField<T = string> {
  value: T;
  evidence: string;
}

export interface ClinicalCaseSheetDraft {
  chief_complaint: EvidenceField | null;
  symptoms: EvidenceField[];
  severity: number; // 0, 1, 2, 3
  severity_inferred_as_moderate: boolean;
  duration_bucket: DurationBucket;
  duration_evidence: string | null;
  pregnancy: boolean | null;
  chronic_conditions: string[];
  age_band: AgeBand | null;
  associated_symptoms: EvidenceField[];
  current_medications: EvidenceField[];
  allergies: EvidenceField[];
  source_tag: "voice" | "document" | "abha";
  draft_status: "DRAFT_PENDING_DOCTOR_APPROVAL";
  clinical_disclaimer: string;
}

/**
 * System instruction and guardrails for clinical extraction.
 */
export const EXTRACTION_SYSTEM_PROMPT = `
You are the Clinical Extraction Assistant for Swasthya Setu.
Your job is to extract structured patient-reported information from a triage transcript into JSON.

STRICT CLINICAL SAFETY RULES:
1. NEVER diagnose a medical condition or disease.
2. NEVER prescribe, recommend, or adjust medications, therapies, or dosages.
3. Your output is strictly a factual draft summary of what the patient said.
4. EVERY single extracted field MUST include verbatim evidence copied directly from the transcript.
5. If the patient did not explicitly mention a detail, return null or an empty list. Do NOT extrapolate or guess.
6. Map symptoms only to the controlled list if applicable: ${CONTROLLED_SYMPTOMS.join(", ")}.
7. Map duration strictly to one of: ${DURATION_BUCKETS.join(", ")}.
8. Severity must be an integer: 0 (none), 1 (mild), 2 (moderate), 3 (severe). If not explicitly stated, return null.

Return ONLY a valid JSON object matching this schema:
{
  "chief_complaint": { "value": string, "evidence": string } | null,
  "symptoms": [ { "value": string, "evidence": string } ],
  "severity": number (0-3) | null,
  "severity_evidence": string | null,
  "duration_bucket": { "value": "<1h" | "1-6h" | "6-24h" | "1-3d" | ">3d" | "unknown", "evidence": string } | null,
  "pregnancy": { "value": boolean, "evidence": string } | null,
  "chronic_conditions": [ { "value": string, "evidence": string } ],
  "age_band": { "value": "infant_child_<5" | "adult_5_59" | "senior_>=60" | "unknown", "evidence": string } | null,
  "associated_symptoms": [ { "value": string, "evidence": string } ],
  "current_medications": [ { "value": string, "evidence": string } ],
  "allergies": [ { "value": string, "evidence": string } ]
}
`;
