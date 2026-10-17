/**
 * Pure scoring function for triage prioritization.
 *
 * Rules:
 * - Base score: GREEN = 20, YELLOW = 50
 * - Moderate red-flag symptom: +30
 * - Age under 5 or 60 and above: +10
 * - Pregnancy: +10
 * - Chronic condition: +10
 * - Waiting time: +1 per 5 minutes waited
 *
 * Returns { total, breakdown }.
 */

export interface ScoringFactors {
  colour: 'GREEN' | 'YELLOW' | 'RED';
  hasModerateRedFlag?: boolean;
  age?: number;
  isPregnant?: boolean;
  hasChronicCondition?: boolean;
  waitingMinutes?: number;
}

export interface ScoreBreakdown {
  base: number;
  moderate_red_flag: number;
  age_risk: number;
  pregnancy: number;
  chronic_condition: number;
  wait_time: number;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
}

export function calculateScore(factors: ScoringFactors): ScoreResult {
  const breakdown: ScoreBreakdown = {
    base: 0,
    moderate_red_flag: 0,
    age_risk: 0,
    pregnancy: 0,
    chronic_condition: 0,
    wait_time: 0,
  };

  const colourUpper = factors.colour.toUpperCase();
  if (colourUpper === 'YELLOW') {
    breakdown.base = 50;
  } else if (colourUpper === 'RED') {
    breakdown.base = 90;
  } else {
    // Default GREEN
    breakdown.base = 20;
  }

  if (factors.hasModerateRedFlag) {
    breakdown.moderate_red_flag = 30;
  }

  if (factors.age !== undefined && (factors.age < 5 || factors.age >= 60)) {
    breakdown.age_risk = 10;
  }

  if (factors.isPregnant) {
    breakdown.pregnancy = 10;
  }

  if (factors.hasChronicCondition) {
    breakdown.chronic_condition = 10;
  }

  if (factors.waitingMinutes && factors.waitingMinutes > 0) {
    breakdown.wait_time = Math.floor(factors.waitingMinutes / 5);
  }

  const total =
    breakdown.base +
    breakdown.moderate_red_flag +
    breakdown.age_risk +
    breakdown.pregnancy +
    breakdown.chronic_condition +
    breakdown.wait_time;

  return { total, breakdown };
}
