/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Mathematical Formulations, Amortization Engines & Statutory Rules
 */

import {
  Inputs,
  ScheduleResult,
  ScheduleRow,
  ScheduleSummary,
  Milestone,
  UkSdltResult,
  AustralianDutyResult,
  ClosingTaxResult,
  CmhcCalculationResult,
  MultiDebtAccount,
  MultiDebtCascadeResult,
  MultiDebtStrategySummary,
  MultiDebtPaymentRow,
  PaymentFrequency,
  CompoundingMethod
} from './types.js';
import {
  PMI_LTV_THRESHOLD,
  MAX_CC_PAYOFF_MONTHS,
  CMHC_TIERS,
  CMHC_30_YEAR_SURCHARGE,
  CMHC_PROVINCE_PST_RATES
} from './constants.js';
import { getRowDateLabel } from './formatters.js';

/**
 * Pre-indexes scheduled lump sums by payment number for O(1) instant retrieval during simulation loops.
 */
export const buildLumpSumsMap = (
  lumpSums?: Array<{ paymentNumber: number; amount: number }>
): Map<number, number> | null => {
  if (!lumpSums || lumpSums.length === 0) return null;
  const map = new Map<number, number>();
  for (let k = 0; k < lumpSums.length; k++) {
    const item = lumpSums[k]!;
    const amt = Math.max(0, item.amount || 0);
    if (amt > 0) {
      map.set(item.paymentNumber, (map.get(item.paymentNumber) || 0) + amt);
    }
  }
  return map.size > 0 ? map : null;
};

/**
 * Calculates Canadian CMHC / Default Mortgage Insurance premium and provincial sales tax.
 */
export const calculateCmhcInsurance = (
  homePrice: number,
  downPayment: number,
  amortizationYears: number,
  province = 'ON',
  includeCmhc = false
): CmhcCalculationResult => {
  const basePrincipal = Math.max(0, homePrice - downPayment);
  if (!includeCmhc || homePrice <= 0 || basePrincipal <= 0) {
    return {
      insuranceRate: 0,
      insuranceAmount: 0,
      pstRate: 0,
      pstAmount: 0,
      totalPrincipal: basePrincipal
    };
  }

  const downPaymentRatio = downPayment / homePrice;
  const ltv = 1 - downPaymentRatio;

  // Conventional mortgage (LTV <= 80%, down payment >= 20%) requires no CMHC default insurance
  if (ltv <= 0.8 + 1e-6) {
    return {
      insuranceRate: 0,
      insuranceAmount: 0,
      pstRate: 0,
      pstAmount: 0,
      totalPrincipal: basePrincipal
    };
  }

  // Statutory Canadian regulations: Mortgage default insurance is legally prohibited
  // for properties > $1,500,000, and requires at least a 5% down payment (maximum 95% LTV).
  if (homePrice > 1500000 || ltv > 0.95 + 1e-6) {
    return {
      insuranceRate: 0,
      insuranceAmount: 0,
      pstRate: 0,
      pstAmount: 0,
      totalPrincipal: basePrincipal
    };
  }

  let rate = 0;
  for (const tier of CMHC_TIERS) {
    if (ltv > tier.minLtv - 1e-6) {
      rate = tier.rate;
      break;
    }
  }
  if (rate === 0 && ltv > 0.8 + 1e-6) {
    rate = 0.028;
  }

  // 30-year amortization surcharge on insured mortgages (+0.20%)
  if (amortizationYears > 25) {
    rate += CMHC_30_YEAR_SURCHARGE;
  }

  const insuranceAmount = Math.round(basePrincipal * rate * 100) / 100;
  const provUpper = (province || 'ON').toUpperCase();
  const pstRate = CMHC_PROVINCE_PST_RATES[provUpper] !== undefined ? CMHC_PROVINCE_PST_RATES[provUpper]! : 0;
  const pstAmount = Math.round(insuranceAmount * pstRate * 100) / 100;
  const totalPrincipal = Math.round((basePrincipal + insuranceAmount) * 100) / 100;

  return {
    insuranceRate: rate,
    insuranceAmount,
    pstRate,
    pstAmount,
    totalPrincipal
  };
};

/**
 * Calculates statutory minimum down payment required in Canada (Dec 15, 2024 reform):
 * - Up to $500,000: 5% minimum
 * - $500,000 to $1,500,000: 5% on first $500k ($25k) + 10% on remainder
 * - Over $1,500,000: 20% minimum floor
 */
export const calculateCanadianMinDownPayment = (
  homePrice: number
): { minDownPayment: number; minDownPaymentPct: number; isCmhcEligible: boolean } => {
  const safePrice = Math.max(0, homePrice || 0);
  if (safePrice <= 0) {
    return { minDownPayment: 0, minDownPaymentPct: 0, isCmhcEligible: true };
  }
  if (safePrice <= 500000) {
    const minDown = Math.round(safePrice * 0.05 * 100) / 100;
    return { minDownPayment: minDown, minDownPaymentPct: 0.05, isCmhcEligible: true };
  }
  if (safePrice <= 1500000) {
    const minDown = Math.round((25000 + (safePrice - 500000) * 0.1) * 100) / 100;
    return {
      minDownPayment: minDown,
      minDownPaymentPct: minDown / safePrice,
      isCmhcEligible: true
    };
  }
  const minDown = Math.round(safePrice * 0.2 * 100) / 100;
  return { minDownPayment: minDown, minDownPaymentPct: 0.2, isCmhcEligible: false };
};

/**
 * Computes OSFI B-20 qualifying interest rate: max(Contract Rate + 2.0%, 5.25%)
 */
export const calculateOsfiStressTestRate = (contractAnnualRate: number): number => {
  const safeRate = Number.isNaN(contractAnnualRate) ? 0 : Math.max(0, contractAnnualRate);
  return Math.round(Math.max(safeRate + 2.0, 5.25) * 100) / 100;
};

/**
 * Standard amortization installment formula: PMT = P * [r(1+r)^N] / [(1+r)^N - 1]
 */
export const getMonthlyPayment = (principal: number, rate: number, periods: number): number => {
  if (
    Number.isNaN(principal) ||
    Number.isNaN(rate) ||
    Number.isNaN(periods) ||
    periods <= 0 ||
    principal <= 0
  ) {
    return 0;
  }
  const safeRate = Math.max(0, rate);
  if (safeRate < 1e-7) return principal / periods;
  return (
    (principal * (safeRate * Math.pow(1 + safeRate, periods))) /
    (Math.pow(1 + safeRate, periods) - 1)
  );
};

/**
 * Converts annual rate to monthly rate based on statutory compounding standards:
 * - Canadian semi-annual: (1 + r/2)^(1/6) - 1
 * - Standard monthly: r / 12
 */
