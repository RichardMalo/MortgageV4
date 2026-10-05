import { describe, expect, it } from 'vitest';
import {
  analyzeMortgage,
  annuityPayment,
  buildSchedule,
  canadianMinimumDown,
  cmhcPremiumRate,
  paymentDate,
  periodicRate,
  sanitizeInputs
} from '../src/core/mortgage';
import { DEFAULT_INPUTS } from '../src/core/regions';
import { MortgageInputs } from '../src/core/types';

const base = (patch: Partial<MortgageInputs> = {}): MortgageInputs => ({
  ...DEFAULT_INPUTS,
  startDate: '2026-01-01',
  ...patch
});

describe('payment formula', () => {
  it('matches the standard US 30-year example ($200k @ 6% → $1,199.10)', () => {
    const s = buildSchedule({
      principal: 200_000,
      annualRate: 6,
      compounding: 'monthly',
      years: 30,
      frequency: 'monthly',
      startDate: '2026-01-01'
    });
    expect(s.regularPayment).toBeCloseTo(1199.1, 2);
    expect(s.numPayments).toBe(360);
  });

  it('uses semi-annual compounding for Canada ($500k @ 5%, 25y → $2,908.02)', () => {
    const r = periodicRate(5, 'semi-annual', 12);
    expect(annuityPayment(500_000, r, 300)).toBeCloseTo(2908.02, 1);
  });

  it('handles a 0% rate', () => {
    const s = buildSchedule({
      principal: 120_000,
      annualRate: 0,
      compounding: 'monthly',
      years: 10,
      frequency: 'monthly',
      startDate: '2026-01-01'
    });
    expect(s.regularPayment).toBe(1000);
    expect(s.totalInterest).toBe(0);
    expect(s.numPayments).toBe(120);
  });

  it('repays exactly the principal (no rounding drift left over)', () => {
    const s = buildSchedule({
      principal: 437_123.45,
      annualRate: 5.37,
      compounding: 'semi-annual',
      years: 25,
      frequency: 'bi-weekly',
      startDate: '2026-01-01'
    });
    const repaid = s.rows.reduce((t, r) => t + r.principal + r.extra, 0);
    expect(repaid).toBeCloseTo(437_123.45, 1);
    expect(s.rows.at(-1)!.balance).toBe(0);
    expect(s.totalPaid).toBeCloseTo(437_123.45 + s.totalInterest, 1);
  });
});

describe('paying it off faster', () => {
  it('extra monthly payments save interest and time', () => {
    const a = analyzeMortgage(base({ extraMonthly: 300 }));
    expect(a.hasStrategy).toBe(true);
    expect(a.interestSaved).toBeGreaterThan(0);
    expect(a.monthsSaved).toBeGreaterThan(0);
    expect(a.plan.totalInterest).toBeLessThan(a.baseline.totalInterest);
  });

  it('accelerated bi-weekly pays off years sooner, measured in real time not payment counts', () => {
    const a = analyzeMortgage(base({ frequency: 'accelerated-bi-weekly' }));
    const planYears = a.plan.numPayments / 26;
    expect(planYears).toBeLessThan(25);
    expect(planYears).toBeGreaterThan(20);
    // Savings should be a few years, not "hundreds of periods".
    expect(a.monthsSaved).toBeGreaterThan(24);
    expect(a.monthsSaved).toBeLessThan(60);
  });

  it('regular (non-accelerated) bi-weekly costs about the same per month as monthly', () => {
    const a = analyzeMortgage(base({ frequency: 'bi-weekly' }));
    const monthly = analyzeMortgage(base());
    expect(Math.abs(a.monthlyEquivalent - monthly.monthlyEquivalent)).toBeLessThan(5);
    expect(a.monthsSaved).toBeLessThanOrEqual(1);
  });

  it('applies the annual lump sum once per loan year', () => {
    const s = buildSchedule({
      principal: 300_000,
      annualRate: 5,
      compounding: 'monthly',
      years: 25,
      frequency: 'monthly',
      startDate: '2026-01-01',
      annualLumpSum: 5000
    });
    const lumps = s.rows.filter((r) => r.extra >= 5000).map((r) => r.n);
    expect(lumps.slice(0, 3)).toEqual([12, 24, 36]);
  });

  it('no strategy → no savings reported', () => {
    const a = analyzeMortgage(base());
    expect(a.hasStrategy).toBe(false);
    expect(a.interestSaved).toBe(0);
    expect(a.monthsSaved).toBe(0);
  });
});

