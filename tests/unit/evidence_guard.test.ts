import test from "node:test";
import assert from "node:assert/strict";
import { guardExtractedData, verifyEvidence } from "../../supabase/functions/_shared/ai/evidence_guard.ts";

test("Evidence Guard: Verifies Verbatim Evidence in Transcript", () => {
  const transcript = "2 din se tez bukhar hai aur khansi aa rahi hai";
  assert.equal(verifyEvidence(transcript, "tez bukhar"), true);
  assert.equal(verifyEvidence(transcript, "2 din se"), true);
  assert.equal(verifyEvidence(transcript, "khansi"), true);
  assert.equal(verifyEvidence(transcript, "chest pain"), false);
});

test("Evidence Guard: Drops Hallucinated Fields Missing Evidence", () => {
  const transcript = "Mujhe sir dard ho raha hai subah se.";

  const rawExtracted = {
    chief_complaint: { value: "headache", evidence: "sir dard" },
    symptoms: [
      { value: "headache", evidence: "sir dard" },
      { value: "fever", evidence: "high fever" }, // Hallucination! Not in transcript!
    ],
    duration_bucket: { value: "1-6h", evidence: "subah se" },
    current_medications: [
      { value: "paracetamol", evidence: "paracetamol 500" }, // Hallucination!
    ],
  };

  const result = guardExtractedData(transcript, rawExtracted);

  // headache preserved
  assert.equal(result.chief_complaint?.value, "headache");
  assert.equal(result.symptoms.length, 1);
  assert.equal(result.symptoms[0].value, "headache");

  // fever and paracetamol dropped
  assert.equal(result.current_medications.length, 0);
  assert.equal(result.dropped_fields.length, 2);
  assert.ok(result.dropped_fields.some((d) => d.field_name === "symptoms" && d.value === "fever"));
  assert.ok(result.dropped_fields.some((d) => d.field_name === "current_medications" && d.value === "paracetamol"));
  assert.ok(result.dropped_share > 0);
});

test("Evidence Guard: Treats Unknown Severity as Moderate and Flags It", () => {
  const transcript = "Pet me dard hai";
  const rawExtracted = {
    chief_complaint: { value: "abdominal pain", evidence: "Pet me dard" },
    severity: null, // unknown
  };

  const result = guardExtractedData(transcript, rawExtracted);

  assert.equal(result.severity, 2); // defaults to moderate
  assert.equal(result.severity_inferred_as_moderate, true);
});

test("Evidence Guard: Validates Explicit Severity Evidence", () => {
  const transcript = "Doctor sahab seene me bohot halka sa dard hai";
  const rawExtracted = {
    chief_complaint: { value: "mild chest discomfort", evidence: "halka sa dard" },
    severity: 1,
    severity_evidence: "halka sa dard",
  };

  const result = guardExtractedData(transcript, rawExtracted);

  assert.equal(result.severity, 1);
  assert.equal(result.severity_inferred_as_moderate, false);
});