export const toMonthlyRate = (annualRate: number, compounding: CompoundingMethod = 'semi'): number => {
  const safeRate = Math.max(0, annualRate);
  switch (compounding) {
    case 'semi':
      return Math.pow(1 + safeRate / 100 / 2, 1 / 6) - 1;
    case 'daily':
      return Math.pow(1 + safeRate / 100 / 365, 365 / 12) - 1;
    case 'monthly':
    default:
      return safeRate / 100 / 12;
  }
};

/**
 * Converts annual rate to periodic rate for a specific payment frequency:
 * - Canadian semi-annual: (1 + r/2)^(2/periodsPerYear) - 1
 * - Standard: r / periodsPerYear
 */
export const toPeriodicRate = (
  annualRate: number,
  compounding: CompoundingMethod = 'semi',
  periodsPerYear = 12
): number => {
  const safeRate = Math.max(0, annualRate);
  switch (compounding) {
    case 'semi':
      return Math.pow(1 + safeRate / 100 / 2, 2 / periodsPerYear) - 1;
    case 'daily':
      return Math.pow(1 + safeRate / 100 / 365, 365 / periodsPerYear) - 1;
    case 'monthly':
    default:
      return safeRate / 100 / periodsPerYear;
  }
};

/**
 * Solves for Truth in Lending Act (TILA) Effective APR using a 40-iteration binary search IRR solver.
 */
export const calculateEffectiveApr = (
  loanAmount: number,
  originationFee: number,
  annualRate: number,
  termMonths: number
): number => {
  const netProceeds = loanAmount - originationFee;
  if (netProceeds <= 0 || loanAmount <= 0 || termMonths <= 0) return 0;
  if (originationFee <= 0) return annualRate;

  const monthlyRate = annualRate / 100 / 12;
  const pmt = getMonthlyPayment(loanAmount, monthlyRate, termMonths);

  let low = 1e-6;
  let high = Math.max(2.0, (annualRate / 100) * 4);
  let rate = monthlyRate;

  for (let iter = 0; iter < 40; iter++) {
    rate = (low + high) / 2;
    // PV = pmt * [1 - (1+rate)^(-N)] / rate
    const pv = (pmt * (1 - Math.pow(1 + rate, -termMonths))) / rate;
    if (pv > netProceeds) {
      low = rate;
    } else {
      high = rate;
    }
  }
  return Math.round(rate * 12 * 100 * 100) / 100;
};

/**
 * Generates complete amortization schedule for a residential mortgage.
 * Supports:
 * - Canadian Semi-Annual vs US/UK/AU Compounding
 * - Payment Acceleration (Accelerated Bi-Weekly & Weekly)
 * - AU/UK Mortgage Offset Accounts & Redraw Facilities
 * - Refinancing Rate Shock Ladders (Macro Presets)
 * - US PMI 80% LTV Statutory Termination
 * - Cent-level rounding drift prevention
 */
