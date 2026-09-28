/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Constants & Statutory Regulatory Parameters
 */

import { Inputs, MacroRatePreset } from './types.js';

export const PMI_LTV_THRESHOLD = 0.8;
export const PBKDF2_ITERATIONS = 600000;
export const MAX_CC_PAYOFF_MONTHS = 600;
export const MIN_CC_PAYMENT = 10;
export const STORAGE_KEY = 'mtg_studio_v4_state';

/** CMHC Mortgage Default Insurance Premium Rates based on LTV */
export const CMHC_TIERS = Object.freeze([
  { minLtv: 0.90001, maxLtv: 0.95, rate: 0.04 }, // 5% to 9.99% down payment
  { minLtv: 0.85001, maxLtv: 0.9, rate: 0.031 }, // 10% to 14.99% down payment
  { minLtv: 0.8, maxLtv: 0.85, rate: 0.028 } // 15% to 19.99% down payment
]);

/** CMHC Surcharge for 30-year Amortization on Insured Mortgages */
export const CMHC_30_YEAR_SURCHARGE = 0.002; // +0.20%

/** Provincial Sales Tax (PST/QST) on CMHC Insurance Premiums */
export const CMHC_PROVINCE_PST_RATES: Record<string, number> = Object.freeze({
  ON: 0.08, // Ontario 8% PST
  QC: 0.09975, // Quebec 9.975% QST
  SK: 0.06, // Saskatchewan 6% PST
  OTHER: 0.0
});

// Prefilled next-month start date
const nextM = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
export const PREFILLED_DATE = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-${String(nextM.getDate()).padStart(2, '0')}`;

/**
 * Macro Rate Shock Presets
 */
export const MACRO_RATE_PRESETS: Record<MacroRatePreset, { name: string; description: string; shift: number }> = {
  'status-quo': {
    name: 'Status Quo',
    description: 'Rates remain constant across all future renewal cycles.',
    shift: 0
  },
  'soft-landing': {
    name: 'Historical Soft Landing',
    description: 'Central banks cut rates by -1.50% over successive renewal windows.',
    shift: -1.5
  },
  'inflation-spike': {
    name: 'Inflation Spike',
    description: 'Persistent inflation forces central banks to raise rates by +2.00% at renewal.',
    shift: 2.0
  },
  custom: {
    name: 'Custom Macro Ladder',
    description: 'Individually fine-tuned term renewal rates for each renewal window.',
    shift: 0
  }
};

export const DEFAULT_INPUTS: Inputs = Object.freeze({
  homePrice: 800000,
  downPayment: 160000,
  ccBalance: 15000,
  loanAmount: 25000,
  loanOriginationFee: 0,
  loanOriginationFeeEnabled: false,
  annualRate: 4.89,
  amortizationYears: 25,
  termYears: 5,
  compounding: 'semi',
  frequency: 'monthly',
  extraPayment: 150,
  lumpSum: 0,
  lumpSums: [],
  offsetBalance: 0,
  offsetMonthlyDeposit: 0,
  usePiti: true,
  taxRate: 4200,
  insRate: 1200,
  hoaRate: 0,
  pmiRate: 0.5,
  useOppCost: true,
  investRate: 7.5,
  annualIncome: 110000,
  country: 'CA',
  province: 'ON',
  startDate: PREFILLED_DATE,
  includeCmhc: false,
  cmhcProvince: 'ON',
  includeLtt: false,
  lttProvince: 'ON',
  lttFirstTimeBuyer: false,
  isAdditionalProperty: false,
  ukFirstTimeBuyer: false,
  auState: 'NSW',
  auFirstTimeBuyer: false,
  rateShockEnabled: false,
  rateShockPreset: 'status-quo',
  termRates: {},
  ccCompounding: 'simple',
  ccMinPercent: 3,
  ccMinPrincipalPct: 1,
  ccMinFlat: 10,
  multiDebtEnabled: false,
  householdDebts: [
    { id: 'debt-1', name: 'Credit Card (High APR)', balance: 8500, rate: 21.99, minPayment: 255, type: 'credit_card' as const },
    { id: 'debt-2', name: 'Auto Loan', balance: 22000, rate: 6.49, minPayment: 460, type: 'auto_loan' as const },
    { id: 'debt-3', name: 'Student Loan', balance: 14500, rate: 5.25, minPayment: 180, type: 'student_loan' as const }
  ],
  cascadeStrategy: 'avalanche',
  cascadeMortgageRollover: true,
  cascadeMonthlyBudget: 1200,
  lang: 'en'
});
