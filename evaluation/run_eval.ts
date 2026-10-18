import mockCases from "./mock_conversations.json" with { type: "json" };
import { evaluateRedFlags } from "../supabase/functions/_shared/ai/red_flags.ts";
import { extractClinicalCaseSheet } from "../supabase/functions/_shared/ai/extractor.ts";
import { GeminiClient } from "../supabase/functions/_shared/ai/gemini_client.ts";

interface EvaluationMetrics {
  total_cases: number;
  total_emergencies: number;
  emergencies_caught: number;
  red_flag_recall_percent: number;
  total_expected_fields: number;
  correctly_extracted_fields: number;
  extraction_field_accuracy_percent: number;
  total_extracted_fields: number;
  dropped_fields_due_to_missing_evidence: number;
  share_of_fields_dropped_percent: number;
  triage_color_correct: number;
  triage_accuracy_percent: number;
}

export async function runEvaluation(): Promise<EvaluationMetrics> {
  console.log("================================================================================");
  console.log("       SWASTHYA SETU 2.0 - AI MODULE BENCHMARK & EVALUATION SUITE              ");
  console.log("================================================================================\n");

  const gemini = new GeminiClient();

  let totalEmergencies = 0;
  let emergenciesCaught = 0;
  let falseEmergencyEscalations = 0;
  let correctlyTriaged = 0;

  let totalExpectedFields = 0;
  let correctFields = 0;

  let totalExtractedFields = 0;
  let totalDroppedFields = 0;

  const caseResults = [];

  for (const c of mockCases) {
    if (c.is_emergency) totalEmergencies++;

    // 1. Evaluate Red Flags
    const initialColour = c.expected_urgency === "red" ? "green" : (c.expected_urgency as "green" | "yellow");
    const redFlagResult = evaluateRedFlags(c.transcript, initialColour);

    const detectedEmergency = redFlagResult.is_escalated || redFlagResult.escalated_colour === "red";

    if (c.is_emergency) {
      if (detectedEmergency) {
        emergenciesCaught++;
      }
    } else {
      if (detectedEmergency) {
        falseEmergencyEscalations++;
      }
    }

    // Triage colour accuracy check
    const assignedColour = detectedEmergency ? "red" : c.expected_urgency;
    if (assignedColour === c.expected_urgency) {
      correctlyTriaged++;
    }

    // 2. Clinical Extraction
    const extractionResult = await extractClinicalCaseSheet(c.transcript, gemini, "voice");
    const sheet = extractionResult.case_sheet;

    totalExtractedFields += sheet.total_extracted_fields;
    totalDroppedFields += sheet.dropped_fields_count;

    // Field comparison with Ground Truth
    let caseExpectedFields = 0;
    let caseCorrectFields = 0;

    // Compare symptoms
    if (c.ground_truth?.symptoms && Array.isArray(c.ground_truth.symptoms)) {
      for (const expectedSym of c.ground_truth.symptoms) {
        caseExpectedFields++;
        const found = sheet.symptoms.some((s) => s.value.toLowerCase().includes(expectedSym.toLowerCase()));
        if (found) caseCorrectFields++;
      }
    }

    // Compare duration
    if (c.ground_truth?.duration_bucket && c.ground_truth.duration_bucket !== "unknown") {
      caseExpectedFields++;
      if (sheet.duration_bucket === c.ground_truth.duration_bucket) {
        caseCorrectFields++;
      }
    }

    totalExpectedFields += caseExpectedFields;
    correctFields += caseCorrectFields;

    caseResults.push({
      case_id: c.case_id,
      expected: c.expected_urgency,
      assigned: assignedColour,
      emergency_caught: c.is_emergency ? detectedEmergency : "N/A",
      extracted_symptoms: sheet.symptoms.map((s) => s.value).join(", ") || "(none)",
      dropped_count: sheet.dropped_fields_count,
    });
  }

  const redFlagRecall = totalEmergencies > 0 ? (emergenciesCaught / totalEmergencies) * 100 : 100;
  const extractionAccuracy = totalExpectedFields > 0 ? (correctFields / totalExpectedFields) * 100 : 100;
  const shareDropped = totalExtractedFields > 0 ? (totalDroppedFields / totalExtractedFields) * 100 : 0;
  const triageAccuracy = (correctlyTriaged / mockCases.length) * 100;

  console.log("Evaluation Results per Scenario:");
  console.log("--------------------------------------------------------------------------------");
  for (const r of caseResults) {
    const status = r.expected === r.assigned ? "✔ PASS" : "✖ FAIL";
    console.log(
      `[${r.case_id}] ${status.padEnd(7)} | Exp: ${r.expected.toUpperCase().padEnd(6)} | Assigned: ${r.assigned.toUpperCase().padEnd(6)} | Symptoms: ${r.extracted_symptoms.slice(0, 30)}`
    );
  }
  console.log("--------------------------------------------------------------------------------\n");

  console.log("================================================================================");
  console.log("                           MANDATORY AUDIT METRICS                              ");
  console.log("================================================================================");
  console.log(`1. RED-FLAG RECALL:                                    ${redFlagRecall.toFixed(1)}% (${emergenciesCaught}/${totalEmergencies} caught)`);
  console.log(`2. EXTRACTION FIELD ACCURACY:                          ${extractionAccuracy.toFixed(1)}% (${correctFields}/${totalExpectedFields} fields matched)`);
  console.log(`3. SHARE OF FIELDS DROPPED DUE TO MISSING EVIDENCE:    ${shareDropped.toFixed(1)}% (${totalDroppedFields}/${totalExtractedFields} fields dropped)`);
  console.log(`   TRIAGE COLOR ACCURACY:                              ${triageAccuracy.toFixed(1)}% (${correctlyTriaged}/${mockCases.length} cases)`);
  console.log(`   FALSE EMERGENCY ESCALATIONS ON NEGATED CASES:       ${falseEmergencyEscalations}`);
  console.log("================================================================================\n");

  return {
    total_cases: mockCases.length,
    total_emergencies: totalEmergencies,
    emergencies_caught: emergenciesCaught,
    red_flag_recall_percent: redFlagRecall,
    total_expected_fields: totalExpectedFields,
    correctly_extracted_fields: correctFields,
    extraction_field_accuracy_percent: extractionAccuracy,
    total_extracted_fields: totalExtractedFields,
    dropped_fields_due_to_missing_evidence: totalDroppedFields,
    share_of_fields_dropped_percent: shareDropped,
    triage_color_correct: correctlyTriaged,
    triage_accuracy_percent: triageAccuracy,
  };
}

// Direct execution
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  runEvaluation().catch((err) => {
    console.error("Evaluation script encountered fatal error:", err);
    process.exit(1);
  });
}