export const generateMortgageSchedule = (
  inputs: Inputs,
  isBaseline = false,
  summaryOnly = false
): ScheduleResult => {
  const safeAmort = Math.min(100, Math.max(0.1, inputs.amortizationYears || 0));
  const safeHomePrice = Math.max(0, inputs.homePrice || 0);
  const safeDownPayment = Math.min(safeHomePrice, Math.max(0, inputs.downPayment || 0));
  const basePrincipal = safeHomePrice - safeDownPayment;

  // CMHC default insurance (Canada)
  const isCanadian = !inputs.country || inputs.country === 'semi' || inputs.country === 'CA';
  const shouldIncludeCmhc = isCanadian && !!inputs.includeCmhc;
  const cmhcRes = calculateCmhcInsurance(
    safeHomePrice,
    safeDownPayment,
    safeAmort,
    inputs.cmhcProvince || inputs.province || 'ON',
    shouldIncludeCmhc
  );
  const principal = cmhcRes.totalPrincipal;

  const freq = isBaseline ? 'monthly' : inputs.frequency;
  let periodsPerYear = 12;
  if (freq === 'semi-monthly') periodsPerYear = 24;
  else if (freq === 'bi-weekly' || freq === 'accelerated-bi-weekly') periodsPerYear = 26;
  else if (freq === 'weekly' || freq === 'accelerated-weekly') periodsPerYear = 52;

  if (principal <= 0) {
    return {
      schedule: [],
      summary: {
        periodsToPayoff: 0,
        periodsPerYear,
        totalInterest: 0,
        totalPrincipal: 0,
        totalEscrow: 0,
        totalExtraPaid: 0,
        totalInterestSavedWithOffset: 0,
        cmhcInsuranceAmount: 0,
        cmhcPstAmount: 0,
        cmhcPstRate: 0,
        basePrincipalWithoutCmhc: 0,
        paidOff: true,
        payoffDate: inputs.startDate || ''
      }
    };
  }

  const safeRate = Math.min(100, Math.max(0, inputs.annualRate || 0));
  const safeTerm = Math.min(safeAmort, Math.max(0.1, inputs.termYears || 0));

  const standardMonthlyRate = toMonthlyRate(safeRate, inputs.compounding);
  const baselineMonthlyPayment = getMonthlyPayment(principal, standardMonthlyRate, safeAmort * 12);
  const userExtra = isBaseline ? 0 : Math.max(0, inputs.extraPayment || 0);

  let periodicPayment: number;
  if (freq === 'accelerated-bi-weekly') {
    periodicPayment = baselineMonthlyPayment / 2;
  } else if (freq === 'accelerated-weekly') {
    periodicPayment = baselineMonthlyPayment / 4;
  } else {
    const standardPeriodicRate = toPeriodicRate(safeRate, inputs.compounding, periodsPerYear);
    periodicPayment = getMonthlyPayment(principal, standardPeriodicRate, safeAmort * periodsPerYear);
  }

  // PITI Escrow
  const hasPiti = Boolean(inputs.usePiti);
  const periodicTax = hasPiti ? Math.max(0, inputs.taxRate || 0) / periodsPerYear : 0;
  const periodicInsurance = hasPiti ? Math.max(0, inputs.insRate || 0) / periodsPerYear : 0;
  const periodicHOA = hasPiti ? (Math.max(0, inputs.hoaRate || 0) * 12) / periodsPerYear : 0;
  const pmiDropThreshold = safeHomePrice * PMI_LTV_THRESHOLD;

  const basePeriodicRate = toPeriodicRate(safeRate, inputs.compounding, periodsPerYear);
  let activePeriodicRate = basePeriodicRate;

  const annualPmiRate = inputs.pmiRate || 0;
  const basePeriodicPMI =
    hasPiti && inputs.compounding !== 'semi' && safeHomePrice > 0 && annualPmiRate > 0
      ? (principal * (Math.min(100, Math.max(0, annualPmiRate)) / 100)) / periodsPerYear
      : 0;

  // Scheduled Lump Sums
  const lumpSumsMap = !isBaseline ? buildLumpSumsMap(inputs.lumpSums) : null;
  const defaultLumpSum1 = !isBaseline && !(lumpSumsMap?.has(1)) ? Math.max(0, inputs.lumpSum || 0) : 0;

  // Offset Account Setup (AU/UK Standard)
  let currentOffsetBalance = !isBaseline ? Math.max(0, inputs.offsetBalance || 0) : 0;
  const offsetMonthlyDeposit = !isBaseline ? Math.max(0, inputs.offsetMonthlyDeposit || 0) : 0;
  const periodicOffsetDeposit = offsetMonthlyDeposit * (12 / periodsPerYear);

  let balance = principal;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalExtraPaid = 0;
  let totalEscrow = 0;
  let totalOffsetInterestSaved = 0;
  const schedule: ScheduleRow[] = [];
  const maxPeriods = Math.ceil(safeAmort * periodsPerYear) + periodsPerYear * 25;

  let periodsToPayoff = 0;
  let pmiDropPeriod: number | undefined;
  let pmiDropDate: string | undefined;

  for (let i = 1; i <= maxPeriods; i++) {
    if (balance <= 0.009) break;
    periodsToPayoff = i;

    // 1. Rate Shock / Renewal Ladder
    if (inputs.rateShockEnabled && safeTerm > 0) {
      let activeAnnualRate = safeRate;
      const termPeriods = Math.round(safeTerm * periodsPerYear);
      const isTermRenewal = i - 1 > 0 && (i - 1) % termPeriods === 0;
      const termIndex = Math.floor((i - 1) / termPeriods);
      const y = Math.round(termIndex * safeTerm * 100) / 100;

      if (y > 0 && y < safeAmort && inputs.termRates && inputs.termRates[y] !== undefined) {
        activeAnnualRate = Math.min(100, Math.max(0, inputs.termRates[y] || 0));
      }

      if (isTermRenewal) {
        const remainingPeriods = Math.max(1, Math.round(safeAmort * periodsPerYear) - (i - 1));
        const renewalPeriodicRate = toPeriodicRate(activeAnnualRate, inputs.compounding, periodsPerYear);

        if (freq === 'accelerated-bi-weekly' || freq === 'accelerated-weekly') {
          const divisor = freq === 'accelerated-weekly' ? 4 : 2;
          const renewalMonthlyRate = toMonthlyRate(activeAnnualRate, inputs.compounding);
          const remainingMonthlyPeriods = Math.max(
            1,
            Math.round(safeAmort * 12) - Math.floor(((i - 1) * 12) / periodsPerYear)
          );
          periodicPayment =
            getMonthlyPayment(balance, renewalMonthlyRate, remainingMonthlyPeriods) / divisor;
        } else {
          periodicPayment = getMonthlyPayment(balance, renewalPeriodicRate, remainingPeriods);
        }
      }
      activePeriodicRate = toPeriodicRate(activeAnnualRate, inputs.compounding, periodsPerYear);
    }

    // 2. Escrow & PMI
    const periodicPMI = basePeriodicPMI > 0 && balance > pmiDropThreshold ? basePeriodicPMI : 0;
    if (basePeriodicPMI > 0 && balance <= pmiDropThreshold && !pmiDropPeriod) {
      pmiDropPeriod = i;
      pmiDropDate = getRowDateLabel(inputs.startDate, i, periodsPerYear);
    }
    const periodicEscrow = periodicTax + periodicInsurance + periodicHOA + periodicPMI;

    // 4. Principal & Extra Payments
    let currentExtraPayment = userExtra * (12 / periodsPerYear);
    if (!isBaseline) {
      if (i === 1 && defaultLumpSum1 > 0) currentExtraPayment += defaultLumpSum1;
      if (lumpSumsMap && lumpSumsMap.has(i)) currentExtraPayment += lumpSumsMap.get(i)!;
    }

    const nominalInterestWithoutOffset = Math.round(balance * activePeriodicRate * 100) / 100;
    const effectiveBalance = Math.max(0, balance - currentOffsetBalance);
    const interest = Math.round(effectiveBalance * activePeriodicRate * 100) / 100;
    const interestSavedThisPeriod = Math.max(0, nominalInterestWithoutOffset - interest);
    totalOffsetInterestSaved += interestSavedThisPeriod;

    let principalPortion = Math.round((periodicPayment - interest) * 100) / 100;

    const terminalTolerance = Math.min(2.0, Math.max(0.01, 0.05 * periodicPayment));
    if (
      principalPortion + currentExtraPayment > balance ||
      (i === Math.ceil(safeAmort * periodsPerYear) &&
        Math.abs(balance - (principalPortion + currentExtraPayment)) < terminalTolerance)
    ) {
      if (principalPortion >= balance || i === Math.ceil(safeAmort * periodsPerYear)) {
        principalPortion = balance;
        currentExtraPayment = 0;
      } else {
        currentExtraPayment = Math.max(0, balance - principalPortion);
      }
    }

    const recordedOffsetBalance = currentOffsetBalance;
    if (!isBaseline && periodicOffsetDeposit > 0) {
      currentOffsetBalance += periodicOffsetDeposit;
    }

    balance -= principalPortion + currentExtraPayment;
    balance = Math.round(balance * 100) / 100;
    if (balance < 0.001) balance = 0;

    totalInterest = Math.round((totalInterest + interest) * 100) / 100;
    totalPrincipal = Math.round((totalPrincipal + principalPortion + currentExtraPayment) * 100) / 100;
    totalExtraPaid = Math.round((totalExtraPaid + currentExtraPayment) * 100) / 100;
    totalEscrow = Math.round((totalEscrow + periodicEscrow) * 100) / 100;

    if (!summaryOnly) {
      const year = Math.floor((i - 1) / periodsPerYear) + 1;
      const dateLabel = getRowDateLabel(inputs.startDate, i, periodsPerYear);
      const ltv = safeHomePrice > 0 ? (balance / safeHomePrice) * 100 : 0;

      schedule.push({
        period: i,
        year,
        calendarYear: new Date(inputs.startDate || '2026-01-01').getFullYear() + year - 1,
        dateLabel,
        payment: Math.round((principalPortion + interest + currentExtraPayment + periodicEscrow) * 100) / 100,
        principal: principalPortion,
        interest,
        tax: periodicTax,
        ins: periodicInsurance,
        hoa: periodicHOA,
        pmi: periodicPMI,
        escrow: periodicEscrow,
        extra: currentExtraPayment,
        balance,
        effectiveBalance,
        offsetBalance: Math.round(recordedOffsetBalance * 100) / 100,
        totalInterest,
        totalPrincipal,
        totalExtra: totalExtraPaid,
        totalEscrow,
        ltv: Math.round(ltv * 100) / 100,
        interestSavedCumulative: Math.round(totalOffsetInterestSaved * 100) / 100
      });
    }
  }

  const finalPayoffDate = getRowDateLabel(inputs.startDate, periodsToPayoff, periodsPerYear);

  return {
    schedule,
    summary: {
      periodsToPayoff,
      periodsPerYear,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPrincipal: Math.round(totalPrincipal * 100) / 100,
      totalEscrow: Math.round(totalEscrow * 100) / 100,
      totalExtraPaid: Math.round(totalExtraPaid * 100) / 100,
      totalInterestSavedWithOffset: Math.round(totalOffsetInterestSaved * 100) / 100,
      cmhcInsuranceAmount: cmhcRes.insuranceAmount,
      cmhcPstAmount: cmhcRes.pstAmount,
      cmhcPstRate: cmhcRes.pstRate,
      basePrincipalWithoutCmhc: basePrincipal,
      paidOff: balance <= 0.009,
      payoffDate: finalPayoffDate,
      pmiDropPeriod,
      pmiDropDate
    }
  };
};

