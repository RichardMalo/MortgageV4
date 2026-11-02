/**
 * TrueMortgage — "what if" scenario engine.
 *
 * Pure functions, no DOM. Each helper re-runs `buildSchedule` with a variation of the
 * user's plan so the decision charts can answer "which path should I take?".
 * Every result is measured against `analysis.baseline` (monthly, no prepayments) so the
 * numbers line up with the savings card.
 */

import { Analysis, MortgageInputs, ScheduleResult } from './types.js';
import { buildSchedule, cappedPrepaymentPerYear, parseDate, paymentDate, round2, ScheduleParams } from './mortgage.js';
import { REGIONS } from './regions.js';
import { formatDuration, formatMoney, formatMonthYear, isoDate } from './format.js';

type BaseParams = Omit<ScheduleParams, 'frequency'>;

const baseParams = (a: Analysis): BaseParams => ({
  principal: a.loanAmount,
  annualRate: a.inputs.annualRate,
  compounding: REGIONS[a.inputs.country].compounding,
  years: a.inputs.amortizationYears,
  startDate: a.inputs.startDate
});

/** Length of a schedule, in months. */
export const scheduleMonths = (s: ScheduleResult): number => (s.numPayments * 12) / s.periodsPerYear;

/** Sum of all prepayments (extra + lump sums + payment increases) in a schedule. */
export const totalPrepaid = (s: ScheduleResult): number => round2(s.rows.reduce((t, r) => t + r.extra, 0));

const hasLoan = (a: Analysis) => a.loanAmount > 0 && a.plan.numPayments > 0;

