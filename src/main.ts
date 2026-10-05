/**
 * TrueMortgage — UI controller.
 * One form in, one analysis out. All math lives in ./core/mortgage.ts.
 */

import { analyzeMortgage, sanitizeInputs } from './core/mortgage.js';
import { DEFAULT_INPUTS, FREQUENCIES, REGIONS, defaultStartDate } from './core/regions.js';
import { formatDuration, formatMoney, formatMonthYear, isoDate } from './core/format.js';
import { Analysis, Country, MortgageInputs, ScheduleResult } from './core/types.js';

const STORAGE_KEY = 'truemortgage:v5';
const TEXT_KEYS = new Set<keyof MortgageInputs>(['country', 'mode', 'frequency', 'startDate']);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------

const loadState = (): MortgageInputs => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeInputs(JSON.parse(raw));
  } catch {
    /* ignore corrupt storage */
  }
  return { ...DEFAULT_INPUTS, startDate: defaultStartDate() };
};

let state: MortgageInputs = loadState();
let scheduleView: 'yearly' | 'monthly' = 'yearly';
let lastAnalysis: Analysis | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable (private mode) */
    }
  }, 250);
};

const update = (patch: Partial<MortgageInputs>) => {
  state = { ...state, ...patch };
  save();
  render();
};

// ---------- form sync ----------

const currencySymbol = (country: Country) => {
  const r = REGIONS[country];
  const part = new Intl.NumberFormat(r.locale, { style: 'currency', currency: r.currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value.replace(/[A-Z]/g, '') || '$';
};

const setField = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  if (document.activeElement !== el && el.value !== value) el.value = value;
};

const fmtNum = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '');

const syncDownPct = () => {
  const pct = state.homePrice > 0 ? (state.downPayment / state.homePrice) * 100 : 0;
  setField($<HTMLInputElement>('in-down-pct'), fmtNum(Math.round(pct * 10) / 10));
};

/** Writes state into every form control (skipping the one being typed in). */
const syncForm = () => {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((el) => {
    const key = el.dataset.key as keyof MortgageInputs;
    const v = state[key];
    const isOptionalZero = typeof v === 'number' && v === 0 && el.getAttribute('placeholder') === '0';
    setField(el, isOptionalZero ? '' : typeof v === 'number' ? fmtNum(v) : String(v));
  });
  syncDownPct();
};

/** Shows/hides mode- and country-specific fields and localises labels. */
const syncVisibility = () => {
  const region = REGIONS[state.country];
  document.querySelectorAll<HTMLElement>('[data-show], [data-show-country]').forEach((el) => {
    const modeOk = !el.dataset.show || el.dataset.show === state.mode;
    const countryOk = !el.dataset.showCountry || el.dataset.showCountry === state.country;
    el.hidden = !(modeOk && countryOk);
  });
  document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => {
    const active = b.dataset.mode === state.mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-checked', String(active));
  });
  const symbol = currencySymbol(state.country);
  document.querySelectorAll('[data-currency]').forEach((el) => (el.textContent = symbol));
  document.querySelectorAll('[data-label="tax"]').forEach((el) => (el.textContent = region.propertyTaxLabel));
  document.querySelectorAll('[data-label="fees"]').forEach((el) => (el.textContent = region.feesLabel));

  const hints: string[] = [];
  if (region.compounding === 'semi-annual') {
    hints.push('Canadian fixed rates compound semi-annually — this is applied automatically.');
  }
  if (state.frequency.startsWith('accelerated')) {
    hints.push('Accelerated = your monthly payment split in ' + (state.frequency === 'accelerated-weekly' ? '4' : '2') +
      ', which adds roughly one extra monthly payment per year.');
  }
  $('compounding-hint').textContent = hints.join(' ');
};

// ---------- rendering ----------