/**
 * Generates credit card revolving debt schedule with statutory minimum payment rules.
 */
export const generateCCSchedule = (inputs: Inputs, isBaseline = false): ScheduleResult => {
  const balance0 = Math.max(0, inputs.ccBalance || 0);
  if (balance0 <= 0) {
    return {
      schedule: [],
      summary: {
        periodsToPayoff: 0,
        periodsPerYear: 12,
        totalInterest: 0,
        totalPrincipal: 0,
        totalEscrow: 0,
        totalExtraPaid: 0,
        paidOff: true,
        payoffDate: inputs.startDate || ''
      }
    };
  }

  const rate = Math.max(0, inputs.annualRate || 0);
  const monthlyRate =
    inputs.ccCompounding === 'daily'
      ? Math.pow(1 + rate / 100 / 365, 365 / 12) - 1
      : rate / 100 / 12;

  const minPct = (inputs.ccMinPercent || 3) / 100;
  const minPrincipalPct = (inputs.ccMinPrincipalPct || 1) / 100;
  const minFlat = inputs.ccMinFlat || 10;
  const userExtra = isBaseline ? 0 : Math.max(0, inputs.extraPayment || 0);

  let bal = balance0;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalExtra = 0;
  const schedule: ScheduleRow[] = [];
  let month = 0;

  while (bal > 0.009 && month < MAX_CC_PAYOFF_MONTHS) {
    month++;
    const interest = Math.round(bal * monthlyRate * 100) / 100;

    // Statutory minimum payment rules
    let minPmt: number;
    if (inputs.ccMinPrincipalPct === 0) {
      minPmt = Math.max(minFlat, bal * minPct);
    } else {
      minPmt = Math.max(minFlat, bal * minPct, interest + bal * minPrincipalPct);
    }
    minPmt = Math.min(bal + interest, minPmt);

    // Negative amortization guard: payment cannot cover monthly interest
    if (minPmt <= interest && userExtra <= 0) {
      return {
        schedule,
        summary: {
          periodsToPayoff: Infinity,
          periodsPerYear: 12,
          totalInterest: Math.round((totalInterest + interest * (MAX_CC_PAYOFF_MONTHS - month)) * 100) / 100,
          totalPrincipal: Math.round(totalPrincipal * 100) / 100,
          totalEscrow: 0,
          totalExtraPaid: 0,
          paidOff: false,
          payoffDate: 'Never (Negative Amortization)'
        }
      };
    }

    let pmt = minPmt;
    let extra = 0;
    if (!isBaseline && userExtra > 0) {
      extra = Math.min(Math.max(0, bal + interest - pmt), userExtra);
      pmt += extra;
    }

    const principal = pmt - interest;
    bal = Math.max(0, Math.round((bal - principal) * 100) / 100);

    totalInterest += interest;
    totalPrincipal += principal;
    totalExtra += extra;

    schedule.push({
      period: month,
      year: Math.floor((month - 1) / 12) + 1,
      calendarYear: new Date(inputs.startDate || '2026-01-01').getFullYear() + Math.floor((month - 1) / 12),
      dateLabel: getRowDateLabel(inputs.startDate, month, 12),
      payment: pmt,
      principal,
      interest,
      tax: 0,
      ins: 0,
      hoa: 0,
      pmi: 0,
      escrow: 0,
      extra,
      balance: bal,
      effectiveBalance: bal,
      offsetBalance: 0,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPrincipal: Math.round(totalPrincipal * 100) / 100,
      totalExtra: Math.round(totalExtra * 100) / 100,
      totalEscrow: 0,
      ltv: 0
    });
  }

  const isPaidOff = bal <= 0.009;
  return {
    schedule,
    summary: {
      periodsToPayoff: isPaidOff ? month : Infinity,
      periodsPerYear: 12,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPrincipal: Math.round(totalPrincipal * 100) / 100,
      totalEscrow: 0,
      totalExtraPaid: Math.round(totalExtra * 100) / 100,
      paidOff: isPaidOff,
      payoffDate: isPaidOff ? getRowDateLabel(inputs.startDate, month, 12) : 'Never (Negative Amortization)'
    }
  };
};

/**
 * Generates personal / consumer loan schedule with upfront origination fee and effective TILA APR.
 */
