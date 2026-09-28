/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Core Data Models & Type Definitions
 */

export interface LumpSumItem {
  id: string;
  amount: number;
  paymentNumber: number;
  dateLabel?: string;
}

export type PaymentFrequency =
  | 'monthly'
  | 'semi-monthly'
  | 'bi-weekly'
  | 'accelerated-bi-weekly'
  | 'weekly'
  | 'accelerated-weekly';

export type CompoundingMethod = 'semi' | 'monthly' | 'daily';

export type MacroRatePreset = 'status-quo' | 'soft-landing' | 'inflation-spike' | 'custom';

export type StudioStage = 'pulse' | 'lab' | 'engine';

export interface MultiDebtAccount {
  id: string;
  name: string;
  balance: number;
  rate: number;
  minPayment: number;
  type?: 'credit_card' | 'auto_loan' | 'student_loan' | 'personal' | 'mortgage';
}

export interface Inputs {
  // Principal & Mode
  homePrice: number;
  downPayment: number;
  ccBalance: number;
  loanAmount?: number;
  loanOriginationFee?: number;
  loanOriginationFeeEnabled?: boolean;

  // Rate & Term
  annualRate: number;
  amortizationYears: number;
  termYears: number;
  compounding: CompoundingMethod;
  frequency: PaymentFrequency;

  // Extra Payments & Offset (AU/UK)
  extraPayment: number;
  lumpSum?: number;
  lumpSums?: LumpSumItem[];
  offsetBalance?: number;
  offsetMonthlyDeposit?: number;

  // Housing Costs / Escrow (PITI)
  usePiti: boolean;
  taxRate: number;
  insRate: number;
  hoaRate: number;
  pmiRate: number;

  // Opportunity Cost (Investing)
  useOppCost: boolean;
  investRate: number;

  // Career Labor
  annualIncome?: number;
  hourlyWage?: number;

  // Regional Settings
  country?: string; // 'CA' | 'US' | 'UK' | 'AU' | 'NZ' | 'semi' | 'monthly'
  province?: string;
  startDate: string;

  // Canadian Statutory Rules
  includeCmhc?: boolean;
  cmhcProvince?: string;
  includeLtt?: boolean;
  lttProvince?: string;
  lttFirstTimeBuyer?: boolean;

  // UK & AU Statutory Rules
  isAdditionalProperty?: boolean;
  ukFirstTimeBuyer?: boolean;
  auState?: string;
  auFirstTimeBuyer?: boolean;

  // Refinancing Rate Shock
  rateShockEnabled: boolean;
  rateShockPreset?: MacroRatePreset;
  termRates: Record<number, number>;

  // Revolving Credit Card settings
  ccCompounding?: 'simple' | 'daily';
  ccMinPercent?: number;
  ccMinPrincipalPct?: number;
  ccMinFlat?: number;

  // Household Debt Portfolio Cascade
  multiDebtEnabled?: boolean;
  householdDebts?: MultiDebtAccount[];
  cascadeStrategy?: 'avalanche' | 'snowball';
  cascadeMortgageRollover?: boolean;
  cascadeMonthlyBudget?: number;

  // UI state
  lang?: 'en' | 'fr';
}

export interface ScheduleRow {
  period: number;
  year: number;
  calendarYear: number;
  calendarMonth?: number;
  dateLabel: string;
  payment: number;
  principal: number;
  interest: number;
  tax: number;
  ins: number;
  hoa: number;
  pmi: number;
  escrow: number;
  extra: number;
  balance: number;
  effectiveBalance: number; // Principal minus offset balance for interest calculation
  offsetBalance: number;
  totalInterest: number;
  totalPrincipal: number;
  totalExtra: number;
  totalEscrow: number;
  ltv: number;
  interestSavedCumulative?: number;
}

