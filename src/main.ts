/**
 * TrueMortgage — UI controller.
 * One form in, one analysis out. All math lives in ./core/mortgage.ts.
 */

import { analyzeMortgage, clamp, parseUrlInputs, round2, sanitizeInputs, serializeUrlInputs } from './core/mortgage.js';
import { DEFAULT_INPUTS, FREQUENCIES, REGIONS, defaultStartDate } from './core/regions.js';
import { formatDuration, formatMoney, formatMonthYear, formatShortDate, isoDate } from './core/format.js';
import { MilestoneData, StrategyInputs, buildMilestones, extractStrategyInputs } from './core/scenarios.js';
import { Analysis, Country, MortgageInputs } from './core/types.js';
import { MortgageChartsManager, setPrintLightMode } from './charts/mortgage-charts.js';

const STORAGE_KEY = 'truemortgage:v5.1';
const THEME_KEY = 'truemortgage:theme';
const TEXT_KEYS = new Set<keyof MortgageInputs>(['country', 'mode', 'frequency', 'startDate']);
const STRATEGY_KEYS: Array<keyof MortgageInputs> = [
  'frequency',
  'extraMonthly',
  'annualLumpSum',
  'paymentIncreaseEnabled',
  'customPayment'
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state & url serialization ----------

/** Parses URL search params into Partial<MortgageInputs> if present. */
const loadFromUrl = (): Partial<MortgageInputs> | null => {
  if (typeof window === 'undefined' || !window.location.search) return null;
  return parseUrlInputs(window.location.search);
};

const clearUrlQueryIfPresent = () => {
  if (typeof window !== 'undefined' && window.location.search) {
    window.history.replaceState(null, '', window.location.pathname);
  }
};

const loadState = (): MortgageInputs => {
  const urlState = loadFromUrl();
  if (urlState) {
    return sanitizeInputs({ ...DEFAULT_INPUTS, startDate: defaultStartDate(), ...urlState });
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeInputs(JSON.parse(raw));
  } catch {
    /* ignore corrupt storage */
  }
  return { ...DEFAULT_INPUTS, startDate: defaultStartDate() };
};

const computeRatioFromState = (s: MortgageInputs): number => {
  if (!s.paymentIncreaseEnabled || !s.customPayment) return 1;
  const a = analyzeMortgage(s);
  return a.basePayment > 0 && s.customPayment >= a.basePayment
    ? clamp(s.customPayment / a.basePayment, 1, 2)
    : 1;
};

let state: MortgageInputs = loadState();
let paymentIncreaseRatio: number = computeRatioFromState(state);
let entryStrategy: StrategyInputs = extractStrategyInputs(state);
let scheduleView: 'yearly' | 'monthly' = 'yearly';
let lastAnalysis: Analysis | null = null;
let lastMilestones: MilestoneData[] = [];
let scheduleDirty = false;
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

const update = (patch: Partial<MortgageInputs>, preserveEntryStrategy = false, explicitRatio?: number) => {
  state = { ...state, ...patch };
  if (explicitRatio !== undefined) {
    paymentIncreaseRatio = clamp(explicitRatio, 1, 2);
  } else if ('customPayment' in patch) {
    const prelim = analyzeMortgage(state);
    if (state.paymentIncreaseEnabled && prelim.basePayment > 0 && state.customPayment) {
      paymentIncreaseRatio = clamp(state.customPayment / prelim.basePayment, 1, 2);
    } else if (!state.paymentIncreaseEnabled) {
      paymentIncreaseRatio = 1;
    }
  } else if (state.paymentIncreaseEnabled) {
    const prelim = analyzeMortgage(state);
    if (prelim.basePayment > 0) {
      state.customPayment = round2(
        clamp(prelim.basePayment * paymentIncreaseRatio, prelim.basePayment, prelim.maxPayment)
      );
      if (!STRATEGY_KEYS.some((k) => k in patch) && entryStrategy.paymentIncreaseEnabled) {
        entryStrategy.customPayment = state.customPayment;
      }
    }
  }
  if (!preserveEntryStrategy && STRATEGY_KEYS.some((k) => k in patch)) {
    entryStrategy = extractStrategyInputs(state);
  }
  clearUrlQueryIfPresent();
  save();
  render();
};

// ---------- theme management ----------

const initTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  } catch {
    /* ignore */
  }
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* ignore */
  }

  chartsManager?.drawAll();
};