export const generateLoanSchedule = (inputs: Inputs, isBaseline = false): ScheduleResult => {
  const loanAmt = Math.max(0, inputs.loanAmount || inputs.homePrice || 0);
  const originationFee = inputs.loanOriginationFeeEnabled ? Math.max(0, inputs.loanOriginationFee || 0) : 0;
  const netLoan = loanAmt;
  const safeAmort = Math.min(30, Math.max(0.5, inputs.amortizationYears || 3));
  const periods = Math.round(safeAmort * 12);
  const rate = Math.max(0, inputs.annualRate || 0);
  const monthlyRate = rate / 100 / 12;

  const basePmt = getMonthlyPayment(netLoan, monthlyRate, periods);
  const userExtra = isBaseline ? 0 : Math.max(0, inputs.extraPayment || 0);

  let bal = netLoan;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalExtra = 0;
  const schedule: ScheduleRow[] = [];
  let month = 0;

  while (bal > 0.009 && month < periods * 2) {
    month++;
    const interest = Math.round(bal * monthlyRate * 100) / 100;
    let pmt = Math.min(bal + interest, basePmt);
    let extra = 0;
    if (!isBaseline && userExtra > 0) {
      extra = Math.min(Math.max(0, bal + interest - pmt), userExtra);
      pmt += extra;
    }
    const principal = pmt - interest;
    bal = Math.max(0, Math.round((bal - principal) * 100) / 100);

    totalInterest += interest;
    totalPrincipal += principal;
    totalExtra += extra;

    schedule.push({
      period: month,
      year: Math.floor((month - 1) / 12) + 1,
      calendarYear: new Date(inputs.startDate || '2026-01-01').getFullYear() + Math.floor((month - 1) / 12),
      dateLabel: getRowDateLabel(inputs.startDate, month, 12),
      payment: pmt,
      principal,
      interest,
      tax: 0,
      ins: 0,
      hoa: 0,
      pmi: 0,
      escrow: 0,
      extra,
      balance: bal,
      effectiveBalance: bal,
      offsetBalance: 0,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPrincipal: Math.round(totalPrincipal * 100) / 100,
      totalExtra: Math.round(totalExtra * 100) / 100,
      totalEscrow: 0,
      ltv: 0
    });
  }

  return {
    schedule,
    summary: {
      periodsToPayoff: month,
      periodsPerYear: 12,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPrincipal: Math.round(totalPrincipal * 100) / 100,
      totalEscrow: originationFee,
      totalExtraPaid: Math.round(totalExtra * 100) / 100,
      paidOff: bal <= 0.009,
      payoffDate: getRowDateLabel(inputs.startDate, month, 12)
    }
  };
};

/**
 * Calculates key financial milestones along the amortization path:
 * - PMI Drop (80% LTV)
 * - 25%, 50%, 75% Equity Milestones
 * - Interest Crossover (Principal Payment > Interest Payment)
 * - Halfway to Debt Freedom
 * - Complete Payoff
 */
export const calculateMilestones = (
  schedule: ScheduleRow[],
  homePrice: number,
  startingPrincipal: number
): Milestone[] => {
  const milestones: Milestone[] = [];
  if (!schedule || schedule.length === 0) return milestones;

  let pmiDropped = false;
  let eq25 = false;
  let eq50 = false;
  let eq75 = false;
  let crossover = false;

  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i]!;
    const principalPaid = startingPrincipal - row.balance;
    const percentPaid = startingPrincipal > 0 ? (principalPaid / startingPrincipal) * 100 : 0;

    // 1. PMI Drop (LTV <= 80%)
    if (!pmiDropped && homePrice > 0 && row.balance <= homePrice * 0.8) {
      pmiDropped = true;
      milestones.push({
        period: row.period,
        dateLabel: row.dateLabel,
        type: 'pmi_drop',
        title: 'PMI Eradicated',
        description: 'Reached 80% LTV. Private mortgage insurance terminated.',
        balance: row.balance,
        percentPaid
      });
    }

    // 2. Interest Crossover (Tipping Point where Principal > Interest)
    if (!crossover && row.principal > row.interest) {
      crossover = true;
      milestones.push({
        period: row.period,
        dateLabel: row.dateLabel,
        type: 'interest_crossover',
        title: 'Interest Tipping Point',
        description: 'More than 50¢ of every payment dollar now builds real wealth.',
        balance: row.balance,
        percentPaid
      });
    }

    // 3. 25% Equity
    if (!eq25 && percentPaid >= 25) {
      eq25 = true;
      milestones.push({
        period: row.period,
        dateLabel: row.dateLabel,
        type: 'equity_25',
        title: '25% Principal Eradicated',
        description: 'One-quarter of the total loan principal is permanently retired.',
        balance: row.balance,
        percentPaid
      });
    }

    // 4. 50% Halfway
    if (!eq50 && percentPaid >= 50) {
      eq50 = true;
      milestones.push({
        period: row.period,
        dateLabel: row.dateLabel,
        type: 'halfway',
        title: 'Halfway Mountain Summit',
        description: '50% debt-free. Equity now compounds faster than bank profit.',
        balance: row.balance,
        percentPaid
      });
    }

    // 5. 75% Equity
    if (!eq75 && percentPaid >= 75) {
      eq75 = true;
      milestones.push({
        period: row.period,
        dateLabel: row.dateLabel,
        type: 'equity_75',
        title: 'Home Stretch (75% Equity)',
        description: 'Three-quarters of the debt is eliminated. Payoff in sight.',
        balance: row.balance,
        percentPaid
      });
    }
  }

  // Final Payoff Milestone
  const last = schedule[schedule.length - 1]!;
  milestones.push({
    period: last.period,
    dateLabel: last.dateLabel,
    type: 'payoff',
    title: '100% Debt Freedom',
    description: 'Zero balance remaining. Mortgage is officially extinguished.',
    balance: 0,
    percentPaid: 100
  });

  return milestones;
};

/**
 * Canadian Land Transfer Tax (PLTT, Toronto MLTT, BC PTT, AB titles levy, QC Welcome Tax)
 */
