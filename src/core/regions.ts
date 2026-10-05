/**
 * Country-specific mortgage rules and labels.
 */

import { Compounding, Country, Frequency, MortgageInputs } from './types.js';

export interface Region {
  name: string;
  locale: string;
  currency: string;
  /** How lenders in this country compound the quoted rate. */
  compounding: Compounding;
  /** Mortgage insurance model applied in purchase mode. */
  insurance: 'cmhc' | 'pmi' | 'none';
  propertyTaxLabel: string;
  feesLabel: string;
  /** Typical annual prepayment allowance (fraction of original principal) before penalties, if commonly capped. */
  prepaymentCap?: number;
}

export const REGIONS: Record<Country, Region> = {
  CA: {
    name: 'Canada',
    locale: 'en-CA',
    currency: 'CAD',
    compounding: 'semi-annual',
    insurance: 'cmhc',
    propertyTaxLabel: 'Property tax',
    feesLabel: 'Condo fees',
    prepaymentCap: 0.2
  },
  US: {
    name: 'United States',
    locale: 'en-US',
    currency: 'USD',
    compounding: 'monthly',
    insurance: 'pmi',
    propertyTaxLabel: 'Property tax',
    feesLabel: 'HOA fees'
  },
  UK: {
    name: 'United Kingdom',
    locale: 'en-GB',
    currency: 'GBP',
    compounding: 'monthly',
    insurance: 'none',
    propertyTaxLabel: 'Council tax',
    feesLabel: 'Service charge',
    prepaymentCap: 0.1
  },
  AU: {
    name: 'Australia',
    locale: 'en-AU',
    currency: 'AUD',
    compounding: 'monthly',
    insurance: 'none',
    propertyTaxLabel: 'Council rates',
    feesLabel: 'Strata fees'
  }
};

export const FREQUENCIES: Record<Frequency, { label: string; perYear: number; noun: string }> = {
  monthly: { label: 'Monthly', perYear: 12, noun: 'per month' },
  'semi-monthly': { label: 'Twice a month', perYear: 24, noun: 'twice a month' },
  'bi-weekly': { label: 'Every 2 weeks', perYear: 26, noun: 'every 2 weeks' },
  'accelerated-bi-weekly': { label: 'Every 2 weeks (accelerated)', perYear: 26, noun: 'every 2 weeks' },
  weekly: { label: 'Weekly', perYear: 52, noun: 'per week' },
  'accelerated-weekly': { label: 'Weekly (accelerated)', perYear: 52, noun: 'per week' }
};

/** CMHC premium tiers (loan-to-value → premium rate). */
export const CMHC_TIERS = [
  { maxLtv: 0.85, rate: 0.028 }, // 15–19.99% down
  { maxLtv: 0.9, rate: 0.031 }, // 10–14.99% down
  { maxLtv: 0.95, rate: 0.04 } // 5–9.99% down
] as const;
export const CMHC_LONG_AMORTIZATION_SURCHARGE = 0.002; // +0.20% when amortization > 25 years
export const CMHC_MAX_PRICE = 1_500_000;

/** US: borrower-paid PMI cancels automatically at 78% of the original home value (Homeowners Protection Act). */
export const PMI_AUTO_CANCEL_LTV = 0.78;

/** First payment defaults to the 1st of next month. */
export const defaultStartDate = (today = new Date()): string => {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export const DEFAULT_INPUTS: MortgageInputs = {
  country: 'CA',
  mode: 'purchase',
  homePrice: 770_000,
  downPayment: 154_000,
  currentBalance: 770_000,
  annualRate: 5,
  amortizationYears: 30,
  frequency: 'monthly',
  startDate: defaultStartDate(),
  extraMonthly: 0,
  annualLumpSum: 0,
  paymentIncreaseEnabled: false,
  customPayment: 0,
  propertyTaxYearly: 0,
  homeInsuranceYearly: 0,
  feesMonthly: 0,
  pmiRate: 0.5
};
