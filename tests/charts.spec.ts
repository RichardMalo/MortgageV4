import { describe, expect, it } from 'vitest';
import {
  formatCompactMoney,
  getNiceTicks,
  getThemeColors,
  setPrintLightMode
} from '../src/charts/mortgage-charts.js';
import { computeInsights, INSIGHT_CHARTS } from '../src/charts/insight-charts.js';
import { analyzeMortgage } from '../src/core/mortgage.js';

describe('Chart Utilities', () => {
  describe('getNiceTicks', () => {
    it('generates friendly round ticks for $800,000', () => {
      const ticks = getNiceTicks(800_000, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(800_000);
      // Ticks should be evenly spaced
      const diff = ticks[1]! - ticks[0]!;
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]! - ticks[i - 1]!).toBe(diff);
      }
    });

    it('generates friendly round ticks for $60,000 cash flow', () => {
      const ticks = getNiceTicks(60_000, 5);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(60_000);
    });

    it('handles zero or negative max value', () => {
      const ticks = getNiceTicks(0);
      expect(ticks).toEqual([0]);
    });
  });

  describe('formatCompactMoney', () => {
    it('formats values in k and M', () => {
      expect(formatCompactMoney(0, 'CA')).toBe('$0');
      expect(formatCompactMoney(20_000, 'CA')).toBe('$20k');
      expect(formatCompactMoney(10_010, 'CA')).toBe('$10k');
      expect(formatCompactMoney(999_950, 'CA')).toBe('$1M');
      expect(formatCompactMoney(200_000, 'US')).toBe('$200k');
      expect(formatCompactMoney(1_000_000, 'CA')).toBe('$1M');
      expect(formatCompactMoney(1_500_000, 'UK')).toBe('£1.5M');
      expect(formatCompactMoney(-20_000, 'CA')).toBe('−$20k');
      expect(formatCompactMoney(-1_500_000, 'UK')).toBe('−£1.5M');
    });
  });

  describe('getThemeColors & setPrintLightMode', () => {
    it('returns a complete theme palette structure', () => {
      const colors = getThemeColors();
      expect(colors).toHaveProperty('textColor');
      expect(colors).toHaveProperty('mutedColor');
      expect(colors).toHaveProperty('gridColor');
      expect(colors).toHaveProperty('cardBg');
      expect(colors).toHaveProperty('accentColor');
      expect(colors).toHaveProperty('extraColor');
      expect(colors).toHaveProperty('principalColor');
      expect(colors).toHaveProperty('interestColor');
      expect(colors).toHaveProperty('baselineColor');
    });

    it('forces high-contrast light mode palette when setPrintLightMode(true) is active', () => {
      setPrintLightMode(true);
      try {
        const colors = getThemeColors();
        expect(colors.isDark).toBe(false);
        expect(colors.cardBg).toBe('#ffffff');
        expect(colors.textColor).toBe('#0f172a');
      } finally {
        setPrintLightMode(false);
      }
    });
  });

  describe('INSIGHT_CHARTS itemCount & tooltips', () => {
    it('provides keyboard itemCount for all 5 insight charts and warns on cap-exceeding strategies', () => {
      const ukAnalysis = analyzeMortgage({
        country: 'UK',
        homePrice: 500_000,
        downPayment: 100_000,
        annualRate: 8,
        amortizationYears: 20,
        frequency: 'monthly'
      });
      const data = computeInsights(ukAnalysis);

      Object.values(INSIGHT_CHARTS).forEach((chart) => {
        expect(chart.itemCount).toBeDefined();
        const count = chart.itemCount!(ukAnalysis, data);
        expect(count).toBeGreaterThan(0);
      });

      const overCapIdx = data.strategies.findIndex((s) => s.exceedsCap);
      expect(overCapIdx).toBeGreaterThanOrEqual(0);
      const tipHtml = INSIGHT_CHARTS.strategies.tooltip(overCapIdx, ukAnalysis, data);
      expect(tipHtml).toContain('penalty-free limit');
    });
  });
});