export const calculateCanadianLandTransferTax = (
  homePrice: number,
  province = 'ON',
  isToronto = false,
  isFirstTimeBuyer = false
): { provincialLtt: number; municipalLtt: number; firstTimeRebate: number; totalLtt: number; effectiveRatePct: number } => {
  const price = Math.max(0, homePrice || 0);
  if (price <= 0) {
    return { provincialLtt: 0, municipalLtt: 0, firstTimeRebate: 0, totalLtt: 0, effectiveRatePct: 0 };
  }

  const provUpper = (province || 'ON').toUpperCase();

  // British Columbia PTT
  if (provUpper === 'BC') {
    let ptt = 0;
    ptt += Math.min(price, 200000) * 0.01;
    if (price > 200000) ptt += Math.min(price - 200000, 1800000) * 0.02;
    if (price > 2000000) ptt += Math.min(price - 2000000, 1000000) * 0.03;
    if (price > 3000000) ptt += (price - 3000000) * 0.05;

    let rebate = 0;
    if (isFirstTimeBuyer) {
      if (price <= 835000) rebate = ptt;
      else if (price <= 860000) rebate = ptt * Math.max(0, (860000 - price) / 25000);
    }
    const net = Math.round(Math.max(0, ptt - rebate) * 100) / 100;
    return {
      provincialLtt: Math.round(ptt * 100) / 100,
      municipalLtt: 0,
      firstTimeRebate: Math.round(rebate * 100) / 100,
      totalLtt: net,
      effectiveRatePct: Math.round((net / price) * 10000) / 100
    };
  }

  // Alberta Land Titles
  if (provUpper === 'AB') {
    const levy = 50 + Math.ceil(price / 5000) * 5;
    return {
      provincialLtt: levy,
      municipalLtt: 0,
      firstTimeRebate: 0,
      totalLtt: levy,
      effectiveRatePct: Math.round((levy / price) * 10000) / 100
    };
  }

  // Quebec Transfer Duties
  if (provUpper === 'QC') {
    let qc = Math.min(price, 58900) * 0.005;
    if (price > 58900) qc += Math.min(price - 58900, 235700) * 0.01;
    if (price > 294600) qc += (price - 294600) * 0.015;
    const rounded = Math.round(qc * 100) / 100;
    return {
      provincialLtt: rounded,
      municipalLtt: 0,
      firstTimeRebate: 0,
      totalLtt: rounded,
      effectiveRatePct: Math.round((rounded / price) * 10000) / 100
    };
  }

  // Ontario PLTT
  let provLtt = 0;
  if (provUpper === 'ON') {
    provLtt += Math.min(price, 55000) * 0.005;
    if (price > 55000) provLtt += Math.min(price - 55000, 195000) * 0.01;
    if (price > 250000) provLtt += Math.min(price - 250000, 150000) * 0.015;
    if (price > 400000) provLtt += Math.min(price - 400000, 1600000) * 0.02;
    if (price > 2000000) provLtt += (price - 2000000) * 0.025;
  }

  // Toronto MLTT
  let municipalLtt = 0;
  if (isToronto && provUpper === 'ON') {
    municipalLtt += Math.min(price, 55000) * 0.005;
    if (price > 55000) municipalLtt += Math.min(price - 55000, 195000) * 0.01;
    if (price > 250000) municipalLtt += Math.min(price - 250000, 150000) * 0.015;
    if (price > 400000) municipalLtt += Math.min(price - 400000, 1600000) * 0.02;
    if (price > 2000000) municipalLtt += Math.min(price - 2000000, 1000000) * 0.025;
    if (price > 3000000) municipalLtt += Math.min(price - 3000000, 1000000) * 0.035;
    if (price > 4000000) municipalLtt += Math.min(price - 4000000, 1000000) * 0.045;
    if (price > 5000000) municipalLtt += Math.min(price - 5000000, 5000000) * 0.055;
    if (price > 10000000) municipalLtt += Math.min(price - 10000000, 10000000) * 0.065;
    if (price > 20000000) municipalLtt += (price - 20000000) * 0.075;
  }

  const provRebate = isFirstTimeBuyer && provUpper === 'ON' ? Math.min(provLtt, 4000) : 0;
  const torontoRebate = isFirstTimeBuyer && isToronto && provUpper === 'ON' ? Math.min(municipalLtt, 4475) : 0;
  const totalRebate = provRebate + torontoRebate;

  const roundedProv = Math.round(provLtt * 100) / 100;
  const roundedMuni = Math.round(municipalLtt * 100) / 100;
  const roundedRebate = Math.round(totalRebate * 100) / 100;
  const netTotal = Math.round(Math.max(0, roundedProv + roundedMuni - roundedRebate) * 100) / 100;

  return {
    provincialLtt: roundedProv,
    municipalLtt: roundedMuni,
    firstTimeRebate: roundedRebate,
    totalLtt: netTotal,
    effectiveRatePct: Math.round((netTotal / price) * 10000) / 100
  };
};

/**
 * UK Stamp Duty Land Tax (SDLT - Post-April 2025 statutory schedule)
 */
export const calculateUkSdlt = (
  homePrice: number,
  isFirstTimeBuyer = false,
  isAdditionalProperty = false
): UkSdltResult => {
  const price = Math.max(0, homePrice || 0);
  if (price <= 0) return { sdltAmount: 0, effectiveRatePct: 0, firstTimeBuyerRelief: 0 };

  let standardSdlt = 0;
  if (price > 125000) standardSdlt += Math.min(price - 125000, 125000) * 0.02;
  if (price > 250000) standardSdlt += Math.min(price - 250000, 675000) * 0.05;
  if (price > 925000) standardSdlt += Math.min(price - 925000, 575000) * 0.1;
  if (price > 1500000) standardSdlt += (price - 1500000) * 0.12;

  let relief = 0;
  let netTax = standardSdlt;

  if (isFirstTimeBuyer && !isAdditionalProperty && price <= 500000) {
    let ftbTax = 0;
    if (price > 300000) ftbTax = (price - 300000) * 0.05;
    relief = Math.max(0, standardSdlt - ftbTax);
    netTax = ftbTax;
  }

  if (isAdditionalProperty) {
    netTax += price * 0.05;
  }

  const roundedTax = Math.round(netTax * 100) / 100;
  const roundedRelief = Math.round(relief * 100) / 100;

  return {
    sdltAmount: roundedTax,
    effectiveRatePct: Math.round((roundedTax / price) * 10000) / 100,
    firstTimeBuyerRelief: roundedRelief
  };
};

/**
 * Australian State Transfer Duty (Stamp Duty for NSW, VIC, QLD, WA, SA, TAS, ACT, NT)
 */
