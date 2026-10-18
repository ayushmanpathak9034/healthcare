/**
 * Evidence verification and clinical guardrails.
 * Ensures every extracted field is strictly grounded in verbatim transcript text.
 * Drops any field without verifiable transcript evidence.
 */

export interface ExtractedEvidenceField<T = string> {
  value: T;
  evidence: string;
}

export interface RawClinicalCaseSheet {
  chief_complaint?: ExtractedEvidenceField | null;
  symptoms?: ExtractedEvidenceField[] | null;
  severity?: number | null; // 0 - 3
  severity_evidence?: string | null;
  duration_bucket?: ExtractedEvidenceField | null;
  pregnancy?: ExtractedEvidenceField<boolean> | null;
  chronic_conditions?: ExtractedEvidenceField[] | null;
  age_band?: ExtractedEvidenceField | null;
  associated_symptoms?: ExtractedEvidenceField[] | null;
  current_medications?: ExtractedEvidenceField[] | null;
  allergies?: ExtractedEvidenceField[] | null;
}

export interface GuardedClinicalCaseSheet {
  chief_complaint: ExtractedEvidenceField | null;
  symptoms: ExtractedEvidenceField[];
  severity: number; // 0 - 3 (if unknown, defaults to 2)
  severity_inferred_as_moderate: boolean;
  duration_bucket: string;
  duration_evidence: string | null;
  pregnancy: boolean | null;
  chronic_conditions: string[];
  age_band: string | null;
  associated_symptoms: ExtractedEvidenceField[];
  current_medications: ExtractedEvidenceField[];
  allergies: ExtractedEvidenceField[];
  dropped_fields: {
    field_name: string;
    value: unknown;
    invalid_evidence: string | null;
    reason: string;
  }[];
  total_extracted_fields: number;
  dropped_fields_count: number;
  dropped_share: number;
}

/**
 * Normalizes text for evidence matching.
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks whether an evidence string genuinely exists in the raw transcript.
 */
export function verifyEvidence(rawTranscript: string, evidence: string | null | undefined): boolean {
  if (!evidence || typeof evidence !== "string") return false;
  const normRaw = normalize(rawTranscript);
  const normEv = normalize(evidence);
  if (!normEv) return false;

  return normRaw.includes(normEv);
}

/**
 * Validates, filters, and guards an LLM-extracted clinical summary against the raw transcript.
 */