/** Rounds a raw step up to a "nice" value: 10, 25, 50, 100, 250, 500, 1000… */
export const niceStep = (raw: number): number => {
  if (raw <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return Math.max(10, nice * mag);
};

// ---------------------------------------------------------------------------
// 1. Extra-payment sensitivity sweep
// ---------------------------------------------------------------------------

export interface SweepPoint {
  extraMonthly: number;
  interestSaved: number;
  monthsSaved: number;
  totalInterest: number;
  totalPrepaid: number;
  payoffDate: Date | null;
}

export interface ExtraSweep {
  points: SweepPoint[];
  /** The user's current setting (identical to `analysis.plan`). */
  current: SweepPoint;
  /** Same plan with `nudge` more per month — powers the "add a little more" caption. */
  next: SweepPoint;
  nudge: number;
  step: number;
  maxExtra: number;
  /** Highest extra/month that stays within the region's typical penalty-free cap, if any. */
  capExtraMonthly: number | null;
  /** Interest saved per $1 of extra/month prepaid (current vs $0 extra). */
  perDollar: number | null;
}

const toPoint = (a: Analysis, extraMonthly: number, s: ScheduleResult): SweepPoint => ({
  extraMonthly,
  interestSaved: round2(Math.max(0, a.baseline.totalInterest - s.totalInterest)),
  monthsSaved: Math.max(0, Math.round(a.baseline.numPayments - scheduleMonths(s))),
  totalInterest: s.totalInterest,
  totalPrepaid: totalPrepaid(s),
  payoffDate: s.payoffDate
});

/**
 * Varies only the extra monthly amount while keeping the rest of the user's strategy
 * (frequency, lump sum, payment increase) fixed.
 */
export const extraPaymentSweep = (a: Analysis, steps = 20, nudge = 100): ExtraSweep | null => {
  if (!hasLoan(a)) return null;
  const cur = Math.max(0, a.inputs.extraMonthly);
  const step = niceStep(Math.max(500, cur * 2, a.monthlyEquivalent * 0.5) / steps);
  const maxExtra = step * steps;

  const run = (extra: number) =>
    toPoint(
      a,
      extra,
      buildSchedule({
        ...baseParams(a),
        frequency: a.inputs.frequency,
        extraMonthly: extra,
        annualLumpSum: a.inputs.annualLumpSum,
        paymentIncrease: a.paymentIncrease
      })
    );

  const points: SweepPoint[] = [];
  for (let i = 0; i <= steps; i++) points.push(run(i * step));

  const current = toPoint(a, cur, a.plan);
  const next = run(cur + nudge);

  const region = REGIONS[a.inputs.country];
  const perYear = a.plan.periodsPerYear;
  // Room left under the cap once the lump sum (and, where counted, the payment increase) is used.
  const otherPrepay = cappedPrepaymentPerYear(a.inputs.country, 0, a.inputs.annualLumpSum, a.paymentIncrease, perYear);
  const capExtraMonthly = region.prepaymentCap
    ? Math.max(0, (a.loanAmount * region.prepaymentCap - otherPrepay) / 12)
    : null;

  const zero = points[0]!;
  const prepaidDelta = current.totalPrepaid - zero.totalPrepaid;
  const perDollar = cur > 0 && prepaidDelta > 0 ? (current.interestSaved - zero.interestSaved) / prepaidDelta : null;

  return { points, current, next, nudge, step, maxExtra, capExtraMonthly, perDollar };
};

// ---------------------------------------------------------------------------
// 2. Strategy leaderboard
// ---------------------------------------------------------------------------

export interface Strategy {
  id: string;
  label: string;
  /** Short description of what the user commits to. */
  detail: string;
  interestSaved: number;
  monthsSaved: number;
  /** Extra cash committed per year versus regular monthly payments. */
  extraPerYear: number;
  payoffDate: Date | null;
  /** Interest saved per $1 of extra cash committed over the life of the plan. */
  perDollar: number;
  /** Form changes that adopt this strategy (null for the user's current plan). */
  patch: Partial<MortgageInputs> | null;
  isCurrent: boolean;
  /** True when this strategy's annual prepayments exceed the region's typical penalty-free cap. */
  exceedsCap: boolean;
}

const RESET_STRATEGY: Partial<MortgageInputs> = {
  frequency: 'monthly',
  extraMonthly: 0,
  annualLumpSum: 0,
  paymentIncreaseEnabled: false
};

/** Compares common prepayment strategies (each one on its own) plus the user's current plan. */
export const strategyLeaderboard = (a: Analysis): Strategy[] => {
  if (!hasLoan(a)) return [];
  const base = baseParams(a);
  const monthlyBase = a.baseline.regularPayment;
  const region = REGIONS[a.inputs.country];
  const capLimit = region.prepaymentCap ? a.loanAmount * region.prepaymentCap : null;
  const money = (x: number) => formatMoney(x, a.inputs.country);

  const build = (
    id: string,
    label: string,
    detail: string,
    s: ScheduleResult,
    extraPerYear: number,
    cappedYearly: number,
    patch: Partial<MortgageInputs> | null,
    isCurrent = false
  ): Strategy => {
    const months = scheduleMonths(s);
    const committed = Math.max(0, extraPerYear) * (months / 12);
    const interestSaved = round2(Math.max(0, a.baseline.totalInterest - s.totalInterest));
    return {
      id,
      label,
      detail,
      interestSaved,
      monthsSaved: Math.max(0, Math.round(a.baseline.numPayments - months)),
      extraPerYear: round2(Math.max(0, extraPerYear)),
      payoffDate: s.payoffDate,
      // Undefined (0) when the strategy costs no extra cash, e.g. regular bi-weekly.
      perDollar: committed >= 1 ? interestSaved / committed : 0,
      patch,
      isCurrent,
      exceedsCap: capLimit !== null && cappedYearly > capLimit + 0.5
    };
  };

  const list: Strategy[] = [];

  // Accelerated bi-weekly: half the monthly payment every 2 weeks (≈ 13 monthly payments/yr).
  const accel = buildSchedule({ ...base, frequency: 'accelerated-bi-weekly' });
  list.push(
    build(
      'accel-biweekly',
      'Accelerated bi-weekly',
      `${money(accel.regularPayment)} every 2 weeks`,
      accel,
      accel.regularPayment * 26 - monthlyBase * 12,
      0,
      { ...RESET_STRATEGY, frequency: 'accelerated-bi-weekly' }
    )
  );

  // Payment increase privilege (+10%, +25%, double-up).
  const increases: Array<[string, string, number]> = [
    ['inc-10', '+10% payment', 0.1],
    ['inc-25', '+25% payment', 0.25],
    ['inc-100', 'Double-up payment', 1]
  ];
  for (const [id, label, pct] of increases) {
    const inc = round2(monthlyBase * pct);
    const s = buildSchedule({ ...base, frequency: 'monthly', paymentIncrease: inc });
    const capped = cappedPrepaymentPerYear(a.inputs.country, 0, 0, inc, 12);
    list.push(
      build(id, label, `${money(monthlyBase + inc)}/mo (+${money(inc)})`, s, inc * 12, capped, {
        ...RESET_STRATEGY,
        paymentIncreaseEnabled: true,
        customPayment: round2(monthlyBase + inc)
      })
    );
  }

  // Flat extra per month.
  for (const extra of [100, 250]) {
    const s = buildSchedule({ ...base, frequency: 'monthly', extraMonthly: extra });
    const capped = cappedPrepaymentPerYear(a.inputs.country, extra, 0, 0, 12);
    list.push(
      build(`extra-${extra}`, `+${money(extra)}/mo extra`, `${money(extra)} extra each month`, s, extra * 12, capped, {
        ...RESET_STRATEGY,
        extraMonthly: extra
      })
    );
  }

  // Yearly lump sum (~2% of the loan, rounded to 500).
  const lump = Math.max(1000, Math.round((a.loanAmount * 0.02) / 500) * 500);
  const lumpSched = buildSchedule({ ...base, frequency: 'monthly', annualLumpSum: lump });
  const lumpCapped = cappedPrepaymentPerYear(a.inputs.country, 0, lump, 0, 12);
  list.push(
    build('lump', `${money(lump)} yearly lump sum`, `${money(lump)} once a year`, lumpSched, lump, lumpCapped, {
      ...RESET_STRATEGY,
      annualLumpSum: lump
    })
  );

  // The user's current plan, if it differs from the baseline.
  if (a.hasStrategy) {
    const perYear = a.plan.periodsPerYear;
    const extraPerYear =
      a.plan.regularPayment * perYear + a.inputs.extraMonthly * 12 + a.inputs.annualLumpSum - monthlyBase * 12;
    const currentCapped = cappedPrepaymentPerYear(
      a.inputs.country,
      a.inputs.extraMonthly,
      a.inputs.annualLumpSum,
      a.paymentIncrease,
      perYear
    );
    list.push(
      build('current', 'Your current plan', 'What you entered above', a.plan, extraPerYear, currentCapped, null, true)
    );
  }

  return list.sort((x, y) => y.interestSaved - x.interestSaved);
};

// ---------------------------------------------------------------------------
// 3. Cumulative interest ("Money Kept")
// ---------------------------------------------------------------------------

export interface CumulativeSeries {
  /** Elapsed years at each point (starts at 0). */
  years: number[];
  /** Cumulative interest paid at each point. */
  interest: number[];
}

export const cumulativeInterest = (s: ScheduleResult): CumulativeSeries => {
  const years = [0];
  const interest = [0];
  let sum = 0;
  for (const r of s.rows) {
    sum += r.interest;
    years.push(r.n / s.periodsPerYear);
    interest.push(round2(sum));
  }
  return { years, interest };
};

/** Cumulative interest at a given elapsed time (step-wise; flat after payoff). */
export const cumulativeAt = (series: CumulativeSeries, years: number): number => {
  let lo = 0;
  let hi = series.years.length - 1;
  if (years >= series.years[hi]!) return series.interest[hi]!;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series.years[mid]! <= years) lo = mid;
    else hi = mid - 1;
  }
  return series.interest[lo]!;
};