// ---------- toast notifications ----------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
const showToast = (
  message: string,
  options?: { actionLabel?: string; onAction?: () => void }
) => {
  const toast = $('toast');
  if (!toast) return;

  clearTimeout(toastTimer);
  const hasAction = Boolean(options?.actionLabel && options?.onAction);
  toast.innerHTML = `<span class="toast-msg">${escapeHtml(message)}</span>`;
  toast.classList.toggle('has-action', hasAction);

  if (hasAction && options?.actionLabel && options?.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = options.actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      toast.hidden = true;
      toast.classList.remove('has-action');
      options.onAction?.();
    });
    toast.appendChild(btn);
  }

  toast.hidden = false;

  toastTimer = setTimeout(() => {
    toast.hidden = true;
    toast.classList.remove('has-action');
  }, hasAction ? 5200 : 2800);
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
  const rounded = Math.round(pct * 10) / 10;
  setField($<HTMLInputElement>('in-down-pct'), fmtNum(rounded));

  // Sync active state of down payment micro-pills
  document.querySelectorAll<HTMLButtonElement>('[data-down-pct]').forEach((pill) => {
    const pVal = parseFloat(pill.dataset.downPct || '0');
    pill.classList.toggle('active', Math.abs(rounded - pVal) < 0.2);
  });
};

const syncAmortPills = () => {
  document.querySelectorAll<HTMLButtonElement>('[data-amort]').forEach((pill) => {
    const yVal = parseInt(pill.dataset.amort || '0', 10);
    pill.classList.toggle('active', state.amortizationYears === yVal);
  });
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
  syncAmortPills();
};

/** Automatically opens the Optional Housing Costs section when non-zero housing costs are present in state. */
const syncCostsSectionOpen = () => {
  const hasCustomCosts =
    state.propertyTaxYearly > 0 ||
    state.homeInsuranceYearly > 0 ||
    state.feesMonthly > 0 ||
    (state.country === 'US' && state.mode === 'purchase' && state.pmiRate !== DEFAULT_INPUTS.pmiRate);
  if (hasCustomCosts) {
    const costsSection = $<HTMLDetailsElement>('costs-section');
    if (costsSection) costsSection.open = true;
  }
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
    hints.push('Canadian fixed rates compound semi-annually — applied automatically.');
  }
  if (state.frequency.startsWith('accelerated')) {
    hints.push(
      'Accelerated = your monthly payment split in ' +
        (state.frequency === 'accelerated-weekly' ? '4' : '2') +
        ', which adds roughly one extra monthly payment per year.'
    );
  }
  $('compounding-hint').textContent = hints.join(' ');
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

let milestoneHighlightTimer: ReturnType<typeof setTimeout> | undefined;
let highlightedRow: HTMLElement | null = null;

const scrollToMilestone = (targetYear: number, targetMonth: number) => {
  const details = document.querySelector<HTMLDetailsElement>('details.schedule');
  if (details && !details.open) {
    details.open = true;
  }
  if (scheduleDirty && lastAnalysis) {
    renderScheduleRows(lastAnalysis, lastMilestones);
    scheduleDirty = false;
  }

  const isMonthly = scheduleView === 'monthly';
  const targetRow = isMonthly
    ? document.getElementById(`schedule-row-month-${targetMonth}`)
    : document.getElementById(`schedule-row-year-${targetYear}`);

  if (targetRow) {
    clearTimeout(milestoneHighlightTimer);
    if (highlightedRow && highlightedRow !== targetRow) {
      highlightedRow.classList.remove('milestone-row-highlight');
    }
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetRow.classList.remove('milestone-row-highlight');
    void targetRow.offsetWidth; // Force DOM reflow to re-trigger CSS pulse
    targetRow.classList.add('milestone-row-highlight');
    highlightedRow = targetRow;
    milestoneHighlightTimer = setTimeout(() => {
      targetRow.classList.remove('milestone-row-highlight');
      if (highlightedRow === targetRow) highlightedRow = null;
    }, 2400);
  }
};

