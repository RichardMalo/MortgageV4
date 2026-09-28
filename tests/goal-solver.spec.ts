import { describe, it, expect } from 'vitest';
import { solvePayoffGoal } from '../src/core/goal-solver.js';
import { DEFAULT_INPUTS } from '../src/core/constants.js';

describe('Payoff Goal Solver (Binary Search)', () => {
  it('solves exact extra monthly payment needed to pay off 25-yr mortgage in 15 yrs', () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      homePrice: 500000,
      downPayment: 100000, // 400k balance
      annualRate: 5.0,
      amortizationYears: 25,
      extraPayment: 0
    };

    const res = solvePayoffGoal(inputs, 15);
    expect(res.isAchievable).toBe(true);
    expect(res.requiredExtraMonthly).toBeGreaterThan(500);
    expect(res.requiredExtraMonthly).toBeLessThan(1200);
    expect(res.yearsSavedWithGoal).toBeCloseTo(10, 1);
    expect(res.interestSavedWithGoal).toBeGreaterThan(80000);
  });
});
