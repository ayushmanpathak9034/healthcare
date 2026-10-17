import test from "node:test";
import assert from "node:assert/strict";
import { computePriorityScore } from "../../supabase/functions/_shared/ai/priority_score.ts";

test("Priority Score: Verified Example (Total = 74)", () => {
  const result = computePriorityScore({
    urgencyColour: "yellow",
    age: 64,
    hasChronicCondition: true,
    waitingMinutes: 20,
    hasModerateRedFlag: false,
    isPregnant: false,
  });

  assert.equal(result.total_score, 74);
  assert.deepEqual(result.breakdown, {
    urgency_base: 50,
    moderate_red_flag_bonus: 0,
    vulnerability_age: 10,
    vulnerability_pregnancy: 0,
    vulnerability_chronic: 10,
    wait_aging: 4,
  });
});

test("Priority Score: Green Baseline (Total = 20)", () => {
  const result = computePriorityScore({
    urgencyColour: "green",
    age: 30,
    waitingMinutes: 0,
  });

  assert.equal(result.total_score, 20);
  assert.equal(result.breakdown.urgency_base, 20);
  assert.equal(result.breakdown.vulnerability_age, 0);
  assert.equal(result.breakdown.wait_aging, 0);
});

test("Priority Score: Age Vulnerability Thresholds (<5 and >=60)", () => {
  // Child under 5
  const infant = computePriorityScore({ urgencyColour: "green", age: 3 });
  assert.equal(infant.breakdown.vulnerability_age, 10);

  // Boundary 4
  const age4 = computePriorityScore({ urgencyColour: "green", age: 4 });
  assert.equal(age4.breakdown.vulnerability_age, 10);

  // Boundary 5 (not eligible for age bonus)
  const age5 = computePriorityScore({ urgencyColour: "green", age: 5 });
  assert.equal(age5.breakdown.vulnerability_age, 0);

  // Boundary 59
  const age59 = computePriorityScore({ urgencyColour: "green", age: 59 });
  assert.equal(age59.breakdown.vulnerability_age, 0);

  // Boundary 60
  const age60 = computePriorityScore({ urgencyColour: "green", age: 60 });
  assert.equal(age60.breakdown.vulnerability_age, 10);

  // Senior 75
  const senior = computePriorityScore({ urgencyColour: "green", age: 75 });
  assert.equal(senior.breakdown.vulnerability_age, 10);
});

test("Priority Score: Pregnancy and Chronic Conditions", () => {
  const pregnant = computePriorityScore({
    urgencyColour: "green",
    age: 28,
    isPregnant: true,
  });
  assert.equal(pregnant.breakdown.vulnerability_pregnancy, 10);
  assert.equal(pregnant.total_score, 30);

  const chronic = computePriorityScore({
    urgencyColour: "green",
    age: 45,
    hasChronicCondition: true,
  });
  assert.equal(chronic.breakdown.vulnerability_chronic, 10);
  assert.equal(chronic.total_score, 30);

  const both = computePriorityScore({
    urgencyColour: "green",
    age: 32,
    isPregnant: true,
    hasChronicCondition: true,
  });
  assert.equal(both.breakdown.vulnerability_pregnancy, 10);
  assert.equal(both.breakdown.vulnerability_chronic, 10);
  assert.equal(both.total_score, 40);
});

test("Priority Score: Moderate Red-Flag Bonus (+30)", () => {
  const result = computePriorityScore({
    urgencyColour: "green",
    hasModerateRedFlag: true,
  });

  assert.equal(result.breakdown.moderate_red_flag_bonus, 30);
  assert.equal(result.total_score, 50);
});

test("Priority Score: Wait-Aging (+1 per 5 minutes)", () => {
  assert.equal(computePriorityScore({ urgencyColour: "green", waitingMinutes: 0 }).breakdown.wait_aging, 0);
  assert.equal(computePriorityScore({ urgencyColour: "green", waitingMinutes: 4 }).breakdown.wait_aging, 0);
  assert.equal(computePriorityScore({ urgencyColour: "green", waitingMinutes: 5 }).breakdown.wait_aging, 1);
  assert.equal(computePriorityScore({ urgencyColour: "green", waitingMinutes: 9 }).breakdown.wait_aging, 1);
  assert.equal(computePriorityScore({ urgencyColour: "green", waitingMinutes: 10 }).breakdown.wait_aging, 2);
  assert.equal(computePriorityScore({ urgencyColour: "green", waitingMinutes: 37 }).breakdown.wait_aging, 7);
});

test("Priority Score: Negative and Missing Inputs", () => {
  const result = computePriorityScore({
    urgencyColour: "yellow",
    waitingMinutes: -15,
    age: null,
  });

  assert.equal(result.breakdown.wait_aging, 0);
  assert.equal(result.breakdown.vulnerability_age, 0);
  assert.equal(result.total_score, 50);
});
