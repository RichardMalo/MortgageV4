/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Local Rule-Based "AI Financial Copilot" Engine
 *
 * Runs 100% locally on the client machine. Detects high-leverage mathematical
 * opportunities, regulatory thresholds, and debt traps in real-time.
 */

import { Inputs, ScheduleResult, CopilotInsight } from './types.js';
import { generateMortgageSchedule } from './math.js';
import { formatCurrency } from './formatters.js';

export const runFinancialCopilot = (
  inputs: Inputs,
  currentSchedule: ScheduleResult
): CopilotInsight[] => {
  const insights: CopilotInsight[] = [];
  const homePrice = inputs.homePrice || 0;
  const downPayment = inputs.downPayment || 0;
  const currentPrincipal = homePrice - downPayment;
  const summary = currentSchedule.summary;

  // 1. Negative Amortization Critical Alert
  if (!summary.paidOff) {
    insights.push({
      id: 'neg-amort',
      type: 'critical',
      title: 'Runaway Negative Amortization Warning',
      message:
        'At this interest rate and payment level, your installment cannot cover the monthly accrued interest. Your debt balance is growing toward infinity.',
      metric: 'Indefinite Debt',
      actionText: 'Increase Monthly Target'
    });
    return insights;
  }

  // 2. Accelerated Bi-Weekly Paydown Advantage
  if (inputs.frequency === 'monthly' && summary.periodsToPayoff > 60) {
    const accSchedule = generateMortgageSchedule(
      { ...inputs, frequency: 'accelerated-bi-weekly' },
      false,
      true
    );
    const monthsSaved = Math.round(
      (summary.periodsToPayoff - (accSchedule.summary.periodsToPayoff * 12) / 26)
    );
    const yearsSaved = Math.round((monthsSaved / 12) * 10) / 10;
    const interestSaved = Math.max(0, summary.totalInterest - accSchedule.summary.totalInterest);

    if (yearsSaved >= 1.5 && interestSaved > 5000) {
      insights.push({
        id: 'acc-biweekly',
        type: 'success',
        title: 'Accelerated Bi-Weekly Advantage',
        message: `Switching from Monthly to Accelerated Bi-Weekly automatically makes the equivalent of 1 full extra payment per year, shaving ${yearsSaved} years and saving ${formatCurrency(interestSaved, inputs.country)} in pure interest with zero lifestyle friction.`,
        metric: `-${yearsSaved} Years`,
        actionText: 'Switch to Accelerated Bi-Weekly',
        actionPayload: { frequency: 'accelerated-bi-weekly' }
      });
    }
  }

  // 3. Round-Up Power (Tactile Quick Win)
  const currentMonthlyExtra = inputs.extraPayment || 0;
  if (currentMonthlyExtra < 100 && currentPrincipal > 100000) {
    const roundUpExtra = 100;
    const roundUpSchedule = generateMortgageSchedule(
      { ...inputs, extraPayment: roundUpExtra },
      false,
      true
    );
    const interestSaved = Math.max(0, summary.totalInterest - roundUpSchedule.summary.totalInterest);
    const periodsSaved = Math.max(0, summary.periodsToPayoff - roundUpSchedule.summary.periodsToPayoff);
    const yearsSaved = Math.round((periodsSaved / 12) * 10) / 10;

    if (interestSaved > 8000) {
      insights.push({
        id: 'round-up',
        type: 'tip',
        title: 'Micro-Surplus Leverage (+ $100/mo)',
        message: `Adding just $100/month in discretionary extra principal eliminates ${periodsSaved} payments (${yearsSaved} years) and saves ${formatCurrency(interestSaved, inputs.country)} in bank interest.`,
        metric: `Save ${formatCurrency(interestSaved, inputs.country)}`,
        actionText: 'Apply +$100/mo Extra',
        actionPayload: { extraPayment: 100 }
      });
    }
  }

  // 4. US Private Mortgage Insurance (PMI) Drop Milestone
  if (inputs.usePiti && inputs.pmiRate > 0 && homePrice > 0) {
    const ltvThreshold = homePrice * 0.8;
    if (currentPrincipal > ltvThreshold) {
      const dollarsToDrop = Math.max(0, Math.round(currentPrincipal - ltvThreshold));
      const monthlyPmiCost = Math.round((currentPrincipal * (inputs.pmiRate / 100)) / 12);

      insights.push({
        id: 'pmi-drop',
        type: 'tip',
        title: '80% LTV PMI Eradication Horizon',
        message: `You are $${dollarsToDrop.toLocaleString()} away from the statutory 80% LTV threshold. Hitting this mark drops your private mortgage insurance and frees up ~$${monthlyPmiCost}/month in cash flow.`,
        metric: `$${dollarsToDrop.toLocaleString()} to 80% LTV`,
        actionText: 'View Milestone Timeline'
      });
    }
  }

  // 5. AU/UK Mortgage Offset Account Leverage
  const offsetBal = inputs.offsetBalance || 0;
  if (offsetBal === 0 && (inputs.country === 'AU' || inputs.country === 'UK' || inputs.country === 'monthly-au' || inputs.country === 'monthly-uk')) {
    const sampleOffset = 25000;
    const offsetSim = generateMortgageSchedule(
      { ...inputs, offsetBalance: sampleOffset },
      false,
      true
    );
    const interestSaved = Math.max(0, summary.totalInterest - offsetSim.summary.totalInterest);
    if (interestSaved > 10000) {
      insights.push({
        id: 'offset-opp',
        type: 'success',
        title: 'Mortgage Offset Account Opportunity',
        message: `In ${inputs.country === 'AU' || inputs.country === 'monthly-au' ? 'Australia' : 'the UK'}, linking $25,000 of liquid emergency cash to an Offset Account saves ${formatCurrency(interestSaved, inputs.country)} in interest while preserving 100% immediate withdrawal access.`,
        metric: `Save ${formatCurrency(interestSaved, inputs.country)}`,
        actionText: 'Model Offset Account',
        actionPayload: { offsetBalance: sampleOffset }
      });
    }
  }

  // 6. High-APR Revolving Debt Priority (Household Cascade)
  if (inputs.householdDebts && inputs.householdDebts.length > 0) {
    const highAprDebt = inputs.householdDebts.find((d) => d.rate >= 18 && d.balance > 1000);
    if (highAprDebt && inputs.extraPayment > 0) {
      insights.push({
        id: 'cascade-priority',
        type: 'warning',
        title: 'Household Balance Sheet Mismatch',
        message: `You are prepaying a ${inputs.annualRate}% mortgage while carrying ${highAprDebt.name} at ${highAprDebt.rate}% APR. Prioritizing your credit card under the Debt Avalanche mathematically saves far more guaranteed cash.`,
        metric: `${highAprDebt.rate}% vs ${inputs.annualRate}% APR`,
        actionText: 'Switch to Household Debt Cascade'
      });
    }
  }

  // 7. Refinancing Renewal Rate Shock Preparedness
  if (!inputs.rateShockEnabled && inputs.termYears > 0 && inputs.termYears < inputs.amortizationYears) {
    const rateShockInputs: Inputs = {
      ...inputs,
      rateShockEnabled: true,
      termRates: { [inputs.termYears]: inputs.annualRate + 2.0 }
    };
    const shockSchedule = generateMortgageSchedule(rateShockInputs, false, true);
    const extraInterest = Math.max(0, shockSchedule.summary.totalInterest - summary.totalInterest);

    if (extraInterest > 12000) {
      insights.push({
        id: 'rate-shock-warn',
        type: 'tip',
        title: '5-Year Renewal Stress Simulation',
        message: `If interest rates jump +2.00% at your Year ${inputs.termYears} renewal, your total borrowing cost will spike by ${formatCurrency(extraInterest, inputs.country)}. Simulate macro scenarios in the Engine Room.`,
        metric: `+${formatCurrency(extraInterest, inputs.country)} Risk`,
        actionText: 'Open Rate Shock Ladder'
      });
    }
  }

  return insights;
};