// ---------------------------------------------------------------------------
// 4. Interest vs principal tipping point
// ---------------------------------------------------------------------------

export interface YearSplit {
  /** Mid-point of the loan year, in elapsed years (0.5, 1.5, …). */
  x: number;
  /** Average interest per month in this loan year. */
  interest: number;
  /** Average principal (incl. prepayments) per month in this loan year. */
  principal: number;
}

export interface TippingPoint {
  series: YearSplit[];
  /** Elapsed years when principal first matches interest (null = never). */
  crossYears: number | null;
  crossDate: Date | null;
  /** 1-based loan year when annual principal+extra first matches interest. */
  crossYear: number | null;
  /** 1-based payment row number (n) of the tipping point payment. */
  crossRowIndex: number | null;
}

export const tippingPoint = (s: ScheduleResult, startDate: string): TippingPoint => {
  const series: YearSplit[] = [];
  const perYear = s.periodsPerYear;
  let bucket = { interest: 0, principal: 0, count: 0 };
  s.rows.forEach((r, i) => {
    bucket.interest += r.interest;
    bucket.principal += r.principal + r.extra;
    bucket.count++;
    const endOfYear = r.n % perYear === 0 || i === s.rows.length - 1;
    if (endOfYear) {
      const months = (bucket.count * 12) / perYear;
      const y = Math.ceil(r.n / perYear);
      series.push({ x: y - 0.5, interest: bucket.interest / months, principal: bucket.principal / months });
      bucket = { interest: 0, principal: 0, count: 0 };
    }
  });

  let crossYears: number | null = null;
  let crossYear: number | null = null;
  let crossRowIndex: number | null = null;
  let crossDate: Date | null = null;

  for (let i = 0; i < series.length; i++) {
    const cur = series[i]!;
    const diff = cur.principal - cur.interest;
    if (diff >= 0) {
      crossYear = i + 1;
      if (i === 0) {
        crossYears = 0;
      } else {
        const prev = series[i - 1]!;
        const prevDiff = prev.principal - prev.interest;
        const t = prevDiff === diff ? 0 : -prevDiff / (diff - prevDiff);
        crossYears = prev.x + t * (cur.x - prev.x);
      }
      const startRowOfTipYear = i * perYear + 1;
      const tipRow =
        s.rows.find((r) => r.n >= startRowOfTipYear && r.principal + r.extra >= r.interest) ||
        s.rows.find((r) => r.principal + r.extra >= r.interest) ||
        s.rows[Math.min(s.rows.length - 1, (i + 1) * perYear - 1)];
      crossRowIndex = tipRow ? tipRow.n : Math.min(s.rows.length, (i + 1) * perYear);
      crossDate = tipRow
        ? tipRow.date
        : paymentDate(parseDate(startDate), Math.max(1, Math.round(crossYears * 12)), 'monthly');
      break;
    }
  }

  return { series, crossYears, crossDate, crossYear, crossRowIndex };
};

