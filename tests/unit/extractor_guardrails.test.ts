import test from "node:test";
import assert from "node:assert/strict";
import { GeminiClient } from "../../supabase/functions/_shared/ai/gemini_client.ts";
import { extractClinicalCaseSheet } from "../../supabase/functions/_shared/ai/extractor.ts";

test("Extractor Guardrails: Successful LLM Extraction with Grounded Evidence", async () => {
  const client = new GeminiClient();
  const transcript = "2 din se tez bukhar aur khansi hai. BP ki dawai lete hain.";

  // Mock Gemini returning valid JSON
  client.setMockProvider(async () => {
    return JSON.stringify({
      chief_complaint: { value: "fever", evidence: "tez bukhar" },
      symptoms: [
        { value: "fever", evidence: "tez bukhar" },
        { value: "cough", evidence: "khansi" },
      ],
      severity: 2,
      severity_evidence: "tez bukhar",
      duration_bucket: { value: "1-3d", evidence: "2 din se" },
      current_medications: [{ value: "antihypertensive", evidence: "BP ki dawai" }],
    });
  });

  const result = await extractClinicalCaseSheet(transcript, client);

  assert.equal(result.success, true);
  assert.equal(result.used_fallback, false);
  assert.equal(result.case_sheet.chief_complaint?.value, "fever");
  assert.equal(result.case_sheet.symptoms.length, 2);
  assert.equal(result.case_sheet.dropped_fields.length, 0);
  assert.ok(result.clinical_disclaimer.includes("never provides medical diagnoses"));
});

test("Extractor Guardrails: Hallucinated Field Missing Evidence is Dropped", async () => {
  const client = new GeminiClient();
  const transcript = "Mujhe kal se sir dard hai.";

  // Mock LLM hallucinating symptoms and medications not in transcript
  client.setMockProvider(async () => {
    return JSON.stringify({
      chief_complaint: { value: "headache", evidence: "sir dard" },
      symptoms: [
        { value: "headache", evidence: "sir dard" },
        { value: "migraine_with_aura", evidence: "severe flashing lights" }, // Hallucinated!
      ],
      current_medications: [
        { value: "aspirin", evidence: "aspirin 100mg" }, // Hallucinated!
      ],
    });
  });

  const result = await extractClinicalCaseSheet(transcript, client);

  assert.equal(result.case_sheet.chief_complaint?.value, "headache");
  assert.equal(result.case_sheet.symptoms.length, 1);
  assert.equal(result.case_sheet.current_medications.length, 0);
  assert.equal(result.case_sheet.dropped_fields.length, 2);
  assert.ok(result.case_sheet.dropped_share > 0);
});

test("Extractor Guardrails: Malformed JSON Triggers Rule-Based Fallback", async () => {
  const client = new GeminiClient();
  const transcript = "2 din se bukhar aur khansi hai";

  // Mock LLM returning malformed non-JSON
  client.setMockProvider(async () => {
    return "I am unable to parse this request due to safety filters: <<INVALID JSON>>";
  });

  const result = await extractClinicalCaseSheet(transcript, client);

  assert.equal(result.success, true);
  assert.equal(result.used_fallback, true);
  assert.ok(result.case_sheet.symptoms.some((s) => s.value === "fever"));
  assert.ok(result.case_sheet.symptoms.some((s) => s.value === "cough"));
  assert.equal(result.case_sheet.duration_bucket, "1-3d");
});

test("Extractor Guardrails: Network Error Triggers Rule-Based Fallback", async () => {
  const client = new GeminiClient();
  const transcript = "Pet dard hai subah se";

  // Mock LLM throwing error
  client.setMockProvider(async () => {
    throw new Error("Simulated upstream 503 Service Unavailable");
  });

  const result = await extractClinicalCaseSheet(transcript, client);

  assert.equal(result.success, true);
  assert.equal(result.used_fallback, true);
  assert.ok(result.case_sheet.symptoms.some((s) => s.value === "abdominal_pain"));
});
