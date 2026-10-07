import { describe, expect, it } from 'vitest';
import { getNiceTicks, formatCompactMoney, getThemeColors } from '../src/charts/mortgage-charts.js';

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
      expect(formatCompactMoney(200_000, 'US')).toBe('$200k');
      expect(formatCompactMoney(1_000_000, 'CA')).toBe('$1M');
      expect(formatCompactMoney(1_500_000, 'UK')).toBe('£1.5M');
    });
  });

  describe('getThemeColors', () => {
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
  });
});