// ---------------------------------------------------------------------------
// 5. Cost of waiting
// ---------------------------------------------------------------------------

export interface DelayPoint {
  delayYears: number;
  interestSaved: number;
  monthsSaved: number;
  /** Savings given up compared with starting now. */
  lostSavings: number;
}

/** The prepayment levers a delayed strategy switches on. */
export interface PrepayStrategy {
  frequency: MortgageInputs['frequency'];
  extraMonthly: number;
  annualLumpSum: number;
  paymentIncrease: number;
}

export const currentStrategy = (a: Analysis): PrepayStrategy => ({
  frequency: a.inputs.frequency,
  extraMonthly: a.inputs.extraMonthly,
  annualLumpSum: a.inputs.annualLumpSum,
  paymentIncrease: a.paymentIncrease
});

/**
 * Pays the baseline (monthly, no extras) for `delay` years, then switches to the strategy
 * (the user's plan by default) on the remaining balance and remaining amortization.
 */
export const costOfWaiting = (
  a: Analysis,
  delays: number[] = [0, 1, 2, 3, 5],
  strategy: PrepayStrategy | null = null
): DelayPoint[] => {
  const useCurrent = strategy === null;
  if (!hasLoan(a) || (useCurrent && !a.hasStrategy)) return [];
  const strat = strategy ?? currentStrategy(a);
  const base = baseParams(a);
  const start = parseDate(a.inputs.startDate);
  const out: DelayPoint[] = [];

  for (const d of delays) {
    let totalInterest: number;
    let months: number;
    if (d <= 0) {
      const s = useCurrent ? a.plan : buildSchedule({ ...base, ...strat });
      totalInterest = s.totalInterest;
      months = scheduleMonths(s);
    } else {
      const periods = Math.round(d * 12);
      if (periods >= a.baseline.numPayments || d >= a.inputs.amortizationYears) break;
      const phase1 = a.baseline.rows.slice(0, periods);
      const balance = phase1[phase1.length - 1]!.balance;
      const interest1 = phase1.reduce((t, r) => t + r.interest, 0);
      const phase2 = buildSchedule({
        ...base,
        ...strat,
        principal: balance,
        years: a.inputs.amortizationYears - d,
        startDate: isoDate(paymentDate(start, periods + 1, 'monthly'))
      });
      totalInterest = interest1 + phase2.totalInterest;
      months = periods + scheduleMonths(phase2);
    }
    out.push({
      delayYears: d,
      interestSaved: round2(Math.max(0, a.baseline.totalInterest - totalInterest)),
      monthsSaved: Math.max(0, Math.round(a.baseline.numPayments - months)),
      lostSavings: 0
    });
  }

  const now = out[0]?.interestSaved ?? 0;
  out.forEach((p) => (p.lostSavings = round2(Math.max(0, now - p.interestSaved))));
  return out;
};

