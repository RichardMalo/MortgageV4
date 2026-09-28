import { describe, it, expect } from 'vitest';
import {
  generateMortgageSchedule,
  generateCCSchedule,
  generateLoanSchedule,
  calculateCmhcInsurance,
  calculateCanadianMinDownPayment,
  calculateOsfiStressTestRate,
  calculateCanadianLandTransferTax,
  calculateUkSdlt,
  calculateAustralianTransferDuty,
  calculateClosingTax,
  calculateEffectiveApr,
  toMonthlyRate,
  toPeriodicRate,
  getMonthlyPayment,
  calculateMilestones
} from '../src/core/math.js';
import { Inputs } from '../src/core/types.js';

describe('MTGV4.0 Mathematical Engine Core', () => {
  it('calculates standard US mortgage payments correctly (nominal monthly compounding)', () => {
    const inputs: Inputs = {
      homePrice: 800000,
      downPayment: 160000,
      ccBalance: 0,
      annualRate: 4.39,
      amortizationYears: 30,
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
      termRates: {}
    };

    const result = generateMortgageSchedule(inputs, false);
    expect(result.schedule.length).toBe(360);
    const firstRow = result.schedule[0]!;
    expect(firstRow.payment).toBeCloseTo(3201.09, 1);
    expect(firstRow.interest).toBeCloseTo(2341.33, 1);
    expect(firstRow.principal).toBeCloseTo(859.76, 1);
  });

  it('calculates Canadian statutory mortgage compounding semi-annually correctly', () => {
    const inputs: Inputs = {
      homePrice: 800000,
      downPayment: 160000,
      ccBalance: 0,
      annualRate: 4.39,
      amortizationYears: 30,
      termYears: 5,
      compounding: 'semi',
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
      termRates: {}
    };

    const result = generateMortgageSchedule(inputs, false);
    expect(result.schedule.length).toBe(360);
    const firstRow = result.schedule[0]!;
    expect(firstRow.payment).toBeCloseTo(3186.14, 1);
    expect(firstRow.interest).toBeCloseTo(2320.22, 1);
    expect(firstRow.principal).toBeCloseTo(865.92, 1);
  });

  it('calculates Canadian Dec 15 2024 tiered minimum down payment accurately', () => {
    // Under 500k -> 5%
    const res1 = calculateCanadianMinDownPayment(400000);
    expect(res1.minDownPayment).toBe(20000);
    expect(res1.isCmhcEligible).toBe(true);

    // Exactly 500k -> 25k (5%)
    const res2 = calculateCanadianMinDownPayment(500000);
    expect(res2.minDownPayment).toBe(25000);
    expect(res2.isCmhcEligible).toBe(true);

    // $1,000,000 -> 25k + 10% of 500k = $75,000
    const res3 = calculateCanadianMinDownPayment(1000000);
    expect(res3.minDownPayment).toBe(75000);
    expect(res3.isCmhcEligible).toBe(true);

    // Over $1,500,000 -> 20% floor and CMHC prohibited
    const res4 = calculateCanadianMinDownPayment(2000000);
    expect(res4.minDownPayment).toBe(400000);
    expect(res4.isCmhcEligible).toBe(false);
  });

  it('calculates CMHC mortgage default insurance tiers and 30-year surcharge correctly', () => {
    // 90% LTV (10% down) on $600,000 -> 3.10%
    const cmhc1 = calculateCmhcInsurance(600000, 60000, 25, 'ON', true);
    expect(cmhc1.insuranceRate).toBe(0.031);
    expect(cmhc1.insuranceAmount).toBe(16740);
    expect(cmhc1.pstRate).toBe(0.08); // Ontario 8% PST
    expect(cmhc1.pstAmount).toBe(1339.2);
    expect(cmhc1.totalPrincipal).toBe(540000 + 16740);

    // 30-year amortization adds +0.20% surcharge
    const cmhc2 = calculateCmhcInsurance(600000, 60000, 30, 'ON', true);
    expect(cmhc2.insuranceRate).toBeCloseTo(0.033, 4);

    // Quebec 9.975% QST
    const cmhc3 = calculateCmhcInsurance(600000, 60000, 25, 'QC', true);
    expect(cmhc3.pstRate).toBe(0.09975);
    expect(cmhc3.pstAmount).toBe(Math.round(16740 * 0.09975 * 100) / 100);

    // Conventional (> 20% down) requires 0 CMHC
    const cmhcConv = calculateCmhcInsurance(600000, 150000, 25, 'ON', true);
    expect(cmhcConv.insuranceRate).toBe(0);
    expect(cmhcConv.insuranceAmount).toBe(0);
  });

  it('computes OSFI B-20 qualifying rate correctly', () => {
    // 4.5% + 2.0% = 6.5% (> 5.25% floor)
    expect(calculateOsfiStressTestRate(4.5)).toBe(6.5);
    // 2.5% + 2.0% = 4.5% (hits 5.25% floor)
    expect(calculateOsfiStressTestRate(2.5)).toBe(5.25);
  });

  it('solves TILA Effective APR using binary search IRR algorithm', () => {
    // $10,000 loan, 5% annual rate, 36 months, $200 fee
    const apr = calculateEffectiveApr(10000, 200, 5.0, 36);
    expect(apr).toBeGreaterThan(5.0);
    expect(apr).toBeCloseTo(6.38, 1);
  });

  it('calculates UK SDLT post-April 2025 schedules and First-Time Buyer relief', () => {
    // £400,000 standard purchase
    const standard = calculateUkSdlt(400000, false, false);
    // £125k @ 0% + £125k @ 2% (£2500) + £150k @ 5% (£7500) = £10,000
    expect(standard.sdltAmount).toBe(10000);

    // £400,000 first-time buyer
    // FTB: £300k @ 0% + £100k @ 5% = £5,000
    const ftb = calculateUkSdlt(400000, true, false);
    expect(ftb.sdltAmount).toBe(5000);
    expect(ftb.firstTimeBuyerRelief).toBe(5000);
  });

  it('calculates Australian State Transfer Duty for NSW and VIC with concessions', () => {
    // NSW $750,000 first home buyer -> full exemption
    const nswFtb = calculateAustralianTransferDuty(750000, 'NSW', true);
    expect(nswFtb.transferDuty).toBe(0);

    // VIC $550,000 first home buyer -> full exemption
    const vicFtb = calculateAustralianTransferDuty(550000, 'VIC', true);
    expect(vicFtb.transferDuty).toBe(0);
  });

  it('detects negative amortization and prevents runaway infinite loops', () => {
    const inputs: Inputs = {
      homePrice: 0,
      downPayment: 0,
      ccBalance: 5000,
      annualRate: 30, // 30% APR on credit card
      amortizationYears: 5,
      termYears: 5,
      compounding: 'monthly',
      frequency: 'monthly',
      extraPayment: 0,
      startDate: '2026-01-01',
      usePiti: false,
      taxRate: 0,
      insRate: 0,
      hoaRate: 0,
      pmiRate: 0,
      useOppCost: false,
      investRate: 0,
      rateShockEnabled: false,
      termRates: {},
      ccMinPercent: 1.0, // Insufficient minimum payment
      ccMinPrincipalPct: 0.1,
      ccMinFlat: 10
    };

    const result = generateCCSchedule(inputs, false);
    expect(result.summary.paidOff).toBe(false);
    expect(result.summary.payoffDate).toContain('Negative Amortization');
  });
});
