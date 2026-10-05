/**
 * TrueMortgage — amortization engine.
 *
 * Pure functions, no DOM. Every number shown in the UI comes from `analyzeMortgage`.
 */

import {
  Analysis,
  Compounding,
  Frequency,
  MortgageInputs,
  MortgageInsurance,
  Note,
  PaymentRow,
  ScheduleResult,
  YearRow
} from './types.js';
import {
  CMHC_LONG_AMORTIZATION_SURCHARGE,
  CMHC_MAX_PRICE,
  CMHC_TIERS,
  DEFAULT_INPUTS,
  FREQUENCIES,
  PMI_AUTO_CANCEL_LTV,
  REGIONS
} from './regions.js';

export const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Coerces any (possibly stale or hand-edited) input object into a valid one. */
export const sanitizeInputs = (raw: Partial<MortgageInputs>): MortgageInputs => {
  const d = DEFAULT_INPUTS;
  const country = raw.country && raw.country in REGIONS ? raw.country : d.country;
  const frequency = raw.frequency && raw.frequency in FREQUENCIES ? raw.frequency : d.frequency;
  const homePrice = clamp(num(raw.homePrice, d.homePrice), 0, 1e9);
  return {
    country,
    mode: raw.mode === 'existing' ? 'existing' : 'purchase',
    homePrice,
    downPayment: clamp(num(raw.downPayment, d.downPayment), 0, homePrice),
    currentBalance: clamp(num(raw.currentBalance, d.currentBalance), 0, 1e9),
    annualRate: clamp(num(raw.annualRate, d.annualRate), 0, 30),
    amortizationYears: clamp(num(raw.amortizationYears, d.amortizationYears), 1, 40),
    frequency,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate || '') ? raw.startDate! : d.startDate,
    extraMonthly: clamp(num(raw.extraMonthly, 0), 0, 1e7),
    annualLumpSum: clamp(num(raw.annualLumpSum, 0), 0, 1e9),
    paymentIncreaseEnabled: Boolean(raw.paymentIncreaseEnabled),
    customPayment: clamp(num(raw.customPayment, 0), 0, 1e7),
    propertyTaxYearly: clamp(num(raw.propertyTaxYearly, 0), 0, 1e7),
    homeInsuranceYearly: clamp(num(raw.homeInsuranceYearly, 0), 0, 1e7),
    feesMonthly: clamp(num(raw.feesMonthly, 0), 0, 1e7),
    pmiRate: clamp(num(raw.pmiRate, d.pmiRate), 0, 5)
  };
};

/** Interest rate per payment period, honouring the country's compounding convention. */
export const periodicRate = (annualPct: number, compounding: Compounding, perYear: number): number => {
  const r = Math.max(0, annualPct) / 100;
  if (compounding === 'semi-annual') return Math.pow(1 + r / 2, 2 / perYear) - 1;
  return r / perYear;
};

/** Level payment that fully repays `principal` over `n` periods at rate `r` per period. */
export const annuityPayment = (principal: number, r: number, n: number): number => {
  if (principal <= 0 || n <= 0) return 0;
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
};

/** Parses YYYY-MM-DD as a local date (avoids the UTC off-by-one of `new Date('YYYY-MM-DD')`). */
export const parseDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, (m || 1) - 1, d || 1);
};

const addMonthsClamped = (start: Date, months: number): Date => {
  const target = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(start.getDate(), lastDay));
  return target;
};

/** Date of payment number `n` (1-based). */
export const paymentDate = (start: Date, n: number, frequency: Frequency): Date => {
  const i = n - 1;
  switch (FREQUENCIES[frequency].perYear) {
    case 12:
      return addMonthsClamped(start, i);
    case 24: {
      const d = addMonthsClamped(start, Math.floor(i / 2));
      if (i % 2 === 1) d.setDate(d.getDate() + 15);
      return d;
    }
    case 26:
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 14 * i);
    default:
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * i);
  }
};

export interface ScheduleParams {
  principal: number;
  annualRate: number;
  compounding: Compounding;
  years: number;
  frequency: Frequency;
  startDate: string;
  extraMonthly?: number;
  annualLumpSum?: number;
  paymentIncrease?: number;
}