// ---------------------------------------------------------------------------
// 6. Mortgage Horizons Milestones
// ---------------------------------------------------------------------------

export interface MilestoneData {
  key: 'term' | 'tipping' | 'half' | 'free';
  title: string;
  pillClass: string;
  icon: string;
  year: number;
  monthIndex: number;
  dateStr: string;
  mainMetric: string;
  subMetric: string;
  descText: string;
  badgeDesktop: string;
  pipMobile: string;
}

/** Computes up to 4 landmark milestones (5-Yr Term, Tipping Point, 50% Equity, Mortgage-Free). */
export const buildMilestones = (a: Analysis): MilestoneData[] => {
  const { plan, inputs: inp } = a;
  const c = inp.country;
  const money = (x: number, cents = false) => formatMoney(x, c, cents);
  const initialPrincipal = a.loanAmount;

  if (!a.years || a.years.length <= 1 || initialPrincipal <= 0) {
    return [];
  }

  const tipInfo = tippingPoint(plan, inp.startDate);
  const tippingYear = tipInfo.crossYear ?? -1;
  let halfEquityYear = -1;

  for (const yr of a.years) {
    if (halfEquityYear === -1 && yr.endBalance <= initialPrincipal * 0.5) {
      halfEquityYear = yr.year;
      break;
    }
  }

  const milestones: MilestoneData[] = [];

  // 1. 5-Yr Term
  if (a.years.length > 5) {
    const y5 = a.years.find((y) => y.year === 5);
    if (y5) {
      const paidDown = Math.max(0, initialPrincipal - y5.endBalance);
      const pctPaid = Math.round((paidDown / initialPrincipal) * 100);
      milestones.push({
        key: 'term',
        title: '5-Yr Term',
        pillClass: 'milestone-pill-term',
        icon: '↺',
        year: 5,
        monthIndex: Math.min(plan.rows.length, 5 * plan.periodsPerYear),
        dateStr: formatMonthYear(y5.endDate, c),
        mainMetric: money(y5.endBalance),
        subMetric: 'Remaining balance',
        descText: `${pctPaid}% of loan paid down · Fixed term concludes; renew or refinance checkpoint.`,
        badgeDesktop: '<span class="milestone-badge milestone-renewal">5-Yr</span>',
        pipMobile: '<span class="milestone-pip pip-renewal" title="5-Yr Term">↺</span>'
      });
    }
  }

  // 2. Tipping Point (unified with Tipping Point chart & exact payment row date)
  if (tippingYear > 0) {
    const yTip = a.years.find((y) => y.year === tippingYear);
    if (yTip) {
      const tipMonth =
        tipInfo.crossRowIndex ?? Math.min(plan.rows.length, tippingYear * plan.periodsPerYear);
      const tipDate = tipInfo.crossDate ?? yTip.endDate;
      const yTipPrincipal = round2(yTip.principal + yTip.extra);
      milestones.push({
        key: 'tipping',
        title: 'Tipping Point',
        pillClass: 'milestone-pill-tipping',
        icon: '⚖',
        year: tippingYear,
        monthIndex: tipMonth,
        dateStr: formatMonthYear(tipDate, c),
        mainMetric: 'Principal > Interest',
        subMetric: `${money(yTipPrincipal)} vs ${money(yTip.interest)}`,
        descText:
          tippingYear === 1
            ? 'From Day 1, your payments build more equity than bank interest.'
            : 'Equity inflection point: payments build equity faster than bank interest.',
        badgeDesktop: '<span class="milestone-badge milestone-tipping">Tipping ⚖</span>',
        pipMobile: '<span class="milestone-pip pip-tipping" title="Tipping Point">⚖</span>'
      });
    }
  }

  // 3. 50% Equity (displays exact payment date when balance crosses 50%)
  if (halfEquityYear > 0) {
    const yHalf = a.years.find((y) => y.year === halfEquityYear) || a.years[a.years.length - 1];
    if (yHalf) {
      const halfMonthRow = plan.rows.find((r) => r.balance <= initialPrincipal * 0.5);
      const halfMonth = halfMonthRow ? halfMonthRow.n : Math.min(plan.rows.length, halfEquityYear * plan.periodsPerYear);
      const halfDate = halfMonthRow ? halfMonthRow.date : yHalf.endDate;
      const halfBalance = halfMonthRow ? halfMonthRow.balance : yHalf.endBalance;
      milestones.push({
        key: 'half',
        title: '50% Equity',
        pillClass: 'milestone-pill-half',
        icon: '½',
        year: halfEquityYear,
        monthIndex: halfMonth,
        dateStr: formatMonthYear(halfDate, c),
        mainMetric: money(halfBalance),
        subMetric: '50% loan cleared',
        descText: `Halfway mark · Balance halved to ${money(halfBalance)} as payoff accelerates.`,
        badgeDesktop: '<span class="milestone-badge milestone-half">50%</span>',
        pipMobile: '<span class="milestone-pip pip-half" title="50% Equity">½</span>'
      });
    }
  }

  // 4. Mortgage-Free
  const yLast = a.years[a.years.length - 1];
  if (yLast) {
    const savedInfo = a.hasStrategy && a.interestSaved > 0 ? ` (saved ${money(a.interestSaved)})` : '';
    const zeroMoney = money(0);
    milestones.push({
      key: 'free',
      title: 'Mortgage-Free',
      pillClass: 'milestone-pill-free',
      icon: '★',
      year: yLast.year,
      monthIndex: plan.rows.length,
      dateStr: formatMonthYear(plan.payoffDate, c),
      mainMetric: `${zeroMoney} Balance`,
      subMetric: '100% Home equity',
      descText: `Loan retired in ${formatDuration((plan.numPayments * 12) / plan.periodsPerYear)}${savedInfo}. Full debt freedom.`,
      badgeDesktop: '<span class="milestone-badge milestone-free">★ Free</span>',
      pipMobile: '<span class="milestone-pip pip-free" title="Mortgage-Free">★</span>'
    });
  }

  return milestones;
};
