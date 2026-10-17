import test from "node:test";
import assert from "node:assert/strict";
import { getNextFollowupQuestion } from "../../supabase/functions/_shared/ai/followup_manager.ts";
import questionBankConfig from "../../supabase/functions/_shared/ai/question_bank.json" with { type: "json" };

test("Follow-up Manager: Strict Maximum 3 Questions Ceiling", () => {
  const turns = [
    { speaker: "patient" as const, transcript: "Mujhe pichhle 2 din se sar me dard hai" },
  ];

  // Turn 1
  const d1 = getNextFollowupQuestion(turns, [], "green");
  assert.equal(d1.is_complete, false);
  assert.equal(d1.turn_count, 1);
  assert.ok(d1.next_question);

  // Turn 2
  const d2 = getNextFollowupQuestion(turns, [d1.next_question.question_id], "green");
  assert.equal(d2.is_complete, false);
  assert.equal(d2.turn_count, 2);
  assert.ok(d2.next_question);
  assert.notEqual(d2.next_question.question_id, d1.next_question.question_id);

  // Turn 3
  const d3 = getNextFollowupQuestion(
    turns,
    [d1.next_question.question_id, d2.next_question.question_id],
    "green"
  );
  assert.equal(d3.is_complete, false);
  assert.equal(d3.turn_count, 3);
  assert.ok(d3.next_question);

  // Turn 4 -> Reached MAX (3) -> Must be complete
  const d4 = getNextFollowupQuestion(
    turns,
    [d1.next_question.question_id, d2.next_question.question_id, d3.next_question.question_id],
    "green"
  );
  assert.equal(d4.is_complete, true);
  assert.equal(d4.next_question, null);
  assert.equal(d4.turn_count, 3);
});

test("Follow-up Manager: Red Emergency Dispatches Alert Immediately Without Waiting", () => {
  const emergencyTurns = [
    { speaker: "patient" as const, transcript: "Doctor sahab chhati me bahut tez dard ho raha hai aur paseena aa raha hai" },
  ];

  const decision = getNextFollowupQuestion(emergencyTurns, [], "green");

  assert.equal(decision.red_flag_detected, true);
  assert.equal(decision.immediate_alert_dispatched, true);
  assert.equal(decision.escalated_colour, "red");
  assert.equal(decision.is_complete, true);
  assert.equal(decision.next_question, null); // Emergency alert never waits for follow-ups!
});

test("Follow-up Manager: All Questions in Question Bank are Open-ended (No Yes/No)", () => {
  for (const q of questionBankConfig.questions) {
    // English questions should start with what, where, how, in what, etc.
    const enLower = q.en.toLowerCase();
    const isYesNoEn = /^(is|are|do you|did you|have you|can you|will you)\b/i.test(enLower) && !enLower.includes("what") && !enLower.includes("how");
    assert.equal(isYesNoEn, false, `Question ${q.question_id} appears to be a yes/no question: "${q.en}"`);
  }
});
