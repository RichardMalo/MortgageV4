/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Main Application Lifecycle Bootstrap & Reactive Coordinator
 */

import { Store } from './ui/store.js';
import { CommandPalette } from './ui/command-palette.js';
import { QrHandoffModal } from './ui/qr-modal.js';
import { BottomSheet } from './ui/bottom-sheet.js';
import { LedgerTable } from './ui/ledger-table.js';
import { LivingArc } from './charts/living-arc.js';
import { TrajectoryChart } from './charts/trajectory-chart.js';
import { OpportunityChart } from './charts/opportunity-chart.js';
import { RateLadderChart } from './charts/rate-ladder-chart.js';
import { MultiDebtChart } from './charts/multi-debt-chart.js';
import { LaborViz } from './charts/labor-viz.js';

import {
  generateMortgageSchedule,
  calculateCanadianMinDownPayment,
  calculateCmhcInsurance,
  calculateOsfiStressTestRate,
  calculateMilestones,
  calculateMultiDebtCascade
} from './core/math.js';
import { calculateOpportunityCost } from './core/opportunity-cost.js';
import { calculateCareerLabor } from './core/wages.js';
import { runFinancialCopilot } from './core/copilot.js';
import { getRenewalLadder, applyMacroPresetToRates } from './core/rate-shock.js';
import { solvePayoffGoal } from './core/goal-solver.js';
import { decompressInputsFromHandoff } from './core/qr-sync.js';
import { formatCurrency, formatPercent } from './core/formatters.js';
import { Inputs, StudioStage } from './core/types.js';

class StudioApp {
  private store: Store;
  private commandPalette!: CommandPalette;
  private qrModal!: QrHandoffModal;
  private bottomSheet!: BottomSheet;
  private ledgerTable!: LedgerTable;

  // Micro-Charts
  private livingArc!: LivingArc;
  private trajectoryChart!: TrajectoryChart;
  private opportunityChart!: OpportunityChart;
  private rateLadderChart!: RateLadderChart;
  private multiDebtChart!: MultiDebtChart;
  private laborViz!: LaborViz;

  constructor() {
    this.store = new Store();
    this.checkUrlHandoff();
    this.store.applyTheme();
    this.initComponents();
    this.bindEvents();
    this.syncPaneCollapse(this.store.getState());
    this.recalculate();
  }

