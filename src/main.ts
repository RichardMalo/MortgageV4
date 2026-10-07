/**
 * TrueMortgage — UI controller.
 * One form in, one analysis out. All math lives in ./core/mortgage.ts.
 */

import { analyzeMortgage, clamp, sanitizeInputs } from './core/mortgage.js';
import { DEFAULT_INPUTS, FREQUENCIES, REGIONS, defaultStartDate } from './core/regions.js';
import { formatDuration, formatMoney, formatMonthYear, isoDate } from './core/format.js';
import { Analysis, Country, MortgageInputs, ScheduleResult } from './core/types.js';
import { MortgageChartsManager } from './charts/mortgage-charts.js';

const STORAGE_KEY = 'truemortgage:v5.1';
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
let chartsManager: MortgageChartsManager | null = null;
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
  const enabled = Boolean(state.paymentIncreaseEnabled);
  const toggleEl = $<HTMLInputElement>('toggle-payment-increase');
  if (toggleEl) {
    if (toggleEl.checked !== enabled) toggleEl.checked = enabled;
    toggleEl.disabled = !hasLoan;
    toggleEl.setAttribute('aria-checked', String(enabled));
  }

  const staticDisplay = $('hero-display-static');
  const inputWrap = $('hero-input-wrap');
  const increaseBar = $('hero-increase-bar');
  const outFreq = $('out-frequency');
  const outFreqEditable = $('out-frequency-editable');

  const freqNoun = FREQUENCIES[state.frequency].noun;
  if (outFreq) outFreq.textContent = freqNoun;
  if (outFreqEditable) outFreqEditable.textContent = freqNoun;

  const showEditable = enabled && hasLoan;
  if (staticDisplay) staticDisplay.hidden = showEditable;
  if (inputWrap) inputWrap.hidden = !showEditable;
  if (increaseBar) increaseBar.hidden = !showEditable;

  if (hasLoan) {
    $('out-payment').textContent = money(plan.regularPayment, true);
    if (showEditable) {
      const customInput = $<HTMLInputElement>('in-payment-increase');
      if (customInput) {
        customInput.min = String(a.basePayment);
        customInput.max = String(a.maxPayment);
        const currentVal =
          state.customPayment && state.customPayment >= a.basePayment
            ? state.customPayment
            : a.basePayment;
        setField(customInput, fmtNum(currentVal));
      }
      $('hero-min-payment').textContent = money(a.basePayment, true);
      $('hero-max-payment').textContent = money(a.maxPayment, true);
    }
  } else {
    $('out-payment').textContent = money(0);
  }

  const sub: string[] = [];
  if (hasLoan && state.frequency !== 'monthly') sub.push(`≈ ${money(a.monthlyEquivalent)} per month`);
  if (hasLoan && a.paymentIncrease > 0) {
    sub.push(`Base: ${money(a.basePayment, true)} · ${money(a.paymentIncrease, true)} extra to principal`);
  }
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

  // Multi-graph carousel
  if (!chartsManager) {
    chartsManager = new MortgageChartsManager();
  }
  chartsManager.render(a, hasLoan);

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
  const table = $('schedule-table');
  if (table) {
    table.setAttribute('data-view', scheduleView);
  }

  const theadRow = $('schedule-thead-row');
  if (theadRow) {
    theadRow.innerHTML = isMonthly
      ? `<th class="col-num">#</th>
         <th class="col-date">Date</th>
         <th class="col-payment">Payment</th>
         <th class="col-interest">Interest</th>
         <th class="col-principal">Principal</th>
         <th class="col-extra">Extra</th>
         <th class="col-balance">Balance</th>`
      : `<th class="col-year">Year</th>
         <th class="col-interest">Interest</th>
         <th class="col-principal">Principal</th>
         <th class="col-extra">Extra</th>
         <th class="col-balance">Balance</th>`;
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

  $('schedule-body').innerHTML = isMonthly
    ? plan.rows
        .map((r) => {
          const m = r.date.toLocaleDateString(REGIONS[c].locale, { month: 'short' });
          const y = r.date.getFullYear();
          const y2 = String(y).slice(-2);
          return `<tr>
            <td class="col-num">${r.n}</td>
            <td class="col-date">${m} <span class="date-yr-full">${y}</span><span class="date-yr-short">'${y2}</span></td>
            <td class="col-payment">${money(r.scheduled + r.extra, false)}</td>
            <td class="col-interest">${money(r.interest, false)}</td>
            <td class="col-principal">${money(r.principal, false)}</td>
            <td class="col-extra">${r.extra > 0 ? money(r.extra, false) : '—'}</td>
            <td class="col-balance">${money(r.balance, false)}</td>
          </tr>`;
        })
        .join('')
    : a.years
        .map(
          (y) => `<tr>
            <td class="col-year"><span class="year-num">${y.year}</span> <span class="year-date muted">${y.endDate.getFullYear()}</span></td>
            <td class="col-interest">${money(y.interest)}</td>
            <td class="col-principal">${money(y.principal)}</td>
            <td class="col-extra">${y.extra > 0 ? money(y.extra) : '—'}</td>
            <td class="col-balance">${money(y.endBalance)}</td>
          </tr>`
        )
        .join('');
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);



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

  const toggleEl = $<HTMLInputElement>('toggle-payment-increase');
  if (toggleEl) {
    toggleEl.addEventListener('change', () => {
      const enabled = toggleEl.checked;
      const patch: Partial<MortgageInputs> = { paymentIncreaseEnabled: enabled };
      if (enabled && lastAnalysis) {
        const baseVal = lastAnalysis.basePayment;
        const maxVal = lastAnalysis.maxPayment;
        if (!state.customPayment || state.customPayment < baseVal || state.customPayment > maxVal) {
          patch.customPayment = baseVal;
        }
      }
      update(patch);
      if (enabled) {
        const input = $<HTMLInputElement>('in-payment-increase');
        if (input) {
          input.focus();
          input.select();
        }
      }
    });
  }

  const customInput = $<HTMLInputElement>('in-payment-increase');
  if (customInput) {
    customInput.addEventListener('input', () => {
      const val = parseFloat(customInput.value);
      if (Number.isFinite(val)) {
        if (lastAnalysis && val > lastAnalysis.maxPayment) {
          customInput.value = fmtNum(lastAnalysis.maxPayment);
          update({ customPayment: lastAnalysis.maxPayment });
        } else {
          update({ customPayment: val });
        }
      }
    });

    customInput.addEventListener('blur', () => {
      if (lastAnalysis) {
        const val = parseFloat(customInput.value);
        const clamped = clamp(
          Number.isFinite(val) ? val : lastAnalysis.basePayment,
          lastAnalysis.basePayment,
          lastAnalysis.maxPayment
        );
        customInput.value = fmtNum(clamped);
        update({ customPayment: clamped });
      }
    });
  }

  const applyChip = (calc: (base: number, max: number) => number) => {
    if (lastAnalysis) {
      const val = calc(lastAnalysis.basePayment, lastAnalysis.maxPayment);
      const input = $<HTMLInputElement>('in-payment-increase');
      if (input) setField(input, fmtNum(val));
      update({ customPayment: val });
    }
  };

  $('chip-base')?.addEventListener('click', () => applyChip((base) => base));
  $('chip-plus-10')?.addEventListener('click', () =>
    applyChip((base, max) => Math.min(max, Math.round(base * 1.1 * 100) / 100))
  );
  $('chip-plus-25')?.addEventListener('click', () =>
    applyChip((base, max) => Math.min(max, Math.round(base * 1.25 * 100) / 100))
  );
  $('chip-double')?.addEventListener('click', () => applyChip((_, max) => max));

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
