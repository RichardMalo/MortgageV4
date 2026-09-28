/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Pure Number, Currency, and Date Formatting Utilities
 */

export const getLocaleAndCurrency = (country?: string): { locale: string; currency: string; symbol: string } => {
  const c = (country || 'CA').toUpperCase();
  switch (c) {
    case 'UK':
    case 'GB':
    case 'MONTHLY-UK':
      return { locale: 'en-GB', currency: 'GBP', symbol: '£' };
    case 'AU':
    case 'MONTHLY-AU':
      return { locale: 'en-AU', currency: 'AUD', symbol: '$' };
    case 'NZ':
    case 'MONTHLY-NZ':
      return { locale: 'en-NZ', currency: 'NZD', symbol: '$' };
    case 'US':
    case 'MONTHLY':
      return { locale: 'en-US', currency: 'USD', symbol: '$' };
    case 'CA':
    case 'SEMI':
    default:
      return { locale: 'en-CA', currency: 'CAD', symbol: '$' };
  }
};

export const formatCurrency = (amount: number, country?: string, showCents = false): string => {
  const safe = Number.isFinite(amount) ? amount : 0;
  const { locale, currency } = getLocaleAndCurrency(country);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0
  }).format(safe);
};

export const formatPercent = (val: number, decimals = 2): string => {
  const safe = Number.isFinite(val) ? val : 0;
  return `${safe.toFixed(decimals)}%`;
};

export const formatNumber = (val: number, decimals = 0): string => {
  const safe = Number.isFinite(val) ? val : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(safe);
};

export const formatCompact = (val: number): string => {
  const safe = Number.isFinite(val) ? val : 0;
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(safe);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export const getRowDateLabel = (startDateStr: string, periodIndex: number, periodsPerYear: number): string => {
  if (!startDateStr) return `Period ${periodIndex}`;
  const start = new Date(startDateStr + 'T00:00:00');
  if (isNaN(start.getTime())) return `Period ${periodIndex}`;

  const date = new Date(start.getTime());
  if (periodsPerYear === 12) {
    date.setMonth(date.getMonth() + (periodIndex - 1));
  } else if (periodsPerYear === 24) {
    const halfMonths = periodIndex - 1;
    date.setMonth(date.getMonth() + Math.floor(halfMonths / 2));
    date.setDate(halfMonths % 2 === 0 ? 1 : 15);
  } else if (periodsPerYear === 26) {
    date.setDate(date.getDate() + (periodIndex - 1) * 14);
  } else if (periodsPerYear === 52) {
    date.setDate(date.getDate() + (periodIndex - 1) * 7);
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