  private checkUrlHandoff() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash.startsWith('#handoff=')) {
      const payload = hash.replace('#handoff=', '');
      const restored = decompressInputsFromHandoff(payload);
      if (restored) {
        this.store.updateInputs(restored);
        history.replaceState(null, '', window.location.pathname);
      }
    }
  }

  private initComponents() {
    // 1. Modals & Tables
    this.qrModal = new QrHandoffModal();
    this.bottomSheet = new BottomSheet();

    const ledgerContainer = document.getElementById('ledger-table-container');
    if (ledgerContainer) {
      this.ledgerTable = new LedgerTable(ledgerContainer);
    }

    this.commandPalette = new CommandPalette(this.store, {
      onOpenGoalSolver: () => this.store.setStage('engine'),
      onOpenHandoff: () => this.qrModal.open(this.store.getInputs()),
      onExportCsv: () => this.ledgerTable?.exportCsv()
    });

    // 2. Micro-Charts
    const livingArcEl = document.getElementById('living-arc-container');
    if (livingArcEl) this.livingArc = new LivingArc(livingArcEl);

    const trajEl = document.getElementById('trajectory-chart-container');
    if (trajEl) this.trajectoryChart = new TrajectoryChart(trajEl);

    const oppEl = document.getElementById('opportunity-chart-container');
    if (oppEl) this.opportunityChart = new OpportunityChart(oppEl);

    const rateLadderEl = document.getElementById('rate-ladder-chart-container');
    if (rateLadderEl) this.rateLadderChart = new RateLadderChart(rateLadderEl);

    const multiDebtEl = document.getElementById('multi-debt-chart-container');
    if (multiDebtEl) this.multiDebtChart = new MultiDebtChart(multiDebtEl);

    const laborEl = document.getElementById('labor-viz-container');
    if (laborEl) this.laborViz = new LaborViz(laborEl);
  }

  private recalculate() {
    const inputs = this.store.getInputs();
    const state = this.store.getState();

    // 1. Run Schedules (Baseline vs. Strategy)
    const baseline = generateMortgageSchedule(inputs, true, false);
    const strategy = generateMortgageSchedule(inputs, false, false);

    const totalInterestSaved = Math.max(
      0,
      baseline.summary.totalInterest - strategy.summary.totalInterest
    );
    const monthsSaved = Math.max(
      0,
      baseline.summary.periodsToPayoff - strategy.summary.periodsToPayoff
    );
    const yearsSaved = Math.round((monthsSaved / 12) * 10) / 10;

    // 2. Update Kinetic Hero Banner
    const heroSavingsEl = document.getElementById('hero-total-savings');
    if (heroSavingsEl) heroSavingsEl.textContent = formatCurrency(totalInterestSaved, inputs.country);

    const heroDateEl = document.getElementById('hero-payoff-date');
    if (heroDateEl) heroDateEl.textContent = strategy.summary.payoffDate || 'Oct 2046';

    const heroYearsEl = document.getElementById('hero-years-saved');
    if (heroYearsEl) {
      heroYearsEl.textContent = yearsSaved > 0 ? `${yearsSaved} Years Shaved` : 'Standard Amortization';
    }

    const heroPmtEl = document.getElementById('hero-monthly-payment');
    if (heroPmtEl && strategy.schedule[0]) {
      heroPmtEl.textContent = formatCurrency(strategy.schedule[0].payment, inputs.country);
    }

    // 3. Update Form Inputs
    this.syncFormValues(inputs);

    // 4. Render Micro-Charts
    const principalFinanced = Math.max(1, inputs.homePrice - inputs.downPayment);
    if (this.livingArc) {
      this.livingArc.render({
        container: document.getElementById('living-arc-container')!,
        principal: principalFinanced,
        totalInterest: strategy.summary.totalInterest,
        schedule: strategy.schedule,
        summary: strategy.summary,
        country: inputs.country
      });
    }

    if (this.trajectoryChart) {
      this.trajectoryChart.render({
        container: document.getElementById('trajectory-chart-container')!,
        baselineSchedule: baseline.schedule,
        strategySchedule: strategy.schedule,
        termYears: inputs.termYears,
        country: inputs.country
      });
    }

    // 5. Opportunity Cost
    const oppSummary = calculateOpportunityCost(inputs, strategy.schedule);
    if (this.opportunityChart) {
      this.opportunityChart.render({
        container: document.getElementById('opportunity-chart-container')!,
        summary: oppSummary,
        country: inputs.country
      });
    }
    const oppMsgEl = document.getElementById('opp-cost-message');
    if (oppMsgEl) oppMsgEl.textContent = oppSummary.recommendationMessage;
    const oppBadgeEl = document.getElementById('opp-cost-badge');
    if (oppBadgeEl) {
      oppBadgeEl.textContent =
        oppSummary.recommendation === 'invest'
          ? 'Investing Wins'
          : oppSummary.recommendation === 'prepay'
          ? 'Prepaying Wins'
          : 'Close Parity';
      oppBadgeEl.style.color =
        oppSummary.recommendation === 'invest' ? '#f59e0b' : '#10b981';
    }

    // 6. Career Labor Converter
    const laborMetrics = calculateCareerLabor(inputs, strategy.schedule);
    if (this.laborViz) {
      this.laborViz.render({
        container: document.getElementById('labor-viz-container')!,
        metrics: laborMetrics,
        country: inputs.country
      });
    }

    // 7. Refinancing Rate Ladder
    const ladder = getRenewalLadder(inputs);
    if (this.rateLadderChart) {
      this.rateLadderChart.render({
        container: document.getElementById('rate-ladder-chart-container')!,
        initialRate: inputs.annualRate,
        ladder,
        amortizationYears: inputs.amortizationYears,
        onRateChange: (year: number, newRate: number) => {
          const curInputs = this.store.getInputs();
          const updatedTermRates = { ...curInputs.termRates, [year]: newRate };
          this.store.updateInputs({
            rateShockEnabled: true,
            rateShockPreset: 'custom',
            termRates: updatedTermRates
          });

          // Unhighlight preset buttons when user manually drags nodes
          const macroBtns = document.querySelectorAll('.macro-btn');
          macroBtns.forEach((b) => b.classList.remove('active'));
        }
      });
    }

    // Update status badge on rate ladder card
    const statusEl = document.getElementById('rate-ladder-active-status');
    if (statusEl) {
      if (inputs.rateShockPreset === 'soft-landing') {
        statusEl.textContent = 'Soft Landing (-1.5%)';
        statusEl.className = 'mono text-emerald font-bold';
      } else if (inputs.rateShockPreset === 'inflation-spike') {
        statusEl.textContent = 'Inflation Spike (+2.0%)';
        statusEl.className = 'mono text-rose font-bold';
      } else if (inputs.rateShockPreset === 'custom') {
        statusEl.textContent = 'Interactive Custom Drag';
        statusEl.className = 'mono text-amber font-bold';
      } else {
        statusEl.textContent = 'Status Quo';
        statusEl.className = 'mono text-cyan font-bold';
      }
    }

    // 8. Canadian Statutory Figures & CMHC
    const minDownRes = calculateCanadianMinDownPayment(inputs.homePrice);
    const minDownEl = document.getElementById('stat-can-min-down');
    if (minDownEl) {
      minDownEl.textContent = `${formatCurrency(minDownRes.minDownPayment, inputs.country)} (${formatPercent(minDownRes.minDownPaymentPct * 100, 1)})`;
    }

    const cmhcRes = calculateCmhcInsurance(
      inputs.homePrice,
      inputs.downPayment,
      inputs.amortizationYears,
      inputs.province,
      true
    );
    const cmhcPremiumEl = document.getElementById('stat-can-cmhc-premium');
    if (cmhcPremiumEl) cmhcPremiumEl.textContent = formatCurrency(cmhcRes.insuranceAmount, inputs.country);

    const cmhcPstEl = document.getElementById('stat-can-cmhc-pst');
    if (cmhcPstEl) cmhcPstEl.textContent = formatCurrency(cmhcRes.pstAmount, inputs.country);

    const stressRateEl = document.getElementById('stat-can-stress-rate');
    if (stressRateEl) stressRateEl.textContent = formatPercent(calculateOsfiStressTestRate(inputs.annualRate));

    // 9. AI Financial Copilot Insights
    const insights = runFinancialCopilot(inputs, strategy);
    this.renderCopilotInsights(insights);

    // 10. Milestone Highway
    const milestones = calculateMilestones(strategy.schedule, inputs.homePrice, principalFinanced);
    this.renderMilestones(milestones);

    // 11. Multi-Debt Cascade Stack
    const cascadeDebts = inputs.householdDebts || [];
    const cascadeBudget = inputs.cascadeMonthlyBudget || 1200;
    const cascadeRes = calculateMultiDebtCascade(
      cascadeDebts,
      cascadeBudget,
      inputs.cascadeStrategy || 'avalanche',
      inputs.cascadeMortgageRollover,
      principalFinanced,
      inputs.annualRate
    );
    if (this.multiDebtChart) {
      this.multiDebtChart.render({
        container: document.getElementById('multi-debt-chart-container')!,
        cascadeResult: cascadeRes,
        country: inputs.country
      });
    }

    // 12. Full Amortization Ledger Table
    if (this.ledgerTable) {
      this.ledgerTable.render(strategy.schedule, inputs.termYears, inputs.country);
    }

    // 13. Goal Solver calculation
    this.updateGoalSolverDisplay(inputs);
  }

  private syncFormValues(inputs: Inputs) {
    const setVal = (id: string, val: any) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el && document.activeElement !== el) el.value = String(val);
    };

    setVal('input-home-price', inputs.homePrice);
    setVal('input-down-payment', inputs.downPayment);
    setVal('input-annual-rate', inputs.annualRate);
    setVal('input-amortization', inputs.amortizationYears);
    setVal('input-term', inputs.termYears);
    setVal('select-compounding', inputs.compounding);
    setVal('select-frequency', inputs.frequency);
    setVal('input-start-date', inputs.startDate);
    setVal('input-offset-balance', inputs.offsetBalance || 0);
    setVal('input-offset-monthly', inputs.offsetMonthlyDeposit || 0);

    // Down payment pct
    const downPct = inputs.homePrice > 0 ? (inputs.downPayment / inputs.homePrice) * 100 : 20;
    const downPctLabel = document.getElementById('label-down-pct');
    if (downPctLabel) downPctLabel.textContent = `${downPct.toFixed(1)}%`;
    setVal('slider-down-payment', downPct);

    // Pulse Dials
    setVal('pulse-slider-balance', inputs.homePrice - inputs.downPayment);
    const pulseBalLabel = document.getElementById('pulse-balance-label');
    if (pulseBalLabel) pulseBalLabel.textContent = formatCurrency(inputs.homePrice - inputs.downPayment, inputs.country);

    setVal('pulse-slider-rate', inputs.annualRate);
    const pulseRateLabel = document.getElementById('pulse-rate-label');
    if (pulseRateLabel) pulseRateLabel.textContent = `${inputs.annualRate.toFixed(2)}%`;

    setVal('pulse-slider-extra', inputs.extraPayment || 0);
    const pulseExtraLabel = document.getElementById('pulse-extra-label');
    if (pulseExtraLabel) pulseExtraLabel.textContent = `+${formatCurrency(inputs.extraPayment || 0, inputs.country)} / mo`;

    // Strategy Lab Sliders
    setVal('slider-extra-monthly', inputs.extraPayment || 0);
    const valExtraMonthly = document.getElementById('val-extra-monthly');
    if (valExtraMonthly) valExtraMonthly.textContent = `+${formatCurrency(inputs.extraPayment || 0, inputs.country)}/mo`;

    setVal('slider-lump-sum', inputs.lumpSum || 0);
    const valLumpSum = document.getElementById('val-lump-sum');
    if (valLumpSum) valLumpSum.textContent = formatCurrency(inputs.lumpSum || 0, inputs.country);

    setVal('slider-invest-rate', inputs.investRate || 7.5);
    const valInvestRate = document.getElementById('val-invest-rate');
    if (valInvestRate) valInvestRate.textContent = `${(inputs.investRate || 7.5).toFixed(2)}% / yr`;
  }

  private renderCopilotInsights(insights: any[]) {
    const container = document.getElementById('copilot-container');
    if (!container) return;

    if (insights.length === 0) {
      container.innerHTML = `<div style="font-size: 0.78rem; opacity: 0.7; text-align: center; padding: 10px;">Scenario is mathematically optimized.</div>`;
      return;
    }

    container.innerHTML = insights
      .map(
        (ins) => `
        <div class="copilot-card ${ins.type}">
          <div class="copilot-title">
            <span>${ins.title}</span>
            ${ins.metric ? `<span class="mono text-cyan" style="font-size: 0.72rem;">${ins.metric}</span>` : ''}
          </div>
          <div class="copilot-msg">${ins.message}</div>
          ${
            ins.actionText
              ? `<button class="copilot-action-btn" data-insight-id="${ins.id}">${ins.actionText}</button>`
              : ''
          }
        </div>
      `
      )
      .join('');

    // Bind action buttons
    const actionBtns = container.querySelectorAll('.copilot-action-btn');
    actionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-insight-id');
        const found = insights.find((i) => i.id === id);
        if (found?.actionPayload) {
          this.store.updateInputs(found.actionPayload);
        } else if (id === 'rate-shock-warn') {
          this.store.setStage('engine');
        }
      });
    });
  }

  private renderMilestones(milestones: any[]) {
    const container = document.getElementById('milestones-container');
    if (!container) return;

    container.innerHTML = milestones
      .map(
        (m) => `
        <div class="milestone-node">
          <div class="milestone-dot ${m.type === 'payoff' ? 'payoff' : ''}"></div>
          <div class="milestone-title">
            <span>${m.title}</span>
            <span class="mono text-cyan" style="font-size: 0.72rem;">${m.dateLabel}</span>
          </div>
          <div class="milestone-desc">${m.description}</div>
        </div>
      `
      )
      .join('');
  }

  private updateGoalSolverDisplay(inputs: Inputs) {
    const slider = document.getElementById('slider-target-years') as HTMLInputElement | null;
    const targetYrs = slider ? parseInt(slider.value, 10) : 15;

    const label = document.getElementById('label-target-years');
    if (label) label.textContent = `${targetYrs} Years`;

    const goal = solvePayoffGoal(inputs, targetYrs);
    const reqExtraEl = document.getElementById('goal-solver-required-extra');
    if (reqExtraEl) {
      reqExtraEl.textContent = `+${formatCurrency(goal.requiredExtraMonthly, inputs.country)} / month`;
    }
  }

  private bindEvents() {
    this.store.subscribe((state) => {
      this.syncStageUi(state.currentStage);
      this.syncPaneCollapse(state);
      this.recalculate();
    });

    // 1. Stage Switching
    const stageTabs = document.querySelectorAll('.stage-tab-btn');
    stageTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const stage = (e.currentTarget as HTMLElement).getAttribute('data-stage') as StudioStage;
        if (stage) this.store.setStage(stage);
      });
    });

    const enterLabBtn = document.getElementById('btn-enter-lab');
    enterLabBtn?.addEventListener('click', () => this.store.setStage('lab'));

    // 2. Header Actions
    document.getElementById('btn-command-palette')?.addEventListener('click', () => this.commandPalette.toggle());
    document.getElementById('btn-qr-handoff')?.addEventListener('click', () => this.qrModal.open(this.store.getInputs()));
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => this.store.toggleTheme());

    // 3. Panel Toggles (In-pane card headers, edge restore tabs, and header toggles)
    document.getElementById('toggle-pane-left')?.addEventListener('click', () => this.store.toggleLeftPane());
    document.getElementById('toggle-pane-right')?.addEventListener('click', () => this.store.toggleRightPane());
    document.getElementById('btn-restore-pane-left')?.addEventListener('click', () => this.store.toggleLeftPane());
    document.getElementById('btn-restore-pane-right')?.addEventListener('click', () => this.store.toggleRightPane());
    document.getElementById('btn-header-toggle-left')?.addEventListener('click', () => this.store.toggleLeftPane());
    document.getElementById('btn-header-toggle-right')?.addEventListener('click', () => this.store.toggleRightPane());

    // 4. Form Change Listeners (Zero main-thread lag)
    const bindInput = (id: string, key: keyof Inputs, parser: (val: string) => any) => {
      const el = document.getElementById(id);
      el?.addEventListener('input', (e) => {
        const val = parser((e.target as HTMLInputElement).value);
        this.store.updateInputs({ [key]: val });
      });
    };

    bindInput('input-home-price', 'homePrice', parseFloat);
    bindInput('input-down-payment', 'downPayment', parseFloat);
    bindInput('input-annual-rate', 'annualRate', parseFloat);
    bindInput('input-amortization', 'amortizationYears', parseInt);
    bindInput('input-term', 'termYears', parseInt);
    bindInput('select-compounding', 'compounding', (v) => v as any);
    bindInput('select-frequency', 'frequency', (v) => v as any);
    bindInput('input-start-date', 'startDate', (v) => v);
    bindInput('input-offset-balance', 'offsetBalance', parseFloat);
    bindInput('input-offset-monthly', 'offsetMonthlyDeposit', parseFloat);

    // Down payment slider sync
    const sliderDown = document.getElementById('slider-down-payment');
    sliderDown?.addEventListener('input', (e) => {
      const pct = parseFloat((e.target as HTMLInputElement).value) / 100;
      const homePrice = this.store.getInputs().homePrice;
      const down = Math.round(homePrice * pct);
      this.store.updateInputs({ downPayment: down });
    });

    // 5. Stage 1 (Pulse) Dials
    document.getElementById('pulse-slider-balance')?.addEventListener('input', (e) => {
      const bal = parseFloat((e.target as HTMLInputElement).value);
      this.store.updateInputs({ homePrice: bal * 1.25, downPayment: bal * 0.25 });
    });

    document.getElementById('pulse-slider-rate')?.addEventListener('input', (e) => {
      const r = parseFloat((e.target as HTMLInputElement).value);
      this.store.updateInputs({ annualRate: r });
    });

    document.getElementById('pulse-slider-extra')?.addEventListener('input', (e) => {
      const ex = parseFloat((e.target as HTMLInputElement).value);
      this.store.updateInputs({ extraPayment: ex });
    });

    // 6. Strategy Lab Sliders
    bindInput('slider-extra-monthly', 'extraPayment', parseFloat);
    bindInput('slider-lump-sum', 'lumpSum', parseFloat);
    bindInput('slider-invest-rate', 'investRate', parseFloat);

    // 7. Macro Scenario Presets
    const macroBtns = document.querySelectorAll('.macro-btn');
    macroBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        macroBtns.forEach((b) => b.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');

        const preset = (e.currentTarget as HTMLElement).getAttribute('data-preset') as any;
        const curInputs = this.store.getInputs();
        const newRates = applyMacroPresetToRates(
          curInputs.annualRate,
          curInputs.amortizationYears,
          curInputs.termYears,
          preset
        );

        this.store.updateInputs({
          rateShockEnabled: preset !== 'status-quo',
          rateShockPreset: preset,
          termRates: newRates
        });
      });
    });

    // 8. Goal Solver Apply Button
    document.getElementById('slider-target-years')?.addEventListener('input', () => {
      this.updateGoalSolverDisplay(this.store.getInputs());
    });

    document.getElementById('btn-apply-goal-solver')?.addEventListener('click', () => {
      const slider = document.getElementById('slider-target-years') as HTMLInputElement | null;
      const targetYrs = slider ? parseInt(slider.value, 10) : 15;
      const goal = solvePayoffGoal(this.store.getInputs(), targetYrs);
      if (goal.requiredExtraMonthly > 0) {
        this.store.updateInputs({ extraPayment: goal.requiredExtraMonthly });
      }
    });

    // 9. Mobile Bottom Dock
    const dockBtns = document.querySelectorAll('.mobile-dock-btn');
    dockBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        dockBtns.forEach((b) => b.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-mobile-tab') as any;
        if (tab === 'ledger') {
          this.store.setStage('engine');
          document.getElementById('ledger-table-container')?.scrollIntoView({ behavior: 'smooth' });
        } else {
          this.store.setStage(tab);
        }
      });
    });
  }

  private syncStageUi(stage: StudioStage) {
    const tabs = document.querySelectorAll('.stage-tab-btn');
    tabs.forEach((tab) => {
      const s = tab.getAttribute('data-stage');
      if (s === stage) tab.classList.add('active');
      else tab.classList.remove('active');
    });

    const sections = ['pulse', 'lab', 'engine'];
    sections.forEach((s) => {
      const el = document.getElementById(`stage-${s}-content`);
      if (el) {
        el.style.display = s === stage ? 'block' : 'none';
      }
    });
  }

  private syncPaneCollapse(state: any) {
    const leftPane = document.getElementById('left-pane');
    const rightPane = document.getElementById('right-pane');
    const restoreLeft = document.getElementById('btn-restore-pane-left');
    const restoreRight = document.getElementById('btn-restore-pane-right');
    const headerToggleLeft = document.getElementById('btn-header-toggle-left');
    const headerToggleRight = document.getElementById('btn-header-toggle-right');
    const inPaneToggleLeft = document.getElementById('toggle-pane-left');
    const inPaneToggleRight = document.getElementById('toggle-pane-right');

    const isLeftCollapsed = !!state.leftPaneCollapsed;
    const isRightCollapsed = !!state.rightPaneCollapsed;

    if (leftPane) {
      if (isLeftCollapsed) {
        leftPane.classList.add('collapsed');
        leftPane.setAttribute('aria-hidden', 'true');
      } else {
        leftPane.classList.remove('collapsed');
        leftPane.setAttribute('aria-hidden', 'false');
      }
    }

    if (rightPane) {
      if (isRightCollapsed) {
        rightPane.classList.add('collapsed');
        rightPane.setAttribute('aria-hidden', 'true');
      } else {
        rightPane.classList.remove('collapsed');
        rightPane.setAttribute('aria-hidden', 'false');
      }
    }

    // Edge restore tabs
    if (restoreLeft) {
      restoreLeft.classList.toggle('visible', isLeftCollapsed);
      restoreLeft.setAttribute('aria-expanded', (!isLeftCollapsed).toString());
    }

    if (restoreRight) {
      restoreRight.classList.toggle('visible', isRightCollapsed);
      restoreRight.setAttribute('aria-expanded', (!isRightCollapsed).toString());
    }

    // Top Header toggles
    if (headerToggleLeft) {
      headerToggleLeft.classList.toggle('active', !isLeftCollapsed);
      headerToggleLeft.classList.toggle('collapsed', isLeftCollapsed);
      headerToggleLeft.setAttribute('aria-pressed', (!isLeftCollapsed).toString());
      headerToggleLeft.title = isLeftCollapsed
        ? 'Expand Parameters Panel ([)'
        : 'Collapse Parameters Panel ([)';
    }

    if (headerToggleRight) {
      headerToggleRight.classList.toggle('active', !isRightCollapsed);
      headerToggleRight.classList.toggle('collapsed', isRightCollapsed);
      headerToggleRight.setAttribute('aria-pressed', (!isRightCollapsed).toString());
      headerToggleRight.title = isRightCollapsed
        ? 'Expand AI Copilot & Milestones (])'
        : 'Collapse AI Copilot & Milestones (])';
    }

    // In-pane card toggle buttons
    if (inPaneToggleLeft) {
      inPaneToggleLeft.setAttribute('aria-expanded', (!isLeftCollapsed).toString());
    }
    if (inPaneToggleRight) {
      inPaneToggleRight.setAttribute('aria-expanded', (!isRightCollapsed).toString());
    }
  }
}

// Bootstrap Application on DOMContentLoaded
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new StudioApp();
  });
}