describe('Canada', () => {
  it('minimum down payment follows the Dec 2024 rules', () => {
    expect(canadianMinimumDown(400_000)).toBe(20_000);
    expect(canadianMinimumDown(800_000)).toBe(55_000);
    expect(canadianMinimumDown(1_499_999)).toBeCloseTo(124_999.9, 1);
    expect(canadianMinimumDown(2_000_000)).toBe(400_000);
  });

  it('CMHC premium tiers', () => {
    expect(cmhcPremiumRate(0.8, 25)).toBeNull();
    expect(cmhcPremiumRate(0.85, 25)).toBe(0.028);
    expect(cmhcPremiumRate(0.9, 25)).toBe(0.031);
    expect(cmhcPremiumRate(0.95, 25)).toBe(0.04);
    expect(cmhcPremiumRate(0.95, 30)).toBeCloseTo(0.042, 6);
    expect(cmhcPremiumRate(0.96, 25)).toBeNull();
  });

  it('adds the CMHC premium to the loan automatically with < 20% down', () => {
    const a = analyzeMortgage(base({ homePrice: 500_000, downPayment: 50_000 }));
    expect(a.insurance.kind).toBe('cmhc');
    expect(a.insurance.premium).toBeCloseTo(450_000 * 0.031, 2);
    expect(a.loanAmount).toBeCloseTo(450_000 * 1.031, 2);
  });

  it('no CMHC with 20% down', () => {
    const a = analyzeMortgage(base({ homePrice: 500_000, downPayment: 100_000 }));
    expect(a.insurance.kind).toBe('none');
    expect(a.loanAmount).toBe(400_000);
  });

  it('flags a down payment below the legal minimum', () => {
    const a = analyzeMortgage(base({ homePrice: 800_000, downPayment: 40_000 }));
    expect(a.notes.some((n) => n.level === 'error')).toBe(true);
  });
});

describe('United States', () => {
  it('charges PMI under 20% down and stops at 78% LTV', () => {
    const a = analyzeMortgage(
      base({ country: 'US', homePrice: 400_000, downPayment: 20_000, annualRate: 6.5, amortizationYears: 30, pmiRate: 0.5 })
    );
    expect(a.insurance.kind).toBe('pmi');
    expect(a.insurance.pmiMonthly).toBeCloseTo((380_000 * 0.005) / 12, 2);
    expect(a.insurance.pmiEndDate).not.toBeNull();
    expect(a.insurance.pmiTotal).toBeGreaterThan(0);
    // PMI must be included in the monthly housing cost.
    expect(a.monthlyHousingCost).toBeCloseTo(a.monthlyEquivalent + a.insurance.pmiMonthly, 2);
  });

  it('no PMI at 20% down, and no CMHC outside Canada', () => {
    const a = analyzeMortgage(base({ country: 'US', homePrice: 400_000, downPayment: 80_000 }));
    expect(a.insurance.kind).toBe('none');
    const uk = analyzeMortgage(base({ country: 'UK', homePrice: 400_000, downPayment: 20_000 }));
    expect(uk.insurance.kind).toBe('none');
    expect(uk.loanAmount).toBe(380_000);
  });
});

describe('existing mortgage mode', () => {
  it('uses the current balance and skips insurance', () => {
    const a = analyzeMortgage(base({ mode: 'existing', currentBalance: 250_000, amortizationYears: 18 }));
    expect(a.loanAmount).toBe(250_000);
    expect(a.insurance.kind).toBe('none');
    expect(a.plan.numPayments).toBe(216);
  });
});

describe('housing costs', () => {
  it('adds tax, insurance and fees to the monthly cost but not to the loan', () => {
    const a = analyzeMortgage(base({ propertyTaxYearly: 6000, homeInsuranceYearly: 1200, feesMonthly: 300 }));
    const plain = analyzeMortgage(base());
    expect(a.monthlyHousingCost).toBeCloseTo(a.monthlyEquivalent + 500 + 100 + 300, 2);
    expect(a.plan.totalInterest).toBe(plain.plan.totalInterest);
  });

  it('a zero entered by the user stays zero', () => {
    const a = analyzeMortgage(base({ propertyTaxYearly: 0, pmiRate: 0, country: 'US', downPayment: 20_000 }));
    expect(a.inputs.propertyTaxYearly).toBe(0);
    expect(a.insurance.kind).toBe('none');
  });
});

describe('inputs and dates', () => {
  it('sanitizes bad values', () => {
    const s = sanitizeInputs({ homePrice: -5, downPayment: 1e12, annualRate: NaN, amortizationYears: 99, frequency: 'daily' as never });
    expect(s.homePrice).toBe(0);
    expect(s.downPayment).toBe(0);
    expect(s.annualRate).toBe(DEFAULT_INPUTS.annualRate);
    expect(s.amortizationYears).toBe(40);
    expect(s.frequency).toBe('monthly');
  });

  it('clamps month-end dates instead of overflowing', () => {
    const start = new Date(2026, 0, 31);
    expect(paymentDate(start, 2, 'monthly').getMonth()).toBe(1); // Feb, not Mar
    expect(paymentDate(start, 2, 'monthly').getDate()).toBe(28);
    expect(paymentDate(start, 3, 'monthly').getDate()).toBe(31);
  });

  it('bi-weekly dates advance 14 days', () => {
    const start = new Date(2026, 0, 1);
    expect(paymentDate(start, 2, 'bi-weekly').getDate()).toBe(15);
  });

  it('payoff date reflects the plan', () => {
    const a = analyzeMortgage(base({ amortizationYears: 25 }));
    expect(a.plan.payoffDate!.getFullYear()).toBe(2050);
    expect(a.plan.payoffDate!.getMonth()).toBe(11);
  });
});