/** Required payment per period. Accelerated payments are the monthly payment ÷ 2 (bi-weekly) or ÷ 4 (weekly). */
export const regularPayment = (p: Omit<ScheduleParams, 'startDate'>): number => {
  const f = FREQUENCIES[p.frequency];
  if (p.frequency === 'accelerated-bi-weekly' || p.frequency === 'accelerated-weekly') {
    const monthly = annuityPayment(
      p.principal,
      periodicRate(p.annualRate, p.compounding, 12),
      Math.round(p.years * 12)
    );
    return round2(monthly / (f.perYear === 26 ? 2 : 4));
  }
  return round2(
    annuityPayment(p.principal, periodicRate(p.annualRate, p.compounding, f.perYear), Math.round(p.years * f.perYear))
  );
};

/** Full payment-by-payment schedule. */
export const buildSchedule = (p: ScheduleParams): ScheduleResult => {
  const perYear = FREQUENCIES[p.frequency].perYear;
  const basePayment = regularPayment(p);
  const paymentIncrease = Math.max(0, p.paymentIncrease || 0);
  const effectivePayment = round2(basePayment + paymentIncrease);

  const empty: ScheduleResult = {
    rows: [],
    regularPayment: 0,
    basePayment: 0,
    periodsPerYear: perYear,
    totalInterest: 0,
    totalPaid: 0,
    numPayments: 0,
    payoffDate: null
  };
  if (p.principal <= 0.005) return empty;

  const r = periodicRate(p.annualRate, p.compounding, perYear);
  const lastScheduled = Math.max(1, Math.round(p.years * perYear));
  const extraPerPeriod = (Math.max(0, p.extraMonthly || 0) * 12) / perYear;
  const lump = Math.max(0, p.annualLumpSum || 0);
  const start = parseDate(p.startDate);

  const rows: PaymentRow[] = [];
  let balance = round2(p.principal);
  let totalInterest = 0;
  let totalPaid = 0;

  for (let n = 1; n <= lastScheduled && balance > 0; n++) {
    const interest = round2(balance * r);
    const owing = round2(balance + interest);
    let scheduled = basePayment;
    // Lump sum lands on each loan anniversary (last payment of every loan year).
    // Payment increase prepayment privilege (TD Payment Increase / RBC Double-Up) adds directly to principal.
    let extra = round2(extraPerPeriod + paymentIncrease + (n % perYear === 0 ? lump : 0));

    if (n === lastScheduled || scheduled >= owing) {
      // Final payment clears whatever is left (absorbs cent-rounding drift).
      scheduled = owing;
      extra = 0;
    } else if (scheduled + extra > owing) {
      extra = round2(owing - scheduled);
    }

    const principal = round2(scheduled - interest);
    balance = round2(balance - principal - extra);
    if (balance < 0.005) balance = 0;

    totalInterest += interest;
    totalPaid += scheduled + extra;
    rows.push({ n, date: paymentDate(start, n, p.frequency), scheduled, interest, principal, extra, balance });
  }

  return {
    rows,
    regularPayment: effectivePayment,
    basePayment,
    periodsPerYear: perYear,
    totalInterest: round2(totalInterest),
    totalPaid: round2(totalPaid),
    numPayments: rows.length,
    payoffDate: rows.length ? rows[rows.length - 1]!.date : null
  };
};

/**
 * Canadian minimum down payment (rules effective Dec 15, 2024):
 * 5% of the first $500k, 10% of the portion up to $1.5M, 20% of the full price at $1.5M or more.
 */
export const canadianMinimumDown = (price: number): number => {
  if (price <= 0) return 0;
  if (price >= CMHC_MAX_PRICE) return round2(price * 0.2);
  if (price <= 500_000) return round2(price * 0.05);
  return round2(25_000 + (price - 500_000) * 0.1);
};

