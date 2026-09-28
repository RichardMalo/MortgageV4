import { describe, it, expect } from 'vitest';
import { calculateMultiDebtCascade } from '../src/core/math.js';
import { MultiDebtAccount } from '../src/core/types.js';

describe('Unified Household Debt Cascade (Avalanche vs Snowball)', () => {
  const debts: MultiDebtAccount[] = [
    { id: 'card-1', name: 'High-APR Card', balance: 12000, rate: 24.99, minPayment: 300 },
    { id: 'card-2', name: 'Low-APR Small Loan', balance: 2000, rate: 5.99, minPayment: 100 },
    { id: 'auto-1', name: 'Mid-Tier Auto Loan', balance: 15000, rate: 8.5, minPayment: 350 }
  ];

  it('proves mathematically that Avalanche pays less total interest than Snowball', () => {
    // Total minimums = 300 + 100 + 350 = 750. Budget = 1,200.
    const res = calculateMultiDebtCascade(debts, 1200);

    expect(res.avalanche.totalInterestPaid).toBeLessThan(res.snowball.totalInterestPaid);
    expect(res.avalanche.interestSavedVsMinimums).toBeGreaterThan(0);
    expect(res.snowball.interestSavedVsMinimums).toBeGreaterThan(0);

    // Avalanche targets High-APR Card (24.99%) first
    expect(res.avalanche.payoffOrder[0]).toBe('High-APR Card');

    // Snowball targets Low-APR Small Loan ($2,000 balance) first
    expect(res.snowball.payoffOrder[0]).toBe('Low-APR Small Loan');
  });

  it('calculates mortgage rollover benefits after consumer debts are extinguished', () => {
    const res = calculateMultiDebtCascade(debts, 1000, 'avalanche', true, 400000, 4.89);
    expect(res.mortgageRolloverInterestSaved).toBeGreaterThan(0);
    expect(res.mortgageRolloverMonthsSaved).toBeGreaterThan(0);
  });
});