const renderMilestonesShowcase = (milestones: MilestoneData[]) => {
  const container = $('milestones-showcase');
  const wrap = $('milestones-showcase-wrap');
  const countEl = $('milestones-count');
  if (!container || !wrap) return;

  if (milestones.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  if (countEl) {
    countEl.textContent = `${milestones.length} Landmark${milestones.length === 1 ? '' : 's'}`;
  }
  container.style.setProperty('--milestone-cols', String(Math.max(1, milestones.length)));
  const isMonthly = scheduleView === 'monthly';

  container.innerHTML = milestones
    .map(
      (m) => `
    <div class="milestone-card milestone-card-${m.key}" data-milestone="${m.key}" data-year="${m.year}" data-month="${m.monthIndex}" role="button" tabindex="0" aria-label="${escapeHtml(m.title)} milestone in Year ${m.year}">
      <div class="milestone-card-top">
        <span class="milestone-tag ${m.pillClass}">
          <span class="milestone-tag-glyph" aria-hidden="true">${m.icon}</span>
          <span class="milestone-tag-label">${escapeHtml(m.title)}</span>
        </span>
        <span class="milestone-card-target">${isMonthly ? `#${m.monthIndex}` : `Yr ${m.year}`}</span>
      </div>
      <div class="milestone-card-date">${escapeHtml(m.dateStr)}</div>
      <div class="milestone-card-metric">
        <span class="metric-main">${escapeHtml(m.mainMetric)}</span>
        <span class="metric-sub">${escapeHtml(m.subMetric)}</span>
      </div>
      <div class="milestone-card-desc" title="${escapeHtml(m.descText)}">${escapeHtml(m.descText)}</div>
      <div class="milestone-card-foot">
        <span class="milestone-card-action">View in schedule</span>
        <span class="milestone-card-arrow" aria-hidden="true">↓</span>
      </div>
    </div>`
    )
    .join('');
};

const syncHeroChips = (currentVal: number, baseVal: number, maxVal: number) => {
  const chips: Array<[string, number]> = [
    ['chip-base', baseVal],
    ['chip-plus-10', Math.min(maxVal, round2(baseVal * 1.1))],
    ['chip-plus-25', Math.min(maxVal, round2(baseVal * 1.25))],
    ['chip-double', maxVal]
  ];
  for (const [id, target] of chips) {
    const el = $<HTMLButtonElement>(id);
    if (el) {
      const active = baseVal > 0 && Math.abs(currentVal - target) < 0.05;
      el.classList.toggle('active', active);
      el.setAttribute('aria-pressed', String(active));
    }
  }
};

const renderScheduleRows = (a: Analysis, milestones: MilestoneData[]) => {
  const inp = a.inputs;
  const c = inp.country;
  const money = (x: number, cents = false) => formatMoney(x, c, cents);
  const { plan } = a;
  const isMonthly = scheduleView === 'monthly';
  const includeDay = plan.periodsPerYear > 12;

  $('schedule-body').innerHTML = isMonthly
    ? plan.rows
        .map((r) => {
          const m = formatShortDate(r.date, c, includeDay);
          const y = r.date.getFullYear();
          const y2 = String(y).slice(-2);
          const matching = milestones.filter((ms) => ms.monthIndex === r.n);
          const primaryMilestone = matching[0];
          const rowClass = primaryMilestone ? `milestone-row row-milestone-${primaryMilestone.key}` : '';
          const badges = matching.map((ms) => ms.badgeDesktop).join('');
          const pips = matching.map((ms) => ms.pipMobile).join('');
          return `<tr class="${rowClass}" id="schedule-row-month-${r.n}">
            <td class="col-num">${r.n}</td>
            <td class="col-date">${m} <span class="date-yr-full">${y}</span><span class="date-yr-short">'${y2}</span>${badges ? `<span class="milestone-badge-desktop">${badges}</span>` : ''}${pips ? `<span class="milestone-pip-mobile">${pips}</span>` : ''}</td>
            <td class="col-payment">${money(r.scheduled + r.extra, false)}</td>
            <td class="col-interest">${money(r.interest, false)}</td>
            <td class="col-principal">${money(r.principal, false)}</td>
            <td class="col-extra">${r.extra > 0 ? money(r.extra, false) : '—'}</td>
            <td class="col-balance">${money(r.balance, false)}</td>
          </tr>`;
        })
        .join('')
    : a.years
        .map((y) => {
          const matching = milestones.filter((ms) => ms.year === y.year);
          const badges = matching.map((ms) => ms.badgeDesktop);
          const pips = matching.map((ms) => ms.pipMobile);
          const primaryMilestone = matching[0];
          const rowClass = matching.length > 0 ? `milestone-row row-milestone-${primaryMilestone.key}` : '';
          const y2 = String(y.endDate.getFullYear()).slice(-2);

          return `<tr class="${rowClass}" id="schedule-row-year-${y.year}">
            <td class="col-year">
              <span class="year-num">${y.year}</span>
              <span class="year-date muted"><span class="date-yr-full">${y.endDate.getFullYear()}</span><span class="date-yr-short">'${y2}</span></span>
              <span class="milestone-badge-desktop">${badges.join('')}</span>
              <span class="milestone-pip-mobile">${pips.join('')}</span>
            </td>
            <td class="col-interest">${money(y.interest)}</td>
            <td class="col-principal">${money(y.principal)}</td>
            <td class="col-extra">${y.extra > 0 ? money(y.extra) : '—'}</td>
            <td class="col-balance">${money(y.endBalance)}</td>
          </tr>`;
        })
        .join('');
};

// ---------- rendering ----------

const render = () => {
  syncVisibility();
  const a = analyzeMortgage(state);
  lastAnalysis = a;
  const inp = a.inputs;
  const c = inp.country;
  const money = (x: number, cents = false) => formatMoney(x, c, cents);
  const { plan } = a;

  const hasLoan = a.loanAmount > 0 && plan.numPayments > 0;

  // LTV Badge
  const ltvBadge = $('ltv-badge');
  if (ltvBadge) {
    if (inp.mode === 'purchase' && inp.homePrice > 0) {
      const ltv = ((inp.homePrice - inp.downPayment) / inp.homePrice) * 100;
      let status = 'Conventional';
      if (ltv > 80) {
        status = c === 'CA' ? 'Insured (CMHC)' : c === 'US' ? 'PMI Required' : 'High LTV';
      }
      ltvBadge.textContent = `${ltv.toFixed(1)}% LTV · ${status}`;
    } else {
      ltvBadge.textContent = '';
    }
  }

  // Hero
  const enabled = Boolean(inp.paymentIncreaseEnabled);
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

  const freqNoun = FREQUENCIES[inp.frequency].noun;
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
      const currentVal =
        inp.customPayment && inp.customPayment >= a.basePayment
          ? clamp(inp.customPayment, a.basePayment, a.maxPayment)
          : a.basePayment;
      if (customInput) {
        customInput.min = String(a.basePayment);
        customInput.max = String(a.maxPayment);
        setField(customInput, fmtNum(currentVal));
      }
      $('hero-min-payment').textContent = money(a.basePayment, true);
      $('hero-max-payment').textContent = money(a.maxPayment, true);
      syncHeroChips(currentVal, a.basePayment, a.maxPayment);
    }
  } else {
    $('out-payment').textContent = money(0);
  }

  const sub: string[] = [];
  if (hasLoan && inp.frequency !== 'monthly') sub.push(`≈ ${money(a.monthlyEquivalent)} per month`);
  if (hasLoan && a.paymentIncrease > 0) {
    sub.push(`Base: ${money(a.basePayment, true)} · ${money(a.paymentIncrease, true)} extra to principal`);
  }
  if (hasLoan && inp.extraMonthly > 0) sub.push(`plus ${money(inp.extraMonthly)}/month extra`);
  if (!hasLoan) sub.push('Enter a loan amount to see your payment.');
  const heroSubEl = $('out-hero-sub');
  heroSubEl.textContent = sub.join(' · ');

  // Print statement parameters summary (visible in @media print)
  let printMetaEl = document.getElementById('out-print-meta');
  if (!printMetaEl && heroSubEl.parentElement) {
    printMetaEl = document.createElement('div');
    printMetaEl.id = 'out-print-meta';
    printMetaEl.className = 'hero-print-meta';
    heroSubEl.parentElement.appendChild(printMetaEl);
  }
  if (printMetaEl) {
    const metaParts: string[] = [];
    if (inp.mode === 'purchase') {
      const downPct = inp.homePrice > 0 ? ((inp.downPayment / inp.homePrice) * 100).toFixed(1) : '0';
      metaParts.push(`Home price: ${money(inp.homePrice)}`, `Down payment: ${money(inp.downPayment)} (${downPct}%)`);
    } else {
      metaParts.push(`Balance: ${money(inp.currentBalance)}`);
    }
    metaParts.push(
      `Rate: ${inp.annualRate}% (${REGIONS[c].compounding})`,
      `Amortization: ${inp.amortizationYears} yrs`,
      `Frequency: ${FREQUENCIES[inp.frequency].label}`,
      `Start: ${inp.startDate}`
    );
    if (inp.annualLumpSum > 0) metaParts.push(`Annual lump sum: ${money(inp.annualLumpSum)}/yr`);
    printMetaEl.textContent = metaParts.join(' · ');
  }

  // Stats
  $('out-loan').textContent = money(a.loanAmount);
  const loanSub = $('out-loan-sub');
  if (loanSub) {
    if (inp.mode === 'purchase') {
      const baseLtv = inp.homePrice > 0 ? (((inp.homePrice - inp.downPayment) / inp.homePrice) * 100).toFixed(0) : '0';
      const cmhcSuffix = a.insurance.kind === 'cmhc' ? ` + ${money(a.insurance.premium)} CMHC` : '';
      loanSub.textContent = `${baseLtv}% LTV · ${money(inp.downPayment)} down${cmhcSuffix}`;
    } else {
      loanSub.textContent = 'Existing balance';
    }
  }

  $('out-interest').textContent = money(plan.totalInterest);
  const intSub = $('out-interest-sub');
  if (intSub) {
    const intPct = a.loanAmount > 0 ? Math.round((plan.totalInterest / a.loanAmount) * 100) : 0;
    intSub.textContent = `${intPct}% of loan balance`;
  }

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
    chartsManager = new MortgageChartsManager({
      onApply: (action, chartId) => {
        const previousState = { ...state };
        const previousEntry = { ...entryStrategy };
        const previousRatio = paymentIncreaseRatio;
        const fromStrategies = chartId === 'strategies';
        update(action.patch, fromStrategies);
        syncForm();
        showToast(action.message, {
          actionLabel: 'Undo',
          onAction: () => {
            entryStrategy = previousEntry;
            update(previousState, true, previousRatio);
            syncForm();
            showToast('Reverted strategy change');
          }
        });
      }
    });
  }
  chartsManager.render(a, hasLoan, entryStrategy);

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
    ['Extra monthly payment', inp.extraMonthly],
    [REGIONS[c].propertyTaxLabel, inp.propertyTaxYearly / 12],
    ['Home insurance', inp.homeInsuranceYearly / 12],
    [REGIONS[c].feesLabel, inp.feesMonthly],
    ['PMI (until it cancels)', a.insurance.pmiMonthly]
  ];
  const hasCosts = hasLoan && costRows.slice(2).some(([, v]) => v > 0);
  $('monthly-cost').hidden = !hasCosts;
  if (hasCosts) {
    $('monthly-cost-list').innerHTML =
      costRows
        .filter(([, v], i) => i === 0 || v > 0)
        .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${money(v)}</dd></div>`)
        .join('') + `<div class="total"><dt>Total</dt><dd>${money(a.monthlyHousingCost)}</dd></div>`;
  }

  // Schedule table (Yearly vs Period/Monthly)
  const isMonthly = scheduleView === 'monthly';
  const table = $('schedule-table');
  if (table) {
    table.setAttribute('data-view', scheduleView);
  }

  // Update the period toggle label so it accurately reflects the selected payment frequency
  const periodBtn = $('schedule-btn-period');
  if (periodBtn) {
    const periodLabel =
      inp.frequency === 'monthly'
        ? 'Monthly'
        : inp.frequency === 'semi-monthly'
          ? 'Semi-mo'
          : inp.frequency.includes('weekly') && !inp.frequency.includes('bi')
            ? 'Weekly'
            : 'Bi-weekly';
    periodBtn.textContent = periodLabel;
  }

  const theadRow = $('schedule-thead-row');
  if (theadRow) {
    theadRow.innerHTML = isMonthly
      ? `<th class="col-num">#</th>
         <th class="col-date">Date</th>
         <th class="col-payment"><span class="th-full">Payment</span><span class="th-short">Pmt</span></th>
         <th class="col-interest"><span class="th-full">Interest</span><span class="th-short">Int</span></th>
         <th class="col-principal"><span class="th-full">Principal</span><span class="th-short">Prin</span></th>
         <th class="col-extra">Extra</th>
         <th class="col-balance"><span class="th-full">Balance</span><span class="th-short">Bal</span></th>`
      : `<th class="col-year"><span class="th-full">Year</span><span class="th-short">Yr</span></th>
         <th class="col-interest"><span class="th-full">Interest</span><span class="th-short">Int</span></th>
         <th class="col-principal"><span class="th-full">Principal</span><span class="th-short">Prin</span></th>
         <th class="col-extra">Extra</th>
         <th class="col-balance"><span class="th-full">Balance</span><span class="th-short">Bal</span></th>`;
  }

  const scheduleTitle = $('schedule-title');
  if (scheduleTitle) {
    scheduleTitle.textContent = isMonthly
      ? inp.frequency === 'monthly'
        ? 'Monthly schedule'
        : 'Payment schedule'
      : 'Yearly schedule';
  }

  document.querySelectorAll<HTMLButtonElement>('.schedule-switch-btn').forEach((btn) => {
    const active = btn.dataset.scheduleView === scheduleView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
  });

  // Calculate & render the Prada Milestone Horizons Showcase
  const milestones = buildMilestones(a);
  lastMilestones = milestones;
  renderMilestonesShowcase(milestones);

  const scheduleDetails = $<HTMLDetailsElement>('schedule-details');
  if (!scheduleDetails || scheduleDetails.open) {
    renderScheduleRows(a, milestones);
    scheduleDirty = false;
  } else {
    scheduleDirty = true;
  }
};