export interface ScheduleSummary {
  periodsToPayoff: number;
  periodsPerYear: number;
  totalInterest: number;
  totalPrincipal: number;
  totalEscrow: number;
  totalExtraPaid: number;
  totalInterestSavedWithOffset?: number;
  cmhcInsuranceAmount?: number;
  cmhcPstAmount?: number;
  cmhcPstRate?: number;
  basePrincipalWithoutCmhc?: number;
  paidOff: boolean;
  payoffDate: string;
  pmiDropPeriod?: number;
  pmiDropDate?: string;
}

export interface ScheduleResult {
  schedule: ScheduleRow[];
  summary: ScheduleSummary;
}

export interface Milestone {
  period: number;
  dateLabel: string;
  type:
    | 'pmi_drop'
    | 'equity_25'
    | 'equity_50'
    | 'equity_75'
    | 'interest_crossover'
    | 'term_renewal'
    | 'halfway'
    | 'payoff';
  title: string;
  description: string;
  balance: number;
  percentPaid: number;
}

export interface CmhcCalculationResult {
  insuranceRate: number;
  insuranceAmount: number;
  pstRate: number;
  pstAmount: number;
  totalPrincipal: number;
}

export interface UkSdltResult {
  sdltAmount: number;
  effectiveRatePct: number;
  firstTimeBuyerRelief: number;
}

export interface AustralianDutyResult {
  transferDuty: number;
  effectiveRatePct: number;
  concessionAmount: number;
}

export interface ClosingTaxResult {
  regionType: 'CA_LTT' | 'UK_SDLT' | 'AU_DUTY' | 'NONE';
  taxAmount: number;
  effectiveRatePct: number;
  rebateOrRelief: number;
  details?: Record<string, number | string>;
}

export interface MultiDebtPaymentRow {
  period: number;
  dateLabel: string;
  balances: Record<string, number>;
  payments: Record<string, number>;
  totalBalance: number;
  totalPayment: number;
  totalInterest: number;
}

export interface MultiDebtStrategySummary {
  strategy: 'avalanche' | 'snowball';
  totalInterestPaid: number;
  totalMonthsToPayoff: number;
  interestSavedVsMinimums: number;
  monthsSavedVsMinimums: number;
  payoffOrder: string[];
  payoffOrderIds?: string[];
  paidOff?: boolean;
}

export interface MultiDebtCascadeResult {
  baselineTotalInterest: number;
  baselineMaxMonths: number;
  avalanche: MultiDebtStrategySummary;
  snowball: MultiDebtStrategySummary;
  schedule: MultiDebtPaymentRow[];
  mortgageRolloverMonthsSaved?: number;
  mortgageRolloverInterestSaved?: number;
}

export interface CopilotInsight {
  id: string;
  type: 'success' | 'tip' | 'warning' | 'critical';
  title: string;
  message: string;
  metric?: string;
  actionText?: string;
  actionPayload?: Partial<Inputs>;
}

export interface CareerLaborMetrics {
  totalHoursWorkedForBank: number;
  totalDaysWorkedForBank: number;
  monthlyDeadRent: number;
  monthlyRentPlusCarrying: number;
  freedomDayOfMonth: number; // day 1 to 31 when mortgage is owned by borrower
  annualLaborHours: number[];
}

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  inputs: Inputs;
}

export interface AppState {
  currentStage: StudioStage;
  currentMode: 'mortgage' | 'cc' | 'loan' | 'portfolio';
  isDark: boolean;
  language: 'en' | 'fr';
  activeProfileId: string;
  profiles: Record<string, Profile>;
  comparisonProfileId: string | null;
  compareModeActive: boolean;
  showTermMilestone: boolean;
  bankWagesView: 'wages' | 'rent' | 'rent-tax-ins' | 'calendar' | 'days-owned';
  leftPaneCollapsed: boolean;
  rightPaneCollapsed: boolean;
  mobileActiveTab: 'pulse' | 'lab' | 'engine' | 'ledger';
}
