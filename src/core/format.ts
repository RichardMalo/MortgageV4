/**
 * Display formatting helpers.
 */

import { Country } from './types.js';
import { REGIONS } from './regions.js';

const moneyFormatters = new Map<string, Intl.NumberFormat>();
const monthYearFormatters = new Map<Country, Intl.DateTimeFormat>();
const shortMonthFormatters = new Map<Country, Intl.DateTimeFormat>();
const shortMonthDayFormatters = new Map<Country, Intl.DateTimeFormat>();

const getMoneyFormatter = (country: Country, cents: boolean): Intl.NumberFormat => {
  const key = `${country}:${cents ? 2 : 0}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    const r = REGIONS[country];
    fmt = new Intl.NumberFormat(r.locale, {
      style: 'currency',
      currency: r.currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0
    });
    moneyFormatters.set(key, fmt);
  }
  return fmt;
};

export const formatMoney = (amount: number, country: Country, cents = false): string =>
  getMoneyFormatter(country, cents).format(Number.isFinite(amount) ? amount : 0);

export const formatMonthYear = (date: Date | null, country: Country): string => {
  if (!date) return '—';
  let fmt = monthYearFormatters.get(country);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(REGIONS[country].locale, { month: 'short', year: 'numeric' });
    monthYearFormatters.set(country, fmt);
  }
  return fmt.format(date);
};

export const formatShortDate = (date: Date, country: Country, includeDay = false): string => {
  const map = includeDay ? shortMonthDayFormatters : shortMonthFormatters;
  let fmt = map.get(country);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(
      REGIONS[country].locale,
      includeDay ? { month: 'short', day: 'numeric' } : { month: 'short' }
    );
    map.set(country, fmt);
  }
  return fmt.format(date);
};

export const formatDuration = (totalMonths: number): string => {
  const m = Math.max(0, Math.round(totalMonths));
  const y = Math.floor(m / 12);
  const r = m % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} yr${y === 1 ? '' : 's'}`);
  if (r || !y) parts.push(`${r} mo${r === 1 ? '' : 's'}`);
  return parts.join(' ');
};

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