// ---------- CSV & Share ----------

const downloadCsv = () => {
  const a = lastAnalysis;
  if (!a || !a.plan.rows.length) return;
  const lines = ['Payment #,Date,Payment,Interest,Principal,Extra,Balance'];
  for (const r of a.plan.rows) {
    lines.push(
      [
        r.n,
        isoDate(r.date),
        (r.scheduled + r.extra).toFixed(2),
        r.interest.toFixed(2),
        r.principal.toFixed(2),
        r.extra.toFixed(2),
        r.balance.toFixed(2)
      ].join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'true-mortgage-schedule.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Schedule CSV downloaded');
};

const sharePlan = () => {
  const url = new URL(window.location.origin + window.location.pathname);
  url.search = serializeUrlInputs(state).toString();

  // Copy to clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url.toString()).then(
      () => showToast('Mortgage plan link copied to clipboard'),
      () => showToast('Could not copy link to clipboard')
    );
  } else {
    window.history.replaceState(null, '', url.toString());
    showToast('Plan link updated in address bar');
  }
};

// ---------- events ----------

/** Ensures mobile screens remain dead-center with zero horizontal drift after keyboard dismissal. */
const resetMobileViewportOffset = () => {
  if (typeof window === 'undefined') return;
  const recenter = () => {
    if (window.scrollX !== 0) {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' as ScrollBehavior });
    }
  };
  recenter();
  requestAnimationFrame(recenter);
  setTimeout(recenter, 120);
};

