/**
 * Pure, deterministic priority score calculator.
 * Strictly adheres to the Swasthya Setu triage formula.
 * Zero external network calls.
 */

export type UrgencyColour = "green" | "yellow" | "red";

export interface PriorityInput {
  urgencyColour: UrgencyColour;
  hasModerateRedFlag?: boolean;
  age?: number | null;
  isPregnant?: boolean;
  hasChronicCondition?: boolean;
  waitingMinutes?: number;
}

export interface PriorityBreakdown {
  urgency_base: number;
  moderate_red_flag_bonus: number;
  vulnerability_age: number;
  vulnerability_pregnancy: number;
  vulnerability_chronic: number;
  wait_aging: number;
}

export interface PriorityResult {
  total_score: number;
  urgency_colour: UrgencyColour;
  breakdown: PriorityBreakdown;
}

/**
 * Formula:
 * GREEN = 20, YELLOW = 50 (RED = 100 for internal consistency)
 * moderate red-flag symptom = +30
 * age < 5 = +10
 * age >= 60 = +10
 * pregnancy = +10
 * known chronic condition = +10
 * waiting time = +1 per 5 minutes (Math.floor(minutes / 5))
 */
export function computePriorityScore(input: PriorityInput): PriorityResult {
  const colour = input.urgencyColour.toLowerCase() as UrgencyColour;

  let urgencyBase = 20;
  if (colour === "yellow") {
    urgencyBase = 50;
  } else if (colour === "red") {
    urgencyBase = 100;
  }

  const moderateBonus = input.hasModerateRedFlag ? 30 : 0;

  let vulnerabilityAge = 0;
  if (typeof input.age === "number" && !isNaN(input.age)) {
    if (input.age < 5 || input.age >= 60) {
      vulnerabilityAge = 10;
    }
  }

  const vulnerabilityPregnancy = input.isPregnant ? 10 : 0;
  const vulnerabilityChronic = input.hasChronicCondition ? 10 : 0;

  const minutes = Math.max(0, input.waitingMinutes || 0);
  const waitAging = Math.floor(minutes / 5);

  const totalScore =
    urgencyBase +
    moderateBonus +
    vulnerabilityAge +
    vulnerabilityPregnancy +
    vulnerabilityChronic +
    waitAging;

  return {
    total_score: totalScore,
    urgency_colour: colour,
    breakdown: {
      urgency_base: urgencyBase,
      moderate_red_flag_bonus: moderateBonus,
      vulnerability_age: vulnerabilityAge,
      vulnerability_pregnancy: vulnerabilityPregnancy,
      vulnerability_chronic: vulnerabilityChronic,
      wait_aging: waitAging,
    },
  };
}
