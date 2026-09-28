/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Visual Refinancing Rate-Ladder & Macro Scenarios Engine
 */

import { Inputs, MacroRatePreset } from './types.js';
import { MACRO_RATE_PRESETS } from './constants.js';

export interface RenewalStep {
  year: number;
  remainingYears: number;
  rate: number;
  rateDelta: number; // vs initial contract rate
}

export const getRenewalYears = (amortizationYears: number, termYears: number): number[] => {
  const safeAmort = Math.min(50, Math.max(1, amortizationYears));
  const safeTerm = Math.min(safeAmort, Math.max(1, termYears));
  if (safeTerm >= safeAmort) return [];

  const years: number[] = [];
  for (let y = safeTerm; y < safeAmort; y += safeTerm) {
    years.push(Math.round(y * 100) / 100);
  }
  return years;
};

export const applyMacroPresetToRates = (
  baseRate: number,
  amortizationYears: number,
  termYears: number,
  preset: MacroRatePreset
): Record<number, number> => {
  const years = getRenewalYears(amortizationYears, termYears);
  const termRates: Record<number, number> = {};

  if (preset === 'status-quo') {
    years.forEach((y) => {
      termRates[y] = baseRate;
    });
  } else if (preset === 'soft-landing') {
    // Progressive decrease: -1.0% at first renewal, -1.5% at second, etc. (floored at 2.0%)
    years.forEach((y, idx) => {
      const drop = Math.min(1.5, 0.75 * (idx + 1));
      termRates[y] = Math.max(2.0, Math.round((baseRate - drop) * 100) / 100);
    });
  } else if (preset === 'inflation-spike') {
    // Persistent rate spike: +2.0% at first renewal, +1.5% at second
    years.forEach((y, idx) => {
      const hike = idx === 0 ? 2.0 : 1.5;
      termRates[y] = Math.round((baseRate + hike) * 100) / 100;
    });
  }

  return termRates;
};

export const getRenewalLadder = (inputs: Inputs): RenewalStep[] => {
  const years = getRenewalYears(inputs.amortizationYears, inputs.termYears);
  const baseRate = inputs.annualRate;

  return years.map((y) => {
    const rate = inputs.termRates[y] !== undefined ? inputs.termRates[y]! : baseRate;
    return {
      year: y,
      remainingYears: inputs.amortizationYears - y,
      rate,
      rateDelta: Math.round((rate - baseRate) * 100) / 100
    };
  });
};
