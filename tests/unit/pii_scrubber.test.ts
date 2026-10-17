import test from "node:test";
import assert from "node:assert/strict";
import { scrubPII } from "../../supabase/functions/_shared/ai/pii_scrubber.ts";

test("PII Scrubber: Redacts Indian Mobile Numbers", () => {
  const t1 = "Mera mobile number 9876543210 hai aur pet me dard hai";
  const r1 = scrubPII(t1);
  assert.equal(r1.hasRedactions, true);
  assert.ok(r1.redactedTypes.includes("phone"));
  assert.ok(!r1.scrubbedText.includes("9876543210"));
  assert.ok(r1.scrubbedText.includes("[PHONE_REDACTED]"));

  const t2 = "Please call +91-9812345678 or 09812345678 immediately";
  const r2 = scrubPII(t2);
  assert.ok(!r2.scrubbedText.includes("9812345678"));
});

test("PII Scrubber: Redacts 14-digit ABHA IDs", () => {
  const t1 = "My ABHA ID is 12-3456-7890-1234 and I take metformin";
  const r1 = scrubPII(t1);
  assert.equal(r1.hasRedactions, true);
  assert.ok(r1.redactedTypes.includes("abha_id"));
  assert.ok(!r1.scrubbedText.includes("12-3456-7890-1234"));
  assert.ok(r1.scrubbedText.includes("[ABHA_REDACTED]"));

  const t2 = "Patient ID 12345678901234 reports cold symptoms";
  const r2 = scrubPII(t2);
  assert.ok(!r2.scrubbedText.includes("12345678901234"));
});

test("PII Scrubber: Redacts Self-Introduced Names (English & Hindi)", () => {
  const t1 = "Hello doctor, my name is Rahul Sharma and I have a fever.";
  const r1 = scrubPII(t1);
  assert.equal(r1.hasRedactions, true);
  assert.ok(r1.redactedTypes.includes("name"));
  assert.ok(!r1.scrubbedText.includes("Rahul Sharma"));
  assert.ok(r1.scrubbedText.includes("[NAME_REDACTED]"));

  const t2 = "Mera naam Priya Singh hai aur kal se sir dard hai";
  const r2 = scrubPII(t2);
  assert.ok(!r2.scrubbedText.includes("Priya Singh"));

  const t3 = "मेरा नाम अमित कुमार है मुझे चक्कर आ रहे हैं";
  const r3 = scrubPII(t3);
  assert.ok(!r3.scrubbedText.includes("अमित कुमार"));
});

test("PII Scrubber: Leaves Clinical Details Intact", () => {
  const clinicalText = "2 din se tez bukhar hai, khansi me peela balgam aa raha hai aur BP ki dawai telmisartan 40mg lete hain";
  const result = scrubPII(clinicalText);
  assert.equal(result.hasRedactions, false);
  assert.equal(result.scrubbedText, clinicalText);
});