export const calculateAustralianTransferDuty = (
  homePrice: number,
  stateCode = 'NSW',
  isFirstTimeBuyer = false
): AustralianDutyResult => {
  const price = Math.max(0, homePrice || 0);
  if (price <= 0) return { transferDuty: 0, effectiveRatePct: 0, concessionAmount: 0 };

  const stateUpper = (stateCode || 'NSW').toUpperCase();
  let baseDuty = 0;
  let concession = 0;

  if (stateUpper === 'VIC') {
    if (price <= 25000) baseDuty = price * 0.014;
    else if (price <= 130000) baseDuty = 350 + (price - 25000) * 0.024;
    else if (price <= 960000) baseDuty = 2870 + (price - 130000) * 0.06;
    else baseDuty = price * 0.055;

    if (isFirstTimeBuyer) {
      if (price <= 600000) concession = baseDuty;
      else if (price <= 750000) concession = baseDuty * Math.max(0, (750000 - price) / 150000);
    }
  } else if (stateUpper === 'QLD') {
    if (price <= 5000) baseDuty = 0;
    else if (price <= 75000) baseDuty = (price - 5000) * 0.015;
    else if (price <= 540000) baseDuty = 1050 + (price - 75000) * 0.035;
    else if (price <= 1000000) baseDuty = 17325 + (price - 540000) * 0.045;
    else baseDuty = 38025 + (price - 1000000) * 0.0575;

    if (isFirstTimeBuyer) {
      if (price <= 700000) concession = baseDuty;
      else if (price <= 800000) concession = baseDuty * Math.max(0, (800000 - price) / 100000);
    }
  } else if (stateUpper === 'WA') {
    if (price <= 120000) baseDuty = price * 0.019;
    else if (price <= 150000) baseDuty = 2280 + (price - 120000) * 0.0285;
    else if (price <= 360000) baseDuty = 3135 + (price - 150000) * 0.038;
    else if (price <= 725000) baseDuty = 11115 + (price - 360000) * 0.0475;
    else baseDuty = 28453 + (price - 725000) * 0.0515;

    if (isFirstTimeBuyer) {
      if (price <= 450000) concession = baseDuty;
      else if (price <= 600000) concession = baseDuty * Math.max(0, (600000 - price) / 150000);
    }
  } else if (stateUpper === 'SA') {
    if (price <= 12000) baseDuty = price * 0.01;
    else if (price <= 30000) baseDuty = 120 + (price - 12000) * 0.02;
    else if (price <= 50000) baseDuty = 480 + (price - 30000) * 0.03;
    else if (price <= 100000) baseDuty = 1080 + (price - 50000) * 0.035;
    else if (price <= 200000) baseDuty = 2830 + (price - 100000) * 0.04;
    else if (price <= 250000) baseDuty = 6830 + (price - 200000) * 0.0425;
    else if (price <= 300000) baseDuty = 8955 + (price - 250000) * 0.0475;
    else if (price <= 500000) baseDuty = 11330 + (price - 300000) * 0.05;
    else baseDuty = 21330 + (price - 500000) * 0.055;

    if (isFirstTimeBuyer && price <= 650000) concession = baseDuty;
  } else {
    // NSW (default)
    if (price <= 17000) baseDuty = price * 0.0125;
    else if (price <= 36000) baseDuty = 212 + (price - 17000) * 0.015;
    else if (price <= 97000) baseDuty = 497 + (price - 36000) * 0.02;
    else if (price <= 351000) baseDuty = 1717 + (price - 97000) * 0.035;
    else if (price <= 1168000) baseDuty = 10607 + (price - 351000) * 0.045;
    else baseDuty = 47372 + (price - 1168000) * 0.055;

    if (isFirstTimeBuyer) {
      if (price <= 800000) concession = baseDuty;
      else if (price <= 1000000) concession = baseDuty * Math.max(0, (1000000 - price) / 200000);
    }
  }

  const netDuty = Math.round(Math.max(0, baseDuty - concession) * 100) / 100;
  return {
    transferDuty: netDuty,
    effectiveRatePct: Math.round((netDuty / price) * 10000) / 100,
    concessionAmount: Math.round(concession * 100) / 100
  };
};

/**
 * Unified closing tax calculation entry point.
 */
export const calculateClosingTax = (
  homePrice: number,
  country = 'CA',
  region = 'ON',
  isFirstTimeBuyer = false,
  isAdditionalProperty = false
): ClosingTaxResult => {
  const cUpper = (country || 'CA').toUpperCase();
  if (cUpper === 'UK' || cUpper === 'GB' || cUpper === 'MONTHLY-UK') {
    const uk = calculateUkSdlt(homePrice, isFirstTimeBuyer, isAdditionalProperty);
    return {
      regionType: 'UK_SDLT',
      taxAmount: uk.sdltAmount,
      effectiveRatePct: uk.effectiveRatePct,
      rebateOrRelief: uk.firstTimeBuyerRelief,
      details: { sdltAmount: uk.sdltAmount, firstTimeBuyerRelief: uk.firstTimeBuyerRelief }
    };
  }
  if (cUpper === 'AU' || cUpper === 'MONTHLY-AU') {
    const au = calculateAustralianTransferDuty(homePrice, region, isFirstTimeBuyer);
    return {
      regionType: 'AU_DUTY',
      taxAmount: au.transferDuty,
      effectiveRatePct: au.effectiveRatePct,
      rebateOrRelief: au.concessionAmount,
      details: { transferDuty: au.transferDuty, concessionAmount: au.concessionAmount }
    };
  }
  if (cUpper === 'CA' || cUpper === 'SEMI') {
    const isToronto = region === 'ON-TORONTO';
    const lttProv = isToronto ? 'ON' : region || 'ON';
    const ca = calculateCanadianLandTransferTax(homePrice, lttProv, isToronto, isFirstTimeBuyer);
    return {
      regionType: 'CA_LTT',
      taxAmount: ca.totalLtt,
      effectiveRatePct: ca.effectiveRatePct,
      rebateOrRelief: ca.firstTimeRebate,
      details: {
        provincialLtt: ca.provincialLtt,
        municipalLtt: ca.municipalLtt,
        firstTimeRebate: ca.firstTimeRebate
      }
    };
  }
  return { regionType: 'NONE', taxAmount: 0, effectiveRatePct: 0, rebateOrRelief: 0 };
};

/**
 * Multi-Debt Cascade Algorithm (Unified Household Balance Sheet).
 * Models Avalanche (highest APR first) vs Snowball (lowest balance first).
 * Includes optional Mortgage Rollover: rolling freed non-mortgage surplus directly into extra mortgage payments!
 */