/** CMHC premium rate for a given loan-to-value, or null when insurance is not needed / not available. */
export const cmhcPremiumRate = (ltv: number, amortizationYears: number): number | null => {
  const eps = 1e-9;
  if (ltv <= 0.8 + eps || ltv > 0.95 + eps) return null;
  const tier = CMHC_TIERS.find((t) => ltv <= t.maxLtv + eps)!;
  return tier.rate + (amortizationYears > 25 ? CMHC_LONG_AMORTIZATION_SURCHARGE : 0);
};

/** Groups the schedule by loan year. */
export const summarizeByYear = (s: ScheduleResult): YearRow[] => {
  const years: YearRow[] = [];
  for (const row of s.rows) {
    const y = Math.ceil(row.n / s.periodsPerYear);
    let yr = years[y - 1];
    if (!yr) {
      yr = { year: y, endDate: row.date, interest: 0, principal: 0, extra: 0, endBalance: 0 };
      years.push(yr);
    }
    yr.interest = round2(yr.interest + row.interest);
    yr.principal = round2(yr.principal + row.principal);
    yr.extra = round2(yr.extra + row.extra);
    yr.endBalance = row.balance;
    yr.endDate = row.date;
  }
  return years;
};

const fmtMoney = (amount: number, country: MortgageInputs['country']) => {
  const r = REGIONS[country];
  return new Intl.NumberFormat(r.locale, { style: 'currency', currency: r.currency, maximumFractionDigits: 0 }).format(
    amount
  );
};