export function guardExtractedData(
  rawTranscript: string,
  rawExtracted: RawClinicalCaseSheet
): GuardedClinicalCaseSheet {
  const dropped_fields: GuardedClinicalCaseSheet["dropped_fields"] = [];
  let total_fields = 0;

  // 1. Chief Complaint
  let chief_complaint: ExtractedEvidenceField | null = null;
  if (rawExtracted.chief_complaint && rawExtracted.chief_complaint.value) {
    total_fields++;
    if (verifyEvidence(rawTranscript, rawExtracted.chief_complaint.evidence)) {
      chief_complaint = {
        value: String(rawExtracted.chief_complaint.value).trim(),
        evidence: rawExtracted.chief_complaint.evidence.trim(),
      };
    } else {
      dropped_fields.push({
        field_name: "chief_complaint",
        value: rawExtracted.chief_complaint.value,
        invalid_evidence: rawExtracted.chief_complaint.evidence || null,
        reason: "Evidence not found verbatim in transcript",
      });
    }
  }

  // 2. Symptoms List
  const symptoms: ExtractedEvidenceField[] = [];
  if (Array.isArray(rawExtracted.symptoms)) {
    for (const sym of rawExtracted.symptoms) {
      if (!sym || !sym.value) continue;
      total_fields++;
      if (verifyEvidence(rawTranscript, sym.evidence)) {
        symptoms.push({
          value: String(sym.value).trim(),
          evidence: sym.evidence.trim(),
        });
      } else {
        dropped_fields.push({
          field_name: "symptoms",
          value: sym.value,
          invalid_evidence: sym.evidence || null,
          reason: "Evidence not found verbatim in transcript",
        });
      }
    }
  }

  // 3. Severity (0 to 3)
  // Rule: Unknown severity is treated as moderate (2) and explicitly flagged
  let severity = 2;
  let severity_inferred = true;
  if (
    typeof rawExtracted.severity === "number" &&
    rawExtracted.severity >= 0 &&
    rawExtracted.severity <= 3
  ) {
    total_fields++;
    if (verifyEvidence(rawTranscript, rawExtracted.severity_evidence)) {
      severity = rawExtracted.severity;
      severity_inferred = false;
    } else {
      // Evidence failed for severity -> treat as moderate and flag
      dropped_fields.push({
        field_name: "severity",
        value: rawExtracted.severity,
        invalid_evidence: rawExtracted.severity_evidence || null,
        reason: "Severity evidence unverified; defaulting to moderate (2)",
      });
      severity = 2;
      severity_inferred = true;
    }
  }

  // 4. Duration
  let duration_bucket = "unknown";
  let duration_evidence: string | null = null;
  if (rawExtracted.duration_bucket && rawExtracted.duration_bucket.value) {
    total_fields++;
    if (verifyEvidence(rawTranscript, rawExtracted.duration_bucket.evidence)) {
      duration_bucket = String(rawExtracted.duration_bucket.value).trim();
      duration_evidence = rawExtracted.duration_bucket.evidence.trim();
    } else {
      dropped_fields.push({
        field_name: "duration_bucket",
        value: rawExtracted.duration_bucket.value,
        invalid_evidence: rawExtracted.duration_bucket.evidence || null,
        reason: "Duration evidence not found verbatim in transcript",
      });
    }
  }

  // 5. Pregnancy
  let pregnancy: boolean | null = null;
  if (rawExtracted.pregnancy && typeof rawExtracted.pregnancy.value === "boolean") {
    total_fields++;
    if (verifyEvidence(rawTranscript, rawExtracted.pregnancy.evidence)) {
      pregnancy = rawExtracted.pregnancy.value;
    } else {
      dropped_fields.push({
        field_name: "pregnancy",
        value: rawExtracted.pregnancy.value,
        invalid_evidence: rawExtracted.pregnancy.evidence || null,
        reason: "Pregnancy evidence not found verbatim in transcript",
      });
    }
  }

  // 6. Chronic Conditions
  const chronic_conditions: string[] = [];
  if (Array.isArray(rawExtracted.chronic_conditions)) {
    for (const c of rawExtracted.chronic_conditions) {
      if (!c || !c.value) continue;
      total_fields++;
      if (verifyEvidence(rawTranscript, c.evidence)) {
        chronic_conditions.push(String(c.value).trim());
      } else {
        dropped_fields.push({
          field_name: "chronic_conditions",
          value: c.value,
          invalid_evidence: c.evidence || null,
          reason: "Chronic condition evidence not found verbatim in transcript",
        });
      }
    }
  }

  // 7. Age Band
  let age_band: string | null = null;
  if (rawExtracted.age_band && rawExtracted.age_band.value) {
    total_fields++;
    if (verifyEvidence(rawTranscript, rawExtracted.age_band.evidence)) {
      age_band = String(rawExtracted.age_band.value).trim();
    } else {
      dropped_fields.push({
        field_name: "age_band",
        value: rawExtracted.age_band.value,
        invalid_evidence: rawExtracted.age_band.evidence || null,
        reason: "Age evidence not found verbatim in transcript",
      });
    }
  }

  // 8. Associated Symptoms
  const associated_symptoms: ExtractedEvidenceField[] = [];
  if (Array.isArray(rawExtracted.associated_symptoms)) {
    for (const a of rawExtracted.associated_symptoms) {
      if (!a || !a.value) continue;
      total_fields++;
      if (verifyEvidence(rawTranscript, a.evidence)) {
        associated_symptoms.push({
          value: String(a.value).trim(),
          evidence: a.evidence.trim(),
        });
      } else {
        dropped_fields.push({
          field_name: "associated_symptoms",
          value: a.value,
          invalid_evidence: a.evidence || null,
          reason: "Associated symptom evidence not found verbatim in transcript",
        });
      }
    }
  }

  // 9. Current Medications
  const current_medications: ExtractedEvidenceField[] = [];
  if (Array.isArray(rawExtracted.current_medications)) {
    for (const med of rawExtracted.current_medications) {
      if (!med || !med.value) continue;
      total_fields++;
      if (verifyEvidence(rawTranscript, med.evidence)) {
        current_medications.push({
          value: String(med.value).trim(),
          evidence: med.evidence.trim(),
        });
      } else {
        dropped_fields.push({
          field_name: "current_medications",
          value: med.value,
          invalid_evidence: med.evidence || null,
          reason: "Medication evidence not found verbatim in transcript",
        });
      }
    }
  }

  // 10. Allergies
  const allergies: ExtractedEvidenceField[] = [];
  if (Array.isArray(rawExtracted.allergies)) {
    for (const all of rawExtracted.allergies) {
      if (!all || !all.value) continue;
      total_fields++;
      if (verifyEvidence(rawTranscript, all.evidence)) {
        allergies.push({
          value: String(all.value).trim(),
          evidence: all.evidence.trim(),
        });
      } else {
        dropped_fields.push({
          field_name: "allergies",
          value: all.value,
          invalid_evidence: all.evidence || null,
          reason: "Allergy evidence not found verbatim in transcript",
        });
      }
    }
  }

  const droppedCount = dropped_fields.length;
  const droppedShare = total_fields > 0 ? droppedCount / total_fields : 0;

  return {
    chief_complaint,
    symptoms,
    severity,
    severity_inferred_as_moderate: severity_inferred,
    duration_bucket,
    duration_evidence,
    pregnancy,
    chronic_conditions,
    age_band,
    associated_symptoms,
    current_medications,
    allergies,
    dropped_fields,
    total_extracted_fields: total_fields,
    dropped_fields_count: droppedCount,
    dropped_share: droppedShare,
  };
}
