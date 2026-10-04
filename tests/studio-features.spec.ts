import { describe, it, expect } from 'vitest';
import {
  generateMortgageSchedule,
  resolveLumpSums,
  getPeriodsPerYear,
  calculateClosingTax,
  calculateCanadianLandTransferTax,
  calculateUkSdlt,
  calculateAustralianTransferDuty
} from '../src/core/math.js';
import { computeHeatmapGridSync, getHeatmapAxes } from '../src/core/heatmap-math.js';
import { calculateOpportunityCost } from '../src/core/opportunity-cost.js';
import { DEFAULT_INPUTS } from '../src/core/constants.js';
import { Inputs, LumpSumItem } from '../src/core/types.js';

describe('V4.0 Studio Features & Mathematical Engines', () => {
  describe('Lump Sum Scheduling & Frequency Projection', () => {
    it('correctly maps payment periods per year across frequencies', () => {
      expect(getPeriodsPerYear('monthly')).toBe(12);
      expect(getPeriodsPerYear('semi-monthly')).toBe(24);
      expect(getPeriodsPerYear('bi-weekly')).toBe(26);
      expect(getPeriodsPerYear('accelerated-bi-weekly')).toBe(26);
      expect(getPeriodsPerYear('weekly')).toBe(52);
      expect(getPeriodsPerYear('accelerated-weekly')).toBe(52);
    });

    it('anchors lump sum to calendar month regardless of frequency', () => {
      const lumpItems: LumpSumItem[] = [
        { id: 'l1', amount: 5000, paymentNumber: 12, atMonth: 12 }
      ];

      // Monthly: Month 12 is period 12
      const monthlyList = resolveLumpSums(lumpItems, 12, 300);
      expect(monthlyList.find((x) => x.paymentNumber === 12)?.amount).toBe(5000);

      // Bi-weekly (26/yr): Month 12 maps to period 25 (first bi-weekly installment of month 12)
      const biweeklyList = resolveLumpSums(lumpItems, 26, 650);
      expect(biweeklyList.find((x) => x.paymentNumber === 25)?.amount).toBe(5000);
    });

    it('expands recurring yearly lump sums across loan horizon', () => {
      const lumpItems: LumpSumItem[] = [
        { id: 'bonus', amount: 10000, paymentNumber: 12, atMonth: 12, repeatYearly: true }
      ];

      const monthlyList = resolveLumpSums(lumpItems, 12, 120);
      // In 120 months (10 years), should have 10 occurrences at months 12, 24, 36, 48, 60, 72, 84, 96, 108, 120
      expect(monthlyList.length).toBe(10);
      expect(monthlyList.find((x) => x.paymentNumber === 12)?.amount).toBe(10000);
      expect(monthlyList.find((x) => x.paymentNumber === 24)?.amount).toBe(10000);
      expect(monthlyList.find((x) => x.paymentNumber === 36)?.amount).toBe(10000);
      expect(monthlyList.find((x) => x.paymentNumber === 120)?.amount).toBe(10000);
    });

    it('accelerates loan payoff when recurring lump sums are applied', () => {
      const inputs: Inputs = {
        ...DEFAULT_INPUTS,
        homePrice: 500000,
        downPayment: 100000,
        annualRate: 5.0,
        amortizationYears: 25,
        extraPayment: 0,
        lumpSums: [
          { id: 'annual-bonus', amount: 5000, paymentNumber: 12, atMonth: 12, repeatYearly: true }
        ]
      };

      const baseline = generateMortgageSchedule(inputs, true, false);
      const strategy = generateMortgageSchedule(inputs, false, false);

      expect(strategy.summary.periodsToPayoff).toBeLessThan(baseline.summary.periodsToPayoff);
      expect(strategy.summary.totalInterest).toBeLessThan(baseline.summary.totalInterest);
      expect(baseline.summary.periodsToPayoff).toBe(300); // 25 years
      expect(strategy.summary.periodsToPayoff).toBeLessThan(240); // Shaved over 5 years
    });
  });

  describe('2D Strategy Sensitivity Heatmap Matrix', () => {
    it('generates consistent grid dimensions matching axes', () => {
      const axes = getHeatmapAxes('mortgage', 400000, 'monthly');
      expect(axes.monthly.length).toBeGreaterThan(3);
      expect(axes.lumpSum.length).toBeGreaterThan(3);

      const inputs: Inputs = {
        ...DEFAULT_INPUTS,
        homePrice: 500000,
        downPayment: 100000,
        annualRate: 5.0,
        amortizationYears: 25
      };

      const baseline = generateMortgageSchedule(inputs, true, false);
      const matrix = computeHeatmapGridSync('mortgage', inputs, 400000, baseline);

      expect(matrix.grid.length).toBe(axes.monthly.length);
      expect(matrix.grid[0].length).toBe(axes.lumpSum.length);
      expect(matrix.maxInterestSaved).toBeGreaterThan(0);
      expect(matrix.maxSaved).toBeGreaterThan(0);
    });

    it('demonstrates strictly increasing savings with higher monthly extra payments', () => {
      const inputs: Inputs = {
        ...DEFAULT_INPUTS,
        homePrice: 500000,
        downPayment: 100000,
        annualRate: 5.0,
        amortizationYears: 25
      };

      const baseline = generateMortgageSchedule(inputs, true, false);
      const matrix = computeHeatmapGridSync('mortgage', inputs, 400000, baseline);

      // Compare column 0 (no lump sum) across increasing monthly extra payments
      const col0Savings = matrix.grid.map((row) => row[0].interestSaved);
      for (let i = 1; i < col0Savings.length; i++) {
        expect(col0Savings[i]).toBeGreaterThanOrEqual(col0Savings[i - 1]);
      }
    });
  });

  describe('International Statutory Closing Taxes', () => {
    it('calculates Ontario Land Transfer Tax accurately with tiered brackets', () => {
      const res = calculateCanadianLandTransferTax(500000, 'ON', false, false);
      // Under $500,000 ON PLTT:
      // $55k @ 0.5% = $275
      // $195k @ 1.0% = $1950
      // $150k @ 1.5% = $2250
      // $100k @ 2.0% = $2000
      // Total = $6,475
      expect(res.totalLtt).toBe(6475);
      expect(res.firstTimeRebate).toBe(0);
    });

    it('applies City of Toronto Municipal Land Transfer Tax (MLTT) when in Toronto', () => {
      const resWithoutToronto = calculateCanadianLandTransferTax(500000, 'ON', false, false);
      const resToronto = calculateCanadianLandTransferTax(500000, 'ON', true, false);

      expect(resToronto.municipalLtt).toBe(resWithoutToronto.provincialLtt);
      expect(resToronto.totalLtt).toBe(resWithoutToronto.provincialLtt * 2);
    });

    it('applies Ontario first-time homebuyer rebate up to $4,000 maximum', () => {
      const res = calculateCanadianLandTransferTax(500000, 'ON', false, true);
      expect(res.firstTimeRebate).toBe(4000);
      expect(res.totalLtt).toBe(6475 - 4000);
    });

    it('calculates UK Stamp Duty Land Tax (SDLT)', () => {
      const res = calculateUkSdlt(400000, false, false);
      // Standard UK SDLT on £400,000:
      // £0 to £125k @ 0% = £0
      // £125k to £250k @ 2% = £2,500
      // £250k to £400k (£150k) @ 5% = £7,500
      // Total = £10,000
      expect(res.sdltAmount).toBe(10000);
    });

    it('applies UK Buy-to-Let / Second Home Surcharge (+5%)', () => {
      const resStandard = calculateUkSdlt(400000, false, false);
      const resSecondHome = calculateUkSdlt(400000, false, true);

      // Surcharge is 5% of purchase price = £20,000
      expect(resSecondHome.sdltAmount).toBe(resStandard.sdltAmount + 20000);
    });

    it('calculates Australian Transfer Duty (NSW)', () => {
      const res = calculateAustralianTransferDuty(600000, 'NSW', false);
      expect(res.transferDuty).toBeGreaterThan(15000);
    });

    it('unifies closing tax lookup through calculateClosingTax', () => {
      const caRes = calculateClosingTax(600000, 'CA', 'ON-TORONTO', false);
      expect(caRes.regionType).toBe('CA_LTT');
      expect(caRes.taxAmount).toBeGreaterThan(10000);

      const ukRes = calculateClosingTax(400000, 'UK', 'ENG', false);
      expect(ukRes.regionType).toBe('UK_SDLT');
      expect(ukRes.taxAmount).toBe(10000);

      const auRes = calculateClosingTax(700000, 'AU', 'VIC', false);
      expect(auRes.regionType).toBe('AU_DUTY');
      expect(auRes.taxAmount).toBeGreaterThan(20000);
    });
  });

  describe('Opportunity Cost Timeline Synchronization', () => {
    it('evaluates opportunity cost correctly under accelerated bi-weekly payment', () => {
      const inputs: Inputs = {
        ...DEFAULT_INPUTS,
        homePrice: 600000,
        downPayment: 120000,
        annualRate: 5.5,
        amortizationYears: 25,
        frequency: 'accelerated-bi-weekly',
        extraPayment: 200,
        investRate: 8.0
      };

      const strat = generateMortgageSchedule(inputs, false, false);
      const opp = calculateOpportunityCost(inputs, strat.schedule);

      expect(opp.points.length).toBeGreaterThan(10);
      expect(opp.finalInvestNetWorth).toBeGreaterThan(0);
      expect(opp.finalPrepayNetWorth).toBeGreaterThan(0);
      expect(opp.recommendation).toBeDefined();
    });
  });

  describe('Fractional Amortization & Term Handling', () => {
    it('supports decimal amortization years like 17.7 without truncation', () => {
      const inputs: Inputs = {
        ...DEFAULT_INPUTS,
        homePrice: 500000,
        downPayment: 100000,
        annualRate: 5.0,
        amortizationYears: 17.7,
        termYears: 5
      };

      const schedule = generateMortgageSchedule(inputs, true, false);
      // 17.7 years * 12 months/year = 212.4 months -> 213 payoff installments
      expect(schedule.schedule.length).toBe(213);
      expect(schedule.summary.paidOff).toBe(true);
    });
  });
});
