import test from "node:test";
import assert from "node:assert/strict";
import { handleIntakeRequest } from "../../supabase/functions/intake/index.ts";

test("Canonical Intake Routes: CORS OPTIONS Preflight", async () => {
  const req = new Request("http://localhost:54321/intake/voice", {
    method: "OPTIONS",
  });
  const res = await handleIntakeRequest(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("Canonical Intake Routes: POST /intake/followup", async () => {
  const req = new Request("http://localhost:54321/intake/followup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: "test-sess-1",
      current_colour: "green",
      conversation_turns: [
        { speaker: "patient", transcript: "Pichhle 2 din se pet me dard hai" },
      ],
      asked_question_ids: [],
    }),
  });

  const res = await handleIntakeRequest(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.is_complete, false);
  assert.equal(data.turn_count, 1);
  assert.equal(data.max_turns, 3);
  assert.ok(data.next_question);
  assert.equal(data.red_flag_detected, false);
});

test("Canonical Intake Routes: POST /intake/followup Emergency Escalation", async () => {
  const req = new Request("http://localhost:54321/intake/followup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: "test-sess-emergency",
      current_colour: "green",
      conversation_turns: [
        { speaker: "patient", transcript: "Achanak seene me dard shuru ho gaya aur baaye hath me phail raha hai" },
      ],
      asked_question_ids: [],
    }),
  });

  const res = await handleIntakeRequest(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.red_flag_detected, true);
  assert.equal(data.immediate_alert_dispatched, true);
  assert.equal(data.escalated_colour, "red");
  assert.equal(data.is_complete, true);
});

test("Canonical Intake Routes: POST /intake/extract", async () => {
  const req = new Request("http://localhost:54321/intake/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: "test-sess-extract",
      colour: "yellow",
      full_transcript: "2 din se bukhar aur khansi hai. BP ki dawai lete hain.",
      patient_context: {
        age: 64,
        known_chronic_condition: true,
        pregnancy: false,
        waiting_minutes: 20,
      },
    }),
  });

  const res = await handleIntakeRequest(req);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.ok(data.draft_case_sheet);
  // Verify deterministic priority score is 74 (Yellow 50 + Age64 10 + Chronic 10 + Wait4 = 74)
  assert.equal(data.priority_score.total_score, 74);
  assert.equal(data.priority_score.breakdown.urgency_base, 50);
  assert.equal(data.priority_score.breakdown.vulnerability_age, 10);
  assert.equal(data.priority_score.breakdown.vulnerability_chronic, 10);
  assert.equal(data.priority_score.breakdown.wait_aging, 4);
});
