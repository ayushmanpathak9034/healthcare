import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRedFlags, checkModerateConcern } from "../../supabase/functions/_shared/ai/red_flags.ts";

test("Red Flags: English Emergency Escalation", () => {
  const result = evaluateRedFlags("The patient is experiencing sudden severe chest pain and left arm numbness.", "green");
  assert.equal(result.is_escalated, true);
  assert.equal(result.escalated_colour, "red");
  assert.equal(result.matched_type, "chest_pain");
  assert.equal(result.immediate_alert, true);
  assert.ok(result.required_resources.includes("ecg"));
});

test("Red Flags: Hinglish Emergency Escalation", () => {
  const result = evaluateRedFlags("Khet me kaam karte waqt saanp ne kaat liya hai", "green");
  assert.equal(result.is_escalated, true);
  assert.equal(result.escalated_colour, "red");
  assert.equal(result.matched_type, "snakebite");
  assert.equal(result.immediate_alert, true);
  assert.ok(result.required_resources.includes("asv"));
});

test("Red Flags: Devanagari Emergency Escalation", () => {
  const result = evaluateRedFlags("मरीज बेहोश हो गया है और सांस लेने में तकलीफ हो रही है", "yellow");
  assert.equal(result.is_escalated, true);
  assert.equal(result.escalated_colour, "red");
  assert.equal(result.immediate_alert, true);
});

test("Red Flags: Negation in English ('no chest pain')", () => {
  const result = evaluateRedFlags("Patient has mild headache and acidity, but no chest pain at all.", "green");
  assert.equal(result.is_escalated, false);
  assert.equal(result.escalated_colour, "green");
  assert.equal(result.immediate_alert, false);
});

test("Red Flags: Negation with 'denies'", () => {
  const result = evaluateRedFlags("Patient presents with knee pain, denies shortness of breath or dizziness.", "green");
  assert.equal(result.is_escalated, false);
  assert.equal(result.escalated_colour, "green");
});

test("Red Flags: Negation in Hinglish ('chhati me dard nahi hai')", () => {
  const result = evaluateRedFlags("Gale me kharash hai lekin chhati me dard nahi hai", "green");
  assert.equal(result.is_escalated, false);
  assert.equal(result.escalated_colour, "green");
  assert.equal(result.immediate_alert, false);
});

test("Red Flags: Negation in Devanagari ('छाती में दर्द नहीं है')", () => {
  const result = evaluateRedFlags("हल्की खांसी है पर सीने में दर्द नहीं है", "green");
  assert.equal(result.is_escalated, false);
  assert.equal(result.escalated_colour, "green");
});

test("Red Flags: Invariant - Urgent / Red Cannot Be Downgraded", () => {
  // If already RED, a benign input must NEVER downgrade to GREEN or YELLOW
  const result = evaluateRedFlags("Main bilkul theek mehsoos kar raha hoon ab, bas thakan hai", "red");
  assert.equal(result.is_escalated, false);
  assert.equal(result.escalated_colour, "red");
  assert.equal(result.immediate_alert, true);
});

test("Red Flags: Stroke Signs Escalation", () => {
  const result = evaluateRedFlags("Unka chehra tedha ho gaya hai aur bolne me ladkhadahat hai", "yellow");
  assert.equal(result.is_escalated, true);
  assert.equal(result.escalated_colour, "red");
  assert.equal(result.matched_type, "stroke_signs");
});

test("Red Flags: Moderate Concern Detection (+30 bonus)", () => {
  assert.equal(checkModerateConcern("Pichhle 2 din se bukhar aur saans lene me takleef hai"), true);
  assert.equal(checkModerateConcern("Mera sir dard kar raha hai"), false);
  assert.equal(checkModerateConcern("bukhar aur saans lene me takleef nahi hai"), false);
});
