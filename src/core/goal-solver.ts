/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Payoff Goal Solver (Inverse Binary Search Engine)
 *
 * Given a target payoff horizon in years, solves for:
 * 1. Exact monthly extra payment required (ceiling dollar precision)
 * 2. Exact one-time initial lump sum required
 */

import { Inputs } from './types.js';
import { generateMortgageSchedule } from './math.js';

export interface GoalSolverResult {
  targetYears: number;
  targetPeriods: number;
  baselinePeriods: number;
  baselineYears: number;
  requiredExtraMonthly: number;
  requiredLumpSum: number;
  isAchievable: boolean;
  interestSavedWithGoal: number;
  yearsSavedWithGoal: number;
}

export const solvePayoffGoal = (inputs: Inputs, targetYears: number): GoalSolverResult => {
  const safeTargetYears = Math.max(0.5, Math.min(50, targetYears));
  const periodsPerYear =
    inputs.frequency === 'semi-monthly'
      ? 24
      : inputs.frequency === 'bi-weekly' || inputs.frequency === 'accelerated-bi-weekly'
      ? 26
      : inputs.frequency === 'weekly' || inputs.frequency === 'accelerated-weekly'
      ? 52
      : 12;

  const targetPeriods = Math.round(safeTargetYears * periodsPerYear);

  // Run baseline
  const baseline = generateMortgageSchedule(inputs, true, true);
  const baselinePeriods = baseline.summary.periodsToPayoff;
  const baselineYears = Math.round((baselinePeriods / periodsPerYear) * 10) / 10;

  if (targetPeriods >= baselinePeriods) {
    return {
      targetYears: safeTargetYears,
      targetPeriods,
      baselinePeriods,
      baselineYears,
      requiredExtraMonthly: 0,
      requiredLumpSum: 0,
      isAchievable: true,
      interestSavedWithGoal: 0,
      yearsSavedWithGoal: 0
    };
  }

  // 1. Solve for extra monthly payment using 24-iteration binary search
  const principal = Math.max(0, inputs.homePrice - inputs.downPayment);
  let low = 0;
  let high = principal;
  let solvedExtra = 0;

  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const testInputs: Inputs = {
      ...inputs,
      extraPayment: mid,
      lumpSum: 0,
      lumpSums: []
    };
    const res = generateMortgageSchedule(testInputs, false, true);

    if (res.summary.periodsToPayoff <= targetPeriods && res.summary.paidOff) {
      solvedExtra = mid;
      high = mid; // Try smaller extra
    } else {
      low = mid; // Need more extra
    }
  }

  const requiredExtraMonthly = Math.ceil(solvedExtra);

  // 2. Solve for one-time upfront lump sum using 24-iteration binary search
  let lowLump = 0;
  let highLump = principal;
  let solvedLump = 0;

  for (let i = 0; i < 24; i++) {
    const mid = (lowLump + highLump) / 2;
    const testInputs: Inputs = {
      ...inputs,
      extraPayment: 0,
      lumpSum: mid,
      lumpSums: []
    };
    const res = generateMortgageSchedule(testInputs, false, true);

    if (res.summary.periodsToPayoff <= targetPeriods && res.summary.paidOff) {
      solvedLump = mid;
      highLump = mid;
    } else {
      lowLump = mid;
    }
  }

  const requiredLumpSum = Math.ceil(solvedLump);

  // Calculate interest saved with goal
  const goalSchedule = generateMortgageSchedule(
    { ...inputs, extraPayment: requiredExtraMonthly },
    false,
    true
  );
  const interestSaved = Math.max(
    0,
    baseline.summary.totalInterest - goalSchedule.summary.totalInterest
  );
  const yearsSaved = Math.max(0, baselineYears - safeTargetYears);

  return {
    targetYears: safeTargetYears,
    targetPeriods,
    baselinePeriods,
    baselineYears,
    requiredExtraMonthly,
    requiredLumpSum,
    isAchievable: requiredExtraMonthly > 0,
    interestSavedWithGoal: Math.round(interestSaved * 100) / 100,
    yearsSavedWithGoal: Math.round(yearsSaved * 10) / 10
  };
};