const render = () => {
  syncVisibility();
  const a = analyzeMortgage(state);
  lastAnalysis = a;
  const c = state.country;
  const money = (x: number, cents = false) => formatMoney(x, c, cents);
  const { plan } = a;

  const hasLoan = a.loanAmount > 0 && plan.numPayments > 0;

  // Hero
  $('out-payment').textContent = hasLoan ? money(plan.regularPayment, true) : money(0);
  $('out-frequency').textContent = FREQUENCIES[state.frequency].noun;
  const sub: string[] = [];
  if (hasLoan && state.frequency !== 'monthly') sub.push(`≈ ${money(a.monthlyEquivalent)} per month`);
  if (hasLoan && state.extraMonthly > 0) sub.push(`plus ${money(state.extraMonthly)}/month extra`);
  if (!hasLoan) sub.push('Enter a loan amount to see your payment.');
  $('out-hero-sub').textContent = sub.join(' · ');

  // Stats
  $('out-loan').textContent = money(a.loanAmount);
  $('out-interest').textContent = money(plan.totalInterest);
  $('out-payoff').textContent = formatMonthYear(plan.payoffDate, c);
  $('out-payoff-time').textContent = hasLoan ? `in ${formatDuration((plan.numPayments * 12) / plan.periodsPerYear)}` : '';

  // Savings
  const savingsCard = $('savings-card');
  const showSavings = hasLoan && a.hasStrategy && (a.interestSaved >= 1 || a.monthsSaved > 0);
  savingsCard.hidden = !showSavings;
  if (showSavings) {
    $('out-savings-title').textContent =
      `You'll save ${money(a.interestSaved)} in interest` +
      (a.monthsSaved > 0 ? ` and be mortgage-free ${formatDuration(a.monthsSaved)} sooner.` : '.');
  }

  // Notes
  $('notes').innerHTML = a.notes
    .map((n) => `<li class="note ${n.level}">${escapeHtml(n.text)}</li>`)
    .join('');

  // Chart
  renderChart(a, hasLoan);

  // Breakdown
  const totalPrincipal = a.loanAmount;
  const total = totalPrincipal + plan.totalInterest;
  const pPct = total > 0 ? (totalPrincipal / total) * 100 : 100;
  $('bar-principal').style.width = `${pPct}%`;
  $('bar-interest').style.width = `${100 - pPct}%`;
  $('out-total-principal').textContent = money(totalPrincipal);
  $('out-total-interest').textContent = money(plan.totalInterest);

  // Monthly housing cost
  const costRows: Array<[string, number]> = [
    ['Mortgage payment', a.monthlyEquivalent],
    [REGIONS[c].propertyTaxLabel, state.propertyTaxYearly / 12],
    ['Home insurance', state.homeInsuranceYearly / 12],
    [REGIONS[c].feesLabel, state.feesMonthly],
    ['PMI (until it cancels)', a.insurance.pmiMonthly]
  ];
  const hasCosts = hasLoan && costRows.slice(1).some(([, v]) => v > 0);
  $('monthly-cost').hidden = !hasCosts;
  if (hasCosts) {
    $('monthly-cost-list').innerHTML =
      costRows
        .filter(([, v], i) => i === 0 || v > 0)
        .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${money(v)}</dd></div>`)
        .join('') + `<div class="total"><dt>Total</dt><dd>${money(a.monthlyHousingCost)}</dd></div>`;
  }

  // Schedule table (Yearly vs Monthly)
  const isMonthly = scheduleView === 'monthly';
  const theadRow = $('schedule-thead-row');
  if (theadRow) {
    theadRow.innerHTML = isMonthly
      ? `<th>#</th>
         <th>Date</th>
         <th>Payment</th>
         <th>Interest</th>
         <th>Principal</th>
         <th>Extra</th>
         <th>Balance</th>`
      : `<th>Year</th>
         <th>Interest</th>
         <th>Principal</th>
         <th>Extra</th>
         <th>Balance</th>`;
  }

  const scheduleTitle = $('schedule-title');
  if (scheduleTitle) {
    scheduleTitle.textContent = isMonthly ? 'Monthly schedule' : 'Yearly schedule';
  }

  document.querySelectorAll<HTMLButtonElement>('.schedule-switch-btn').forEach((btn) => {
    const active = btn.dataset.scheduleView === scheduleView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
  });

  const monthYearFmt = (d: Date) =>
    d.toLocaleDateString(REGIONS[c].locale, { month: 'short', year: 'numeric' });

  $('schedule-body').innerHTML = isMonthly
    ? plan.rows
        .map(
          (r) => `<tr>
            <td>${r.n}</td>
            <td>${monthYearFmt(r.date)}</td>
            <td>${money(r.scheduled + r.extra, true)}</td>
            <td>${money(r.interest, true)}</td>
            <td>${money(r.principal, true)}</td>
            <td>${r.extra > 0 ? money(r.extra, true) : '—'}</td>
            <td>${money(r.balance, true)}</td>
          </tr>`
        )
        .join('')
    : a.years
        .map(
          (y) => `<tr>
            <td>${y.year} <span class="muted">${y.endDate.getFullYear()}</span></td>
            <td>${money(y.interest)}</td>
            <td>${money(y.principal)}</td>
            <td>${y.extra > 0 ? money(y.extra) : '—'}</td>
            <td>${money(y.endBalance)}</td>
          </tr>`
        )
        .join('');
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Balance-over-time line chart (inline SVG, no dependencies). */
const renderChart = (a: Analysis, hasLoan: boolean) => {
  const el = $('chart');
  if (!hasLoan) {
    el.innerHTML = '<div class="chart-empty">No balance to chart.</div>';
    return;
  }
  const W = 640, H = 240, L = 56, R = 14, T = 12, B = 28;
  const maxYears = Math.max(a.baseline.numPayments / 12, a.plan.numPayments / a.plan.periodsPerYear, 1);
  const maxY = a.loanAmount;
  const x = (yrs: number) => L + (yrs / maxYears) * (W - L - R);
  const y = (bal: number) => T + (1 - bal / maxY) * (H - T - B);

  const points = (s: ScheduleResult) => {
    const pts: string[] = [`${x(0)},${y(a.loanAmount)}`];
    const step = Math.max(1, Math.round(s.periodsPerYear / 4)); // quarterly resolution
    s.rows.forEach((r, i) => {
      if (r.n % step === 0 || i === s.rows.length - 1) pts.push(`${x(r.n / s.periodsPerYear).toFixed(1)},${y(r.balance).toFixed(1)}`);
    });
    return pts;
  };

  const planPts = points(a.plan);
  const showBaseline = a.hasStrategy;
  const basePts = showBaseline ? points(a.baseline) : [];
  $('legend-baseline').hidden = !showBaseline;

  const compact = new Intl.NumberFormat(REGIONS[state.country].locale, {
    style: 'currency',
    currency: REGIONS[state.country].currency,
    notation: 'compact',
    maximumFractionDigits: 1
  });

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const xStep = maxYears <= 10 ? 1 : maxYears <= 20 ? 2 : 5;
  const xTicks: number[] = [];
  for (let t = 0; t <= maxYears + 1e-9; t += xStep) xTicks.push(t);

  const area = `M${planPts[0]} L${planPts.slice(1).join(' L')} L${planPts[planPts.length - 1]!.split(',')[0]},${y(0)} L${x(0)},${y(0)} Z`;

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mortgage balance over time">
      ${yTicks
        .map(
          (v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
                  <text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${compact.format(v)}</text>`
        )
        .join('')}
      ${xTicks
        .map((t) => `<text class="axis" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t === 0 ? 'Now' : `${t}y`}</text>`)
        .join('')}
      ${showBaseline ? `<polyline class="line-base" points="${basePts.join(' ')}"/>` : ''}
      <path class="area-plan" d="${area}"/>
      <polyline class="line-plan" points="${planPts.join(' ')}"/>
    </svg>`;
};

// ---------- CSV ----------

const downloadCsv = () => {
  const a = lastAnalysis;
  if (!a || !a.plan.rows.length) return;
  const lines = ['Payment #,Date,Payment,Interest,Principal,Extra,Balance'];
  for (const r of a.plan.rows) {
    lines.push(
      [r.n, isoDate(r.date), (r.scheduled + r.extra).toFixed(2), r.interest.toFixed(2), r.principal.toFixed(2), r.extra.toFixed(2), r.balance.toFixed(2)].join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mortgage-schedule.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---------- events ----------

const bind = () => {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((el) => {
    const key = el.dataset.key as keyof MortgageInputs;
    const handler = () => {
      if (TEXT_KEYS.has(key)) {
        if (key === 'startDate' && !el.value) return; // ignore half-typed dates
        update({ [key]: el.value } as Partial<MortgageInputs>);
      } else {
        const n = parseFloat(el.value);
        update({ [key]: Number.isFinite(n) ? n : 0 } as Partial<MortgageInputs>);
      }
      if (key === 'homePrice' || key === 'downPayment') syncDownPct();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.getAttribute('type') === 'date' ? 'change' : 'input', handler);
    // Tidy the field (e.g. clamped values) once the user leaves it.
    el.addEventListener('blur', () => {
      state = sanitizeInputs(state);
      syncForm();
      render();
    });
  });

  $<HTMLInputElement>('in-down-pct').addEventListener('input', (e) => {
    const pct = parseFloat((e.target as HTMLInputElement).value);
    const down = Math.round((state.homePrice * (Number.isFinite(pct) ? pct : 0)) / 100);
    update({ downPayment: down });
    setField($<HTMLInputElement>('in-down'), String(down));
  });

  document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) =>
    b.addEventListener('click', () => update({ mode: b.dataset.mode as MortgageInputs['mode'] }))
  );

  document.querySelectorAll<HTMLButtonElement>('.schedule-switch-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent toggling the parent <details> summary
      const view = btn.dataset.scheduleView as 'yearly' | 'monthly';
      if (view && view !== scheduleView) {
        scheduleView = view;
        render();
      }
    });
  });

  $('btn-reset').addEventListener('click', () => {
    state = { ...DEFAULT_INPUTS, country: state.country, startDate: defaultStartDate() };
    save();
    syncForm();
    render();
  });

  $('btn-csv').addEventListener('click', downloadCsv);
  $('mortgage-form').addEventListener('submit', (e) => e.preventDefault());
};

window.addEventListener('DOMContentLoaded', () => {
  syncForm();
  bind();
  render();
});
