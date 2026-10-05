/**
 * Display formatting helpers.
 */

import { Country } from './types.js';
import { REGIONS } from './regions.js';

export const formatMoney = (amount: number, country: Country, cents = false): string => {
  const r = REGIONS[country];
  return new Intl.NumberFormat(r.locale, {
    style: 'currency',
    currency: r.currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0
  }).format(Number.isFinite(amount) ? amount : 0);
};

export const formatMonthYear = (date: Date | null, country: Country): string =>
  date ? date.toLocaleDateString(REGIONS[country].locale, { month: 'short', year: 'numeric' }) : '—';

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
