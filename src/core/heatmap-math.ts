/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * 2D Strategy Sensitivity Heatmap Calculation Engine
 *
 * Computes a 2D matrix evaluating dozens of strategy combinations:
 * Periodic Extra Surplus (Rows) vs. One-Time Lump Sums (Columns).
 * Completely headless & isolated for high performance.
 */

import { Inputs, ScheduleResult } from './types.js';
import { generateMortgageSchedule, generateCCSchedule, generateLoanSchedule } from './math.js';

export interface GridCell {
  monthly: number;
  lumpSum: number;
  yearsSaved: number;
  interestSaved: number;
  pctSaved: number;
}

export interface HeatmapMatrixResult {
  grid: GridCell[][];
  maxSaved: number;
  maxInterestSaved: number;
  axes: {
    monthly: number[];
    lumpSum: number[];
  };
}

/**
 * Determines row (extra payment) and column (lump sum) values dynamically,
 * adapting step intervals to match the active payment frequency and balance.
 */
export const getHeatmapAxes = (
  mode: 'mortgage' | 'cc' | 'loan' | 'portfolio' = 'mortgage',
  balance: number,
  frequency?: Inputs['frequency']
) => {
  const isMortgageOrLoan = mode === 'mortgage' || mode === 'loan' || mode === 'portfolio';
  const freq = isMortgageOrLoan ? (frequency ?? 'monthly') : 'monthly';

  if (mode === 'cc') {
    return {
      monthly: [0, 50, 100, 200, 300, 500],
      lumpSum: [0, 500, 1000, 2000, 5000, 10000].filter((v) => v <= balance + 1000)
    };
  } else if (mode === 'loan') {
    let loanSteps = [0, 50, 100, 250, 500, 1000];
    if (freq === 'weekly' || freq === 'accelerated-weekly') {
      loanSteps = [0, 15, 30, 60, 125, 250];
    } else if (freq === 'bi-weekly' || freq === 'accelerated-bi-weekly' || freq === 'semi-monthly') {
      loanSteps = [0, 25, 50, 125, 250, 500];
    }
    return {
      monthly: loanSteps,
      lumpSum: [0, 1000, 2500, 5000, 10000, 25000].filter((v) => v <= balance + 2000)
    };
  } else {
    let mortgageSteps = [0, 100, 250, 500, 750, 1000, 1500];
    if (freq === 'weekly' || freq === 'accelerated-weekly') {
      mortgageSteps = [0, 25, 60, 125, 185, 250, 375];
    } else if (freq === 'bi-weekly' || freq === 'accelerated-bi-weekly' || freq === 'semi-monthly') {
      mortgageSteps = [0, 50, 125, 250, 375, 500, 750];
    }
    return {
      monthly: mortgageSteps,
      lumpSum: [0, 5000, 10000, 20000, 35000, 50000].filter((v) => v <= Math.max(10000, balance * 0.5 + 5000))
    };
  }
};

/**
 * Pure calculation function to compute the 2D rate/term savings matrix.
 */
export const computeHeatmapGridSync = (
  mode: 'mortgage' | 'cc' | 'loan' | 'portfolio' = 'mortgage',
  inputs: Inputs,
  balance: number,
  baseData: ScheduleResult
): HeatmapMatrixResult => {
  const axes = getHeatmapAxes(mode, balance, inputs.frequency);
  const baselinePayoff = baseData.summary.periodsToPayoff;
  const periodsPerYear = baseData.summary.periodsPerYear || 12;
  const isBaselineFinite = Number.isFinite(baselinePayoff) && baseData.summary.paidOff;
  const baselineYears = isBaselineFinite ? baselinePayoff / periodsPerYear : 99;

  const grid: GridCell[][] = [];
  let maxSaved = 0;
  let maxInterestSaved = 0;

  for (let r = 0; r < axes.monthly.length; r++) {
    const monthlyExtra = axes.monthly[r] ?? 0;
    const row: GridCell[] = [];
    for (let c = 0; c < axes.lumpSum.length; c++) {
      const lumpSum = axes.lumpSum[c] ?? 0;

      const cellInputs: Inputs = {
        ...inputs,
        extraPayment: monthlyExtra,
        lumpSum: lumpSum
      };

      let res: ScheduleResult;
      if (mode === 'loan') {
        res = generateLoanSchedule(cellInputs, false);
      } else if (mode === 'cc') {
        res = generateCCSchedule(cellInputs, false);
      } else {
        res = generateMortgageSchedule(cellInputs, false, true);
      }

      const cellPayoff = res.summary.periodsToPayoff;
      const isCellFinite = Number.isFinite(cellPayoff) && res.summary.paidOff;
      const cellPeriodsPerYear = res.summary.periodsPerYear || 12;
      const cellYears = isCellFinite ? cellPayoff / cellPeriodsPerYear : 99;
      const yearsSaved =
        isBaselineFinite && isCellFinite ? Math.max(0, baselineYears - cellYears) : 0;
      const interestSaved =
        Number.isFinite(baseData.summary.totalInterest) &&
        Number.isFinite(res.summary.totalInterest)
          ? Math.max(0, baseData.summary.totalInterest - res.summary.totalInterest)
          : 0;
      const pctSaved =
        isBaselineFinite && baselineYears > 0 ? (yearsSaved / baselineYears) * 100 : 0;

      if (yearsSaved > maxSaved) {
        maxSaved = yearsSaved;
      }
      if (interestSaved > maxInterestSaved) {
        maxInterestSaved = interestSaved;
      }

      row.push({
        monthly: monthlyExtra,
        lumpSum,
        yearsSaved: Math.round(yearsSaved * 10) / 10,
        interestSaved: Math.round(interestSaved),
        pctSaved: Math.round(pctSaved)
      });
    }
    grid.push(row);
  }

  return { grid, maxSaved, maxInterestSaved, axes };
};
