import { describe, expect, it } from 'vitest';
import { analyzeMortgage } from '../src/core/mortgage.js';
import {
  costOfWaiting,
  cumulativeAt,
  cumulativeInterest,
  extraPaymentSweep,
  niceStep,
  strategyLeaderboard,
  tippingPoint
} from '../src/core/scenarios.js';

describe('Scenario & Decision Math Engine', () => {
  const defaultAnalysis = analyzeMortgage({
    country: 'CA',
    homePrice: 770_000,
    downPayment: 154_000,
    annualRate: 5,
    amortizationYears: 25,
    frequency: 'monthly'
  });

  const strategyAnalysis = analyzeMortgage({
    country: 'CA',
    homePrice: 770_000,
    downPayment: 154_000,
    annualRate: 5,
    amortizationYears: 25,
    frequency: 'accelerated-bi-weekly',
    extraMonthly: 200,
    annualLumpSum: 2000
  });

  describe('niceStep', () => {
    it('picks clean human-friendly steps', () => {
      expect(niceStep(0)).toBe(10);
      expect(niceStep(32)).toBe(50);
      expect(niceStep(85)).toBe(100);
      expect(niceStep(210)).toBe(250);
      expect(niceStep(750)).toBe(1000);
    });
  });

  describe('extraPaymentSweep', () => {
    it('returns null if there is no loan', () => {
      const empty = analyzeMortgage({ homePrice: 0, downPayment: 0 });
      expect(extraPaymentSweep(empty)).toBeNull();
    });

    it('generates a monotonic interest savings curve with diminishing returns', () => {
      const sweep = extraPaymentSweep(defaultAnalysis, 20);
      expect(sweep).not.toBeNull();
      if (!sweep) return;

      expect(sweep.points.length).toBe(21);
      expect(sweep.points[0]?.extraMonthly).toBe(0);
      expect(sweep.points[0]?.interestSaved).toBe(0);

      // Interest saved should strictly increase with higher extra payments
      for (let i = 1; i < sweep.points.length; i++) {
        expect(sweep.points[i]!.interestSaved).toBeGreaterThan(sweep.points[i - 1]!.interestSaved);
        expect(sweep.points[i]!.monthsSaved).toBeGreaterThanOrEqual(sweep.points[i - 1]!.monthsSaved);
      }

      // Check current point matches baseline
      expect(sweep.current.extraMonthly).toBe(0);
      expect(sweep.current.interestSaved).toBe(0);
      expect(sweep.next.extraMonthly).toBe(100);
      expect(sweep.next.interestSaved).toBeGreaterThan(0);
    });

    it('identifies prepayment cap boundary for countries with caps', () => {
      const sweep = extraPaymentSweep(defaultAnalysis);
      expect(sweep).not.toBeNull();
      if (!sweep) return;
      // Canada has 20% prepaymentCap
      expect(sweep.capExtraMonthly).toBeGreaterThan(0);
    });

    it('computes perDollar efficiency when an extra payment is active', () => {
      const sweep = extraPaymentSweep(strategyAnalysis);
      expect(sweep).not.toBeNull();
      if (!sweep) return;
      expect(sweep.current.extraMonthly).toBe(200);
      expect(sweep.perDollar).toBeGreaterThan(0);
    });
  });

  describe('strategyLeaderboard', () => {
    it('returns empty array if no loan', () => {
      const empty = analyzeMortgage({ homePrice: 0, downPayment: 0 });
      expect(strategyLeaderboard(empty)).toEqual([]);
    });

    it('generates comparison strategies sorted descending by interest saved', () => {
      const list = strategyLeaderboard(defaultAnalysis);
      expect(list.length).toBeGreaterThanOrEqual(6);

      // Must be sorted descending by interestSaved
      for (let i = 1; i < list.length; i++) {
        expect(list[i - 1]!.interestSaved).toBeGreaterThanOrEqual(list[i]!.interestSaved);
      }

      // Must contain accelerated bi-weekly and payment increase options
      const ids = list.map((s) => s.id);
      expect(ids).toContain('accel-biweekly');
      expect(ids).toContain('inc-10');
      expect(ids).toContain('inc-25');
      expect(ids).toContain('inc-100');
      expect(ids).toContain('extra-100');
      expect(ids).toContain('extra-250');
      expect(ids).toContain('lump');

      // Each strategy should have a valid patch
      list.forEach((s) => {
        expect(s.patch).toBeDefined();
        expect(s.perDollar).toBeGreaterThan(0);
      });
    });

    it('includes user current plan tagged as isCurrent', () => {
      const list = strategyLeaderboard(strategyAnalysis);
      const current = list.find((s) => s.isCurrent);
      expect(current).toBeDefined();
      expect(current?.id).toBe('current');
      expect(current?.patch).toBeNull();
    });

    it('flags strategies that exceed regional penalty-free prepayment caps (e.g., UK 10% cap)', () => {
      const ukAnalysis = analyzeMortgage({
        country: 'UK',
        homePrice: 500_000,
        downPayment: 100_000,
        annualRate: 8,
        amortizationYears: 20,
        frequency: 'monthly'
      });
      const ukList = strategyLeaderboard(ukAnalysis);
      const doubleUp = ukList.find((s) => s.id === 'inc-100');
      expect(doubleUp).toBeDefined();
      // In UK at 8% over 20 years, doubling the monthly payment adds >10% of loan balance per year
      expect(doubleUp?.exceedsCap).toBe(true);

      // In US (no prepayment cap), no strategy should be flagged as exceeding cap
      const usAnalysis = analyzeMortgage({
        country: 'US',
        homePrice: 500_000,
        downPayment: 100_000,
        annualRate: 8,
        amortizationYears: 20,
        frequency: 'monthly'
      });
      const usList = strategyLeaderboard(usAnalysis);
      expect(usList.every((s) => !s.exceedsCap)).toBe(true);
    });

    it('always produces integer monthsSaved values across sweep, strategies, and waiting', () => {
      const sweep = extraPaymentSweep(strategyAnalysis, 10);
      sweep?.points.forEach((p) => {
        expect(Number.isInteger(p.monthsSaved)).toBe(true);
      });
      strategyLeaderboard(strategyAnalysis).forEach((s) => {
        expect(Number.isInteger(s.monthsSaved)).toBe(true);
      });
      costOfWaiting(strategyAnalysis).forEach((w) => {
        expect(Number.isInteger(w.monthsSaved)).toBe(true);
      });
    });
  });

  describe('cumulativeInterest & cumulativeAt', () => {
    it('computes running cumulative interest', () => {
      const cum = cumulativeInterest(defaultAnalysis.plan);
      expect(cum.years[0]).toBe(0);
      expect(cum.interest[0]).toBe(0);
      expect(cum.interest[cum.interest.length - 1]).toBe(defaultAnalysis.plan.totalInterest);

      // Cumulative interest must be monotonically non-decreasing
      for (let i = 1; i < cum.interest.length; i++) {
        expect(cum.interest[i]!).toBeGreaterThanOrEqual(cum.interest[i - 1]!);
      }
    });

    it('interpolates cumulative interest at any year mark accurately', () => {
      const cum = cumulativeInterest(defaultAnalysis.plan);
      const at0 = cumulativeAt(cum, 0);
      expect(at0).toBe(0);

      const at5 = cumulativeAt(cum, 5);
      expect(at5).toBeGreaterThan(0);
      expect(at5).toBeLessThan(defaultAnalysis.plan.totalInterest);

      // Past loan duration should plateau at total interest
      const pastEnd = cumulativeAt(cum, 50);
      expect(pastEnd).toBe(defaultAnalysis.plan.totalInterest);
    });
  });

  describe('tippingPoint', () => {
    it('detects when monthly principal exceeds interest and aligns crossYear, crossRowIndex, and crossDate', () => {
      const tip = tippingPoint(defaultAnalysis.plan, defaultAnalysis.inputs.startDate);
      expect(tip.series.length).toBeGreaterThan(0);
      expect(tip.crossYears).not.toBeNull();
      expect(tip.crossYear).not.toBeNull();
      expect(tip.crossRowIndex).not.toBeNull();
      expect(tip.crossDate).not.toBeNull();

      // For standard 25y mortgage at 5%, crossover usually happens around year 8-12
      expect(tip.crossYears!).toBeGreaterThan(1);
      expect(tip.crossYears!).toBeLessThan(25);
      expect(tip.crossYear).toBe(Math.ceil(tip.crossRowIndex! / defaultAnalysis.plan.periodsPerYear));

      // crossDate should match the exact payment row date at crossRowIndex
      const row = defaultAnalysis.plan.rows[tip.crossRowIndex! - 1];
      expect(row).toBeDefined();
      expect(tip.crossDate?.getTime()).toBe(row?.date.getTime());
    });

    it('pulls tipping point earlier with aggressive prepayment', () => {
      const baseTip = tippingPoint(defaultAnalysis.plan, defaultAnalysis.inputs.startDate);
      const stratTip = tippingPoint(strategyAnalysis.plan, strategyAnalysis.inputs.startDate);

      expect(stratTip.crossYears!).toBeLessThan(baseTip.crossYears!);
    });
  });

  describe('costOfWaiting', () => {
    it('returns empty array if no loan', () => {
      const empty = analyzeMortgage({ homePrice: 0, downPayment: 0 });
      expect(costOfWaiting(empty)).toEqual([]);
    });

    it('calculates increasing lost savings as delay increases', () => {
      const waiting = costOfWaiting(strategyAnalysis);
      expect(waiting.length).toBe(5); // 0, 1, 2, 3, 5 years

      expect(waiting[0]?.delayYears).toBe(0);
      expect(waiting[0]?.lostSavings).toBe(0);
      expect(waiting[0]?.interestSaved).toBe(strategyAnalysis.interestSaved);

      for (let i = 1; i < waiting.length; i++) {
        expect(waiting[i]!.lostSavings).toBeGreaterThan(waiting[i - 1]!.lostSavings);
        expect(waiting[i]!.interestSaved).toBeLessThan(waiting[i - 1]!.interestSaved);
      }
    });

    it('supports custom strategy override for example visualization', () => {
      const exampleWaiting = costOfWaiting(defaultAnalysis, [0, 1, 3], {
        frequency: 'monthly',
        extraMonthly: 150,
        annualLumpSum: 0,
        paymentIncrease: 0
      });
      expect(exampleWaiting.length).toBe(3);
      expect(exampleWaiting[0]!.interestSaved).toBeGreaterThan(0);
      expect(exampleWaiting[1]!.lostSavings).toBeGreaterThan(0);
    });
  });
});
