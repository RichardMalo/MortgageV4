/**
 * TrueMortgage — data model.
 * Mortgage-only: one loan, one schedule, optional prepayments and housing costs.
 */

export type Country = 'CA' | 'US' | 'UK' | 'AU';

/** 'purchase' = buying a home (price + down payment); 'existing' = current balance on a mortgage you already have. */
export type Mode = 'purchase' | 'existing';

export type Frequency =
  | 'monthly'
  | 'semi-monthly'
  | 'bi-weekly'
  | 'accelerated-bi-weekly'
  | 'weekly'
  | 'accelerated-weekly';

export type Compounding = 'semi-annual' | 'monthly';

export interface MortgageInputs {
  country: Country;
  mode: Mode;

  /** Purchase mode */
  homePrice: number;
  downPayment: number;

  /** Existing mode */
  currentBalance: number;

  /** Nominal annual interest rate, in percent (e.g. 4.89). */
  annualRate: number;
  /** Amortization (purchase) or remaining amortization (existing), in years. */
  amortizationYears: number;
  frequency: Frequency;
  /** Date of the first payment, YYYY-MM-DD. */
  startDate: string;

  /** Pay it off faster */
  extraMonthly: number;
  annualLumpSum: number;

  /** Other housing costs (optional, informational — they do not reduce the loan) */
  propertyTaxYearly: number;
  homeInsuranceYearly: number;
  feesMonthly: number;
  /** US private mortgage insurance, % of the loan per year. */
  pmiRate: number;
}

export interface PaymentRow {
  n: number;
  date: Date;
  /** Required payment actually applied this period (principal + interest). */
  scheduled: number;
  interest: number;
  /** Principal from the required payment. */
  principal: number;
  /** Prepayment applied this period (extra + lump sum). */
  extra: number;
  /** Balance after this payment. */
  balance: number;
}

export interface ScheduleResult {
  rows: PaymentRow[];
  regularPayment: number;
  periodsPerYear: number;
  totalInterest: number;
  totalPaid: number;
  numPayments: number;
  payoffDate: Date | null;
}

export interface YearRow {
  year: number;
  endDate: Date;
  interest: number;
  principal: number;
  extra: number;
  endBalance: number;
}

export type NoteLevel = 'info' | 'warn' | 'error';

export interface Note {
  level: NoteLevel;
  text: string;
}

export interface MortgageInsurance {
  kind: 'none' | 'cmhc' | 'pmi';
  /** CMHC: one-time premium added to the loan. */
  premium: number;
  /** CMHC premium rate (fraction). */
  premiumRate: number;
  /** PMI: cost per month while active. */
  pmiMonthly: number;
  /** PMI: total paid until it auto-cancels. */
  pmiTotal: number;
  /** PMI: date of the first payment without PMI. */
  pmiEndDate: Date | null;
}

export interface Analysis {
  inputs: MortgageInputs;
  /** Amount borrowed, including any CMHC premium. */
  loanAmount: number;
  insurance: MortgageInsurance;
  plan: ScheduleResult;
  /** Same loan paid monthly with no prepayments — used to measure savings. */
  baseline: ScheduleResult;
  hasStrategy: boolean;
  interestSaved: number;
  monthsSaved: number;
  /** Required payment expressed per month (for budgeting). */
  monthlyEquivalent: number;
  /** Monthly housing cost: P&I + tax + insurance + fees + PMI (excludes voluntary prepayments). */
  monthlyHousingCost: number;
  years: YearRow[];
  notes: Note[];
}
