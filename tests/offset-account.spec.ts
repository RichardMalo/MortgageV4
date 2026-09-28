import { describe, it, expect } from 'vitest';
import { generateMortgageSchedule } from '../src/core/math.js';
import { Inputs } from '../src/core/types.js';

describe('AU/UK Mortgage Offset Account & Redraw Engine', () => {
  const baseInputs: Inputs = {
    homePrice: 600000,
    downPayment: 120000, // 480k principal
    ccBalance: 0,
    annualRate: 6.0,
    amortizationYears: 25,
    termYears: 5,
    compounding: 'monthly',
    frequency: 'monthly',
    extraPayment: 0,
    startDate: '2026-07-01',
    usePiti: false,
    taxRate: 0,
    insRate: 0,
    hoaRate: 0,
    pmiRate: 0,
    useOppCost: false,
    investRate: 0,
    rateShockEnabled: false,
    termRates: {},
    country: 'AU'
  };

  it('reduces interest and accelerates payoff when offset account has balance', () => {
    // 1. Without offset
    const withoutOffset = generateMortgageSchedule({ ...baseInputs, offsetBalance: 0 }, false);

    // 2. With $50,000 in offset account
    const withOffset = generateMortgageSchedule({ ...baseInputs, offsetBalance: 50000 }, false);

    // Total interest should be significantly less
    expect(withOffset.summary.totalInterest).toBeLessThan(withoutOffset.summary.totalInterest);
    expect(withOffset.summary.totalInterestSavedWithOffset).toBeGreaterThan(50000);

    // Loan should pay off earlier
    expect(withOffset.summary.periodsToPayoff).toBeLessThan(withoutOffset.summary.periodsToPayoff);

    // Check first period effective balance: 480,000 - 50,000 = 430,000
    const firstRow = withOffset.schedule[0]!;
    expect(firstRow.effectiveBalance).toBe(430000);
    // Interest is calculated on 430,000 instead of 480,000
    // Monthly rate = 6% / 12 = 0.5% -> 430,000 * 0.005 = 2150
    expect(firstRow.interest).toBeCloseTo(2150, 1);
  });

  it('models ongoing monthly deposits into the offset account', () => {
    const withGrowingOffset = generateMortgageSchedule(
      { ...baseInputs, offsetBalance: 20000, offsetMonthlyDeposit: 500 },
      false
    );

    // Check that offset balance grows over time
    const row1 = withGrowingOffset.schedule[0]!;
    const row24 = withGrowingOffset.schedule[23]!;
    expect(row1.offsetBalance).toBe(20000);
    expect(row24.offsetBalance).toBeGreaterThan(row1.offsetBalance);
    expect(withGrowingOffset.summary.totalInterestSavedWithOffset).toBeGreaterThan(30000);
  });
});