const bind = () => {
  // Input fields
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
      if (key === 'amortizationYears') syncAmortPills();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.getAttribute('type') === 'date' ? 'change' : 'input', handler);
    el.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && el.tagName === 'INPUT') {
        e.preventDefault();
        el.blur();
      }
    });
    el.addEventListener('blur', () => {
      state = sanitizeInputs(state);
      syncForm();
      render();
      resetMobileViewportOffset();
    });
  });

  // Down payment percentage input
  const downPctInput = $<HTMLInputElement>('in-down-pct');
  downPctInput.addEventListener('input', (e) => {
    const pct = parseFloat((e.target as HTMLInputElement).value);
    const down = Math.round((state.homePrice * (Number.isFinite(pct) ? pct : 0)) / 100);
    update({ downPayment: down });
    setField($<HTMLInputElement>('in-down'), String(down));
    syncDownPct();
  });
  downPctInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      downPctInput.blur();
    }
  });
  downPctInput.addEventListener('blur', () => {
    state = sanitizeInputs(state);
    syncForm();
    render();
    resetMobileViewportOffset();
  });

  // Down payment preset micro-pills
  document.querySelectorAll<HTMLButtonElement>('[data-down-pct]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const pct = parseFloat(pill.dataset.downPct || '0');
      if (Number.isFinite(pct) && state.homePrice > 0) {
        const down = Math.round((state.homePrice * pct) / 100);
        update({ downPayment: down });
        setField($<HTMLInputElement>('in-down'), String(down));
        syncDownPct();
      }
    });
  });

  // Amortization preset micro-pills
  document.querySelectorAll<HTMLButtonElement>('[data-amort]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const years = parseInt(pill.dataset.amort || '0', 10);
      if (years >= 1 && years <= 40) {
        update({ amortizationYears: years });
        setField($<HTMLInputElement>('in-amort'), String(years));
        syncAmortPills();
      }
    });
  });

  // Rate micro-steppers
  $('btn-rate-minus')?.addEventListener('click', () => {
    const nextRate = Math.max(0, Math.round((state.annualRate - 0.25) * 100) / 100);
    update({ annualRate: nextRate });
    setField($<HTMLInputElement>('in-rate'), fmtNum(nextRate));
  });

  $('btn-rate-plus')?.addEventListener('click', () => {
    const nextRate = Math.min(30, Math.round((state.annualRate + 0.25) * 100) / 100);
    update({ annualRate: nextRate });
    setField($<HTMLInputElement>('in-rate'), fmtNum(nextRate));
  });

  // Mode switcher
  document.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) =>
    b.addEventListener('click', () => update({ mode: b.dataset.mode as MortgageInputs['mode'] }))
  );

  // Schedule view switch & lazy-open rendering
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

  const scheduleDetailsEl = $<HTMLDetailsElement>('schedule-details');
  if (scheduleDetailsEl) {
    scheduleDetailsEl.addEventListener('toggle', () => {
      if (scheduleDetailsEl.open && scheduleDirty && lastAnalysis) {
        renderScheduleRows(lastAnalysis, lastMilestones);
        scheduleDirty = false;
      }
    });
  }

  // Payment Increase Privilege
  const toggleEl = $<HTMLInputElement>('toggle-payment-increase');
  if (toggleEl) {
    toggleEl.addEventListener('change', () => {
      const enabled = toggleEl.checked;
      const patch: Partial<MortgageInputs> = { paymentIncreaseEnabled: enabled };
      if (enabled && lastAnalysis) {
        const baseVal = lastAnalysis.basePayment;
        const maxVal = lastAnalysis.maxPayment;
        if (!state.customPayment || state.customPayment < baseVal || state.customPayment > maxVal) {
          patch.customPayment = round2(clamp(baseVal * paymentIncreaseRatio, baseVal, maxVal));
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
          update({ customPayment: lastAnalysis.maxPayment }, false, 2);
        } else {
          update({ customPayment: val });
        }
      }
    });

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        customInput.blur();
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
      resetMobileViewportOffset();
    });
  }

  const applyChip = (ratio: number, calc: (base: number, max: number) => number) => {
    if (lastAnalysis) {
      const val = calc(lastAnalysis.basePayment, lastAnalysis.maxPayment);
      const input = $<HTMLInputElement>('in-payment-increase');
      if (input) setField(input, fmtNum(val));
      update({ customPayment: val }, false, ratio);
    }
  };

  $('chip-base')?.addEventListener('click', () => applyChip(1, (base) => base));
  $('chip-plus-10')?.addEventListener('click', () =>
    applyChip(1.1, (base, max) => Math.min(max, round2(base * 1.1)))
  );
  $('chip-plus-25')?.addEventListener('click', () =>
    applyChip(1.25, (base, max) => Math.min(max, round2(base * 1.25)))
  );
  $('chip-double')?.addEventListener('click', () => applyChip(2, (_, max) => max));

  // Reset
  $('btn-reset').addEventListener('click', () => {
    const previousState = { ...state };
    const previousEntry = { ...entryStrategy };
    const previousRatio = paymentIncreaseRatio;
    state = { ...DEFAULT_INPUTS, country: state.country, startDate: defaultStartDate() };
    paymentIncreaseRatio = 1;
    entryStrategy = extractStrategyInputs(state);
    clearUrlQueryIfPresent();
    save();
    syncForm();
    render();
    showToast('Parameters reset to default', {
      actionLabel: 'Undo',
      onAction: () => {
        entryStrategy = previousEntry;
        update(previousState, true, previousRatio);
        syncForm();
        syncCostsSectionOpen();
        showToast('Restored previous parameters');
      }
    });
  });

  // Header & table print helper (forces high-contrast light mode on canvases & ensures schedule is open)
  const triggerPrint = () => {
    prepareForPrint();
    window.print();
  };

  // Header actions
  $('btn-share')?.addEventListener('click', sharePlan);
  $('btn-theme')?.addEventListener('click', toggleTheme);
  $('btn-print')?.addEventListener('click', triggerPrint);
  $('btn-print-table')?.addEventListener('click', triggerPrint);
  $('btn-csv')?.addEventListener('click', downloadCsv);
  // Milestone Showcase navigation
  const showcase = $('milestones-showcase');
  if (showcase) {
    showcase.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.milestone-card');
      if (!card) return;
      const yr = parseInt(card.dataset.year || '0', 10);
      const mo = parseInt(card.dataset.month || '0', 10);
      scrollToMilestone(yr, mo);
    });
    showcase.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = (e.target as HTMLElement).closest<HTMLElement>('.milestone-card');
        if (!card) return;
        e.preventDefault();
        const yr = parseInt(card.dataset.year || '0', 10);
        const mo = parseInt(card.dataset.month || '0', 10);
        scrollToMilestone(yr, mo);
      }
    });
  }

  $('mortgage-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    resetMobileViewportOffset();
  });
};

let printPrepared = false;
let scheduleWasClosedBeforePrint = false;

const prepareForPrint = () => {
  const details = document.querySelector<HTMLDetailsElement>('details.schedule');
  if (details && !details.open) {
    scheduleWasClosedBeforePrint = true;
    details.open = true;
  }
  if (scheduleDirty && lastAnalysis) {
    renderScheduleRows(lastAnalysis, lastMilestones);
    scheduleDirty = false;
  }
  if (!printPrepared) {
    printPrepared = true;
    setPrintLightMode(true);
    chartsManager?.drawAll();
  }
};

const restoreAfterPrint = () => {
  if (scheduleWasClosedBeforePrint) {
    const details = document.querySelector<HTMLDetailsElement>('details.schedule');
    if (details) details.open = false;
    scheduleWasClosedBeforePrint = false;
  }
  if (printPrepared) {
    printPrepared = false;
    setPrintLightMode(false);
    chartsManager?.drawAll();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  syncForm();
  syncCostsSectionOpen();
  bind();
  render();
});

// Crisp vector print redraw in high-contrast light mode
window.addEventListener('beforeprint', prepareForPrint);
window.addEventListener('afterprint', restoreAfterPrint);
