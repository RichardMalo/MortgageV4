import { describe, it, expect } from 'vitest';
import { runFinancialCopilot } from '../src/core/copilot.js';
import { generateMortgageSchedule } from '../src/core/math.js';
import { DEFAULT_INPUTS } from '../src/core/constants.js';

describe('Local AI Financial Copilot Engine', () => {
  it('detects Accelerated Bi-Weekly advantage when user is on Monthly', () => {
    const inputs = { ...DEFAULT_INPUTS, frequency: 'monthly' as const };
    const schedule = generateMortgageSchedule(inputs, false);
    const insights = runFinancialCopilot(inputs, schedule);

    const accBiWeekly = insights.find((i) => i.id === 'acc-biweekly');
    expect(accBiWeekly).toBeDefined();
    expect(accBiWeekly?.type).toBe('success');
    expect(accBiWeekly?.message).toContain('Accelerated Bi-Weekly');
  });

  it('detects 80% LTV PMI threshold when user is near target', () => {
    // 82% LTV ($820k balance on $1M home)
    const inputs = {
      ...DEFAULT_INPUTS,
      homePrice: 1000000,
      downPayment: 180000, // 820k
      usePiti: true,
      pmiRate: 0.6
    };
    const schedule = generateMortgageSchedule(inputs, false);
    const insights = runFinancialCopilot(inputs, schedule);

    const pmiInsight = insights.find((i) => i.id === 'pmi-drop');
    expect(pmiInsight).toBeDefined();
    expect(pmiInsight?.message).toContain('80% LTV');
  });
});
