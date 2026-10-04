/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Opportunity Cost Engine: Debt Prepayment vs. Stock Market Compounding (S&P 500)
 */

import { Inputs, ScheduleRow } from './types.js';
import { generateMortgageSchedule, getPeriodsPerYear } from './math.js';

export interface OppCostPoint {
  month: number;
  year: number;
  dateLabel: string;
  prepayNetWorth: number;
  investNetWorth: number;
  prepayEquity: number;
  investEquity: number;
  prepayInvestBalance: number;
  investInvestBalance: number;
}

export interface OppCostSummary {
  crossoverMonth: number | null;
  crossoverYear: number | null;
  finalMonth: number;
  finalPrepayNetWorth: number;
  finalInvestNetWorth: number;
  deltaNetWorth: number; // invest - prepay (positive means investing won)
  recommendation: 'prepay' | 'invest' | 'neutral';
  recommendationMessage: string;
  points: OppCostPoint[];
}

export const calculateOpportunityCost = (
  inputs: Inputs,
  strategySchedule: ScheduleRow[]
): OppCostSummary => {
  const baseline = generateMortgageSchedule(inputs, true, false);
  const totalMonths = baseline.schedule.length;
  if (totalMonths === 0) {
    return {
      crossoverMonth: null,
      crossoverYear: null,
      finalMonth: 0,
      finalPrepayNetWorth: 0,
      finalInvestNetWorth: 0,
      deltaNetWorth: 0,
      recommendation: 'neutral',
      recommendationMessage: 'No loan schedule available for opportunity cost comparison.',
      points: []
    };
  }

  const investRate = Math.max(0, inputs.investRate || 7.0);
  const monthlyInvestRate = Math.pow(1 + investRate / 100, 1 / 12) - 1;
  const homePrice = Math.max(0, inputs.homePrice || 0);
  const monthlyExtra = Math.max(0, inputs.extraPayment || 0);

  let prepayInvestBal = 0;
  let investInvestBal = 0;
  let crossoverMonth: number | null = null;
  const points: OppCostPoint[] = [];

  const stratPpy = getPeriodsPerYear(inputs.frequency);
  const stratMap = new Map<number, ScheduleRow>();
  strategySchedule.forEach((r) => stratMap.set(r.period, r));

  const baseMap = new Map<number, ScheduleRow>();
  baseline.schedule.forEach((r) => baseMap.set(r.period, r));

  // Convert strategy installments to calendar months so both curves share one timeline
  const stratPayoffMonth =
    strategySchedule.length > 0
      ? Math.ceil((strategySchedule[strategySchedule.length - 1]!.period * 12) / stratPpy)
      : totalMonths;

  for (let m = 1; m <= totalMonths; m++) {
    const baseRow = baseMap.get(m);
    const stratRow = stratMap.get(Math.max(1, Math.round((m * stratPpy) / 12)));

    const baseBal = baseRow ? baseRow.balance : 0;
    const stratBal = m > stratPayoffMonth ? 0 : stratRow ? stratRow.balance : 0;

    const baseEquity = Math.max(0, homePrice - baseBal);
    const stratEquity = Math.max(0, homePrice - stratBal);

    // Strategy 2 (Invest): Extra monthly payment is invested into stock market
    investInvestBal = (investInvestBal + monthlyExtra) * (1 + monthlyInvestRate);

    // Strategy 1 (Prepay): Once mortgage is paid off, redirect the full mortgage payment into investments!
    if (m > stratPayoffMonth) {
      const redirectedCash = (baseRow?.payment || 0) + monthlyExtra;
      prepayInvestBal = (prepayInvestBal + redirectedCash) * (1 + monthlyInvestRate);
    } else {
      prepayInvestBal = prepayInvestBal * (1 + monthlyInvestRate);
    }

    const prepayNetWorth = Math.round((stratEquity + prepayInvestBal) * 100) / 100;
    const investNetWorth = Math.round((baseEquity + investInvestBal) * 100) / 100;

    if (crossoverMonth === null && investNetWorth > prepayNetWorth && m > 12) {
      crossoverMonth = m;
    }

    // Capture sampled points (every 6 months or key milestones)
    if (m === 1 || m % 12 === 0 || m === totalMonths || m === stratPayoffMonth) {
      points.push({
        month: m,
        year: Math.round((m / 12) * 10) / 10,
        dateLabel: baseRow?.dateLabel || `Month ${m}`,
        prepayNetWorth,
        investNetWorth,
        prepayEquity: Math.round(stratEquity * 100) / 100,
        investEquity: Math.round(baseEquity * 100) / 100,
        prepayInvestBalance: Math.round(prepayInvestBal * 100) / 100,
        investInvestBalance: Math.round(investInvestBal * 100) / 100
      });
    }
  }

  const finalPt = points[points.length - 1]!;
  const deltaNetWorth = Math.round((finalPt.investNetWorth - finalPt.prepayNetWorth) * 100) / 100;

  let recommendation: 'prepay' | 'invest' | 'neutral' = 'neutral';
  let recommendationMessage = '';

  if (deltaNetWorth > 15000) {
    recommendation = 'invest';
    recommendationMessage = `Market Compounding Advantage: Investing surplus cash at ${investRate}% yields an estimated $${deltaNetWorth.toLocaleString()} more net worth over the full timeline due to compound equity returns.`;
  } else if (deltaNetWorth < -15000) {
    recommendation = 'prepay';
    recommendationMessage = `Guaranteed Debt Paydown Advantage: Prepaying your mortgage at ${inputs.annualRate}% risk-free saves more guaranteed wealth than stock market projections after tax considerations.`;
  } else {
    recommendation = 'neutral';
    recommendationMessage = `Close Parity: Prepaying debt vs investing in index funds produces virtually identical net worth over ${Math.round(totalMonths / 12)} years. Choose based on your psychological risk tolerance.`;
  }

  return {
    crossoverMonth,
    crossoverYear: crossoverMonth ? Math.round((crossoverMonth / 12) * 10) / 10 : null,
    finalMonth: totalMonths,
    finalPrepayNetWorth: finalPt.prepayNetWorth,
    finalInvestNetWorth: finalPt.investNetWorth,
    deltaNetWorth,
    recommendation,
    recommendationMessage,
    points
  };
};
