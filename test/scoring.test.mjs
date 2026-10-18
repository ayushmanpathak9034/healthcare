import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScore } from '../server/scoring.ts';

test('Scoring: base scores for GREEN and YELLOW', () => {
  const green = calculateScore({ colour: 'GREEN' });
  assert.strictEqual(green.breakdown.base, 20);
  assert.strictEqual(green.total, 20);

  const yellow = calculateScore({ colour: 'YELLOW' });
  assert.strictEqual(yellow.breakdown.base, 50);
  assert.strictEqual(yellow.total, 50);
});

test('Scoring: moderate red-flag symptom adds +30', () => {
  const res = calculateScore({ colour: 'GREEN', hasModerateRedFlag: true });
  assert.strictEqual(res.breakdown.moderate_red_flag, 30);
  assert.strictEqual(res.total, 50);
});

test('Scoring: age risk under 5 and 60 or above adds +10', () => {
  const child = calculateScore({ colour: 'GREEN', age: 3 });
  assert.strictEqual(child.breakdown.age_risk, 10);
  assert.strictEqual(child.total, 30);

  const elder = calculateScore({ colour: 'GREEN', age: 60 });
  assert.strictEqual(elder.breakdown.age_risk, 10);
  assert.strictEqual(elder.total, 30);

  const mid = calculateScore({ colour: 'GREEN', age: 35 });
  assert.strictEqual(mid.breakdown.age_risk, 0);
  assert.strictEqual(mid.total, 20);
});

test('Scoring: pregnancy and chronic condition add +10 each', () => {
  const pregnant = calculateScore({ colour: 'GREEN', isPregnant: true });
  assert.strictEqual(pregnant.breakdown.pregnancy, 10);
  assert.strictEqual(pregnant.total, 30);

  const chronic = calculateScore({ colour: 'GREEN', hasChronicCondition: true });
  assert.strictEqual(chronic.breakdown.chronic_condition, 10);
  assert.strictEqual(chronic.total, 30);
});

test('Scoring: waiting time adds +1 per 5 minutes waited', () => {
  const wait4 = calculateScore({ colour: 'GREEN', waitingMinutes: 4 });
  assert.strictEqual(wait4.breakdown.wait_time, 0);

  const wait14 = calculateScore({ colour: 'GREEN', waitingMinutes: 14 });
  assert.strictEqual(wait14.breakdown.wait_time, 2);
  assert.strictEqual(wait14.total, 22);

  const wait25 = calculateScore({ colour: 'YELLOW', waitingMinutes: 25 });
  assert.strictEqual(wait25.breakdown.wait_time, 5);
  assert.strictEqual(wait25.total, 55);
});

test('Scoring: combined factors calculate correct total and breakdown', () => {
  const result = calculateScore({
    colour: 'YELLOW',
    hasModerateRedFlag: true,
    age: 65,
    isPregnant: false,
    hasChronicCondition: true,
    waitingMinutes: 22,
  });

  // Base 50 + RedFlag 30 + Age 10 + Chronic 10 + Wait 4 = 104
  assert.deepStrictEqual(result.breakdown, {
    base: 50,
    moderate_red_flag: 30,
    age_risk: 10,
    pregnancy: 0,
    chronic_condition: 10,
    wait_time: 4,
  });
  assert.strictEqual(result.total, 104);
});