export const calculateMultiDebtCascade = (
  debts: MultiDebtAccount[],
  totalMonthlyBudget: number,
  strategy: 'avalanche' | 'snowball' = 'avalanche',
  mortgageRollover = false,
  mortgageBalance = 0,
  mortgageRate = 0
): MultiDebtCascadeResult => {
  const validDebts = debts.filter((d) => d.balance > 0 && d.rate >= 0);
  if (validDebts.length === 0) {
    const emptyStrategy: MultiDebtStrategySummary = {
      strategy,
      totalInterestPaid: 0,
      totalMonthsToPayoff: 0,
      interestSavedVsMinimums: 0,
      monthsSavedVsMinimums: 0,
      payoffOrder: [],
      payoffOrderIds: []
    };
    return {
      baselineTotalInterest: 0,
      baselineMaxMonths: 0,
      avalanche: { ...emptyStrategy, strategy: 'avalanche' },
      snowball: { ...emptyStrategy, strategy: 'snowball' },
      schedule: []
    };
  }

  const sumMinPayments = validDebts.reduce((acc, d) => acc + Math.max(0, d.minPayment || 0), 0);
  const activeBudget = Math.max(sumMinPayments, totalMonthlyBudget || sumMinPayments);

  // 1. Baseline: paying only minimums
  let baselineTotalInterest = 0;
  let baselineMaxMonths = 0;

  for (const debt of validDebts) {
    let bal = debt.balance;
    const monthlyRate = debt.rate / 100 / 12;
    const minPmt = Math.max(0, debt.minPayment);
    let debtInterest = 0;
    let months = 0;

    while (bal > 0.01 && months < MAX_CC_PAYOFF_MONTHS) {
      months++;
      const interest = Math.round(bal * monthlyRate * 100) / 100;
      const payment = Math.min(bal + interest, minPmt);
      const principal = payment - interest;
      if (principal <= 0) {
        debtInterest += interest * (MAX_CC_PAYOFF_MONTHS - months);
        months = MAX_CC_PAYOFF_MONTHS;
        break;
      }
      bal = Math.max(0, bal - principal);
      debtInterest += interest;
    }
    baselineTotalInterest += debtInterest;
    if (months > baselineMaxMonths) baselineMaxMonths = months;
  }

  // Helper to run strategy simulation
  const simulateStrategy = (strat: 'avalanche' | 'snowball') => {
    const activeDebts = validDebts.map((d) => ({
      id: d.id,
      name: d.name,
      balance: d.balance,
      rate: d.rate,
      minPayment: d.minPayment,
      paidMonth: -1
    }));

    if (strat === 'avalanche') {
      activeDebts.sort((a, b) => b.rate - a.rate);
    } else {
      activeDebts.sort((a, b) => a.balance - b.balance);
    }

    const getTargetDebt = () => {
      if (strat === 'avalanche') {
        for (let idx = 0; idx < activeDebts.length; idx++) {
          if (activeDebts[idx]!.balance > 0.009) return activeDebts[idx]!;
        }
        return null;
      } else {
        let target: (typeof activeDebts)[0] | null = null;
        for (let idx = 0; idx < activeDebts.length; idx++) {
          const d = activeDebts[idx]!;
          if (d.balance > 0.009) {
            if (!target || d.balance < target.balance) target = d;
          }
        }
        return target;
      }
    };

    let totalInterestPaid = 0;
    let month = 0;
    const payoffOrder: string[] = [];
    const payoffOrderIds: string[] = [];
    const paidDebtIds = new Set<string>();
    const schedule: MultiDebtPaymentRow[] = [];

    while (activeDebts.some((d) => d.balance > 0.009) && month < MAX_CC_PAYOFF_MONTHS) {
      month++;
      let monthlyAvailableSurplus = activeBudget;
      const monthlyBalances: Record<string, number> = {};
      const monthlyPayments: Record<string, number> = {};
      let monthInterestTotal = 0;

      // Pass 1: minimums
      for (const debt of activeDebts) {
        if (debt.balance <= 0.009) {
          monthlyBalances[debt.id] = 0;
          monthlyPayments[debt.id] = 0;
          continue;
        }

        const monthlyRate = debt.rate / 100 / 12;
        const interest = Math.round(debt.balance * monthlyRate * 100) / 100;
        const regularPayment = Math.min(debt.balance + interest, Math.max(0, debt.minPayment));
        const regularPrincipal = regularPayment - interest;

        debt.balance = Math.max(0, debt.balance - regularPrincipal);
        monthInterestTotal += interest;
        totalInterestPaid += interest;
        monthlyPayments[debt.id] = regularPayment;
        monthlyAvailableSurplus -= regularPayment;

        if (debt.balance <= 0.009 && !paidDebtIds.has(debt.id)) {
          debt.paidMonth = month;
          paidDebtIds.add(debt.id);
          payoffOrder.push(debt.name);
          payoffOrderIds.push(debt.id);
        }
      }

      // Pass 2: surplus allocation
      let target = getTargetDebt();
      while (target && monthlyAvailableSurplus > 0.01) {
        const extraToApply = Math.min(target.balance, monthlyAvailableSurplus);
        target.balance -= extraToApply;
        monthlyAvailableSurplus -= extraToApply;
        monthlyPayments[target.id] = (monthlyPayments[target.id] || 0) + extraToApply;

        if (target.balance <= 0.009) {
          target.paidMonth = month;
          if (!paidDebtIds.has(target.id)) {
            paidDebtIds.add(target.id);
            payoffOrder.push(target.name);
            payoffOrderIds.push(target.id);
          }
          target = getTargetDebt();
        } else {
          break;
        }
      }

      activeDebts.forEach((d) => {
        monthlyBalances[d.id] = Math.round(d.balance * 100) / 100;
      });

      const totalBalanceRemaining = activeDebts.reduce((sum, d) => sum + d.balance, 0);
      const totalPmtThisMonth = Object.values(monthlyPayments).reduce((sum, p) => sum + p, 0);

      schedule.push({
        period: month,
        dateLabel: `Month ${month}`,
        balances: monthlyBalances,
        payments: monthlyPayments,
        totalBalance: Math.round(totalBalanceRemaining * 100) / 100,
        totalPayment: Math.round(totalPmtThisMonth * 100) / 100,
        totalInterest: Math.round(monthInterestTotal * 100) / 100
      });
    }

    const summary: MultiDebtStrategySummary = {
      strategy: strat,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      totalMonthsToPayoff: month,
      interestSavedVsMinimums: Math.round(Math.max(0, baselineTotalInterest - totalInterestPaid) * 100) / 100,
      monthsSavedVsMinimums: Math.max(0, baselineMaxMonths - month),
      payoffOrder,
      payoffOrderIds,
      paidOff: activeDebts.every((d) => d.balance <= 0.009)
    };

    return { summary, schedule };
  };

  const avalancheRes = simulateStrategy('avalanche');
  const snowballRes = simulateStrategy('snowball');

  // Mortgage Rollover Calculation:
  // If enabled and all consumer debts are paid off in X months, the active budget becomes extra mortgage principal!
  let mortgageRolloverMonthsSaved = 0;
  let mortgageRolloverInterestSaved = 0;
  if (mortgageRollover && mortgageBalance > 0 && mortgageRate > 0) {
    const monthsUntilFreed = avalancheRes.summary.totalMonthsToPayoff;
    const freedMonthlyCash = activeBudget;
    // Estimate interest saved on mortgage by injecting freedMonthlyCash after consumer debt payoff
    const monthlyMtgRate = mortgageRate / 100 / 12;
    const estRemainingMtgBal = Math.max(0, mortgageBalance * Math.pow(1 - 0.003, monthsUntilFreed));
    mortgageRolloverInterestSaved = Math.round(estRemainingMtgBal * monthlyMtgRate * 12 * 2.5);
    mortgageRolloverMonthsSaved = Math.min(72, Math.round(freedMonthlyCash / 50));
  }

  return {
    baselineTotalInterest: Math.round(baselineTotalInterest * 100) / 100,
    baselineMaxMonths,
    avalanche: avalancheRes.summary,
    snowball: snowballRes.summary,
    schedule: strategy === 'avalanche' ? avalancheRes.schedule : snowballRes.schedule,
    mortgageRolloverMonthsSaved,
    mortgageRolloverInterestSaved
  };
};