/** Runs the whole calculation for the UI. */
export const analyzeMortgage = (raw: Partial<MortgageInputs>): Analysis => {
  const inputs = sanitizeInputs(raw);
  const region = REGIONS[inputs.country];
  const notes: Note[] = [];
  const money = (x: number) => fmtMoney(x, inputs.country);

  const insurance: MortgageInsurance = {
    kind: 'none',
    premium: 0,
    premiumRate: 0,
    pmiMonthly: 0,
    pmiTotal: 0,
    pmiEndDate: null
  };

  let loanAmount: number;
  if (inputs.mode === 'purchase') {
    const { homePrice, downPayment } = inputs;
    const base = homePrice - downPayment;
    const ltv = homePrice > 0 ? base / homePrice : 0;
    loanAmount = base;

    if (raw.downPayment !== undefined && num(raw.downPayment, 0) > homePrice) {
      notes.push({ level: 'error', text: 'Your down payment is larger than the home price.' });
    }

    if (region.insurance === 'cmhc' && homePrice > 0 && base > 0) {
      const minDown = canadianMinimumDown(homePrice);
      if (downPayment + 0.5 < minDown) {
        notes.push({
          level: 'error',
          text: `In Canada the minimum down payment for a ${money(homePrice)} home is ${money(minDown)}.`
        });
      }
      const rate = homePrice < CMHC_MAX_PRICE ? cmhcPremiumRate(ltv, inputs.amortizationYears) : null;
      if (rate !== null) {
        insurance.kind = 'cmhc';
        insurance.premiumRate = rate;
        insurance.premium = round2(base * rate);
        loanAmount = round2(base + insurance.premium);
        notes.push({
          level: 'info',
          text: `With less than 20% down, mortgage default insurance is required. A premium of ${money(
            insurance.premium
          )} (${(rate * 100).toFixed(2)}%) has been added to your loan. In ON, QC and SK, sales tax on the premium is paid at closing.`
        });
        if (inputs.amortizationYears > 25) {
          notes.push({
            level: 'warn',
            text: 'Insured mortgages over 25 years are only available to first-time buyers or buyers of newly built homes.'
          });
        }
      }
    }

    if (region.insurance === 'pmi' && ltv > 0.8 && inputs.pmiRate > 0) {
      insurance.kind = 'pmi';
      insurance.pmiMonthly = round2((loanAmount * inputs.pmiRate) / 100 / 12);
    }
  } else {
    loanAmount = round2(inputs.currentBalance);
  }

  const common = {
    principal: loanAmount,
    annualRate: inputs.annualRate,
    compounding: region.compounding,
    years: inputs.amortizationYears,
    startDate: inputs.startDate
  };

  const basePayment = regularPayment({
    ...common,
    frequency: inputs.frequency
  });
  const maxPayment = round2(basePayment * 2);

  let paymentIncrease = 0;
  if (inputs.paymentIncreaseEnabled && loanAmount > 0 && inputs.customPayment && inputs.customPayment > basePayment) {
    const clampedCustom = round2(clamp(inputs.customPayment, basePayment, maxPayment));
    paymentIncrease = round2(clampedCustom - basePayment);
  }

  const plan = buildSchedule({
    ...common,
    frequency: inputs.frequency,
    extraMonthly: inputs.extraMonthly,
    annualLumpSum: inputs.annualLumpSum,
    paymentIncrease
  });
  const baseline = buildSchedule({ ...common, frequency: 'monthly' });

  // PMI runs until the balance reaches 78% of the original home value.
  if (insurance.kind === 'pmi') {
    const threshold = inputs.homePrice * PMI_AUTO_CANCEL_LTV;
    const perPayment = (loanAmount * inputs.pmiRate) / 100 / plan.periodsPerYear;
    let opening = loanAmount;
    let count = 0;
    for (const row of plan.rows) {
      if (opening <= threshold) {
        insurance.pmiEndDate = row.date;
        break;
      }
      count++;
      opening = row.balance;
    }
    insurance.pmiTotal = round2(count * perPayment);
    notes.push({
      level: 'info',
      text: `With less than 20% down, lenders usually charge private mortgage insurance (PMI): about ${money(
        insurance.pmiMonthly
      )}/month, ${money(insurance.pmiTotal)} in total. It cancels automatically once you owe 78% of the home's original value${
        insurance.pmiEndDate
          ? ` (around ${insurance.pmiEndDate.toLocaleDateString(region.locale, { month: 'short', year: 'numeric' })})`
          : ''
      }.`
    });
  }

  if (inputs.paymentIncreaseEnabled && paymentIncrease > 0) {
    notes.push({
      level: 'info',
      text: `Payment increase active: paying an extra ${money(paymentIncrease)} each payment (${money(
        paymentIncrease * plan.periodsPerYear
      )}/year) directly toward principal (TD Payment Increase / RBC Double-Up privilege).`
    });
  }

  if (inputs.amortizationYears > 30) {
    notes.push({ level: 'info', text: 'Amortizations longer than 30 years are uncommon and greatly increase total interest.' });
  }

  const yearlyPrepay = inputs.extraMonthly * 12 + inputs.annualLumpSum;
  if (region.prepaymentCap && loanAmount > 0 && yearlyPrepay > loanAmount * region.prepaymentCap) {
    notes.push({
      level: 'warn',
      text: `Many ${region.name === 'Canada' ? 'Canadian' : 'UK'} lenders limit penalty-free prepayments to about ${
        region.prepaymentCap * 100
      }% of the original loan per year (${money(loanAmount * region.prepaymentCap)}). Check your mortgage terms.`
    });
  }

  const hasStrategy =
    inputs.frequency !== 'monthly' ||
    inputs.extraMonthly > 0 ||
    inputs.annualLumpSum > 0 ||
    paymentIncrease > 0;
  const baselineMonths = baseline.numPayments;
  const planMonths = (plan.numPayments * 12) / plan.periodsPerYear;
  const monthlyEquivalent = round2((plan.regularPayment * plan.periodsPerYear) / 12);
  const monthlyHousingCost = round2(
    monthlyEquivalent +
      inputs.propertyTaxYearly / 12 +
      inputs.homeInsuranceYearly / 12 +
      inputs.feesMonthly +
      insurance.pmiMonthly
  );

  return {
    inputs,
    loanAmount,
    insurance,
    plan,
    baseline,
    hasStrategy,
    interestSaved: round2(Math.max(0, baseline.totalInterest - plan.totalInterest)),
    monthsSaved: Math.max(0, Math.round(baselineMonths - planMonths)),
    monthlyEquivalent,
    monthlyHousingCost,
    years: summarizeByYear(plan),
    notes,
    basePayment,
    maxPayment,
    paymentIncrease
  };
};
