/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Main Application Lifecycle Bootstrap & Reactive Coordinator
 */

import { Store } from './ui/store.js';
import { CommandPalette } from './ui/command-palette.js';
import { QrHandoffModal } from './ui/qr-modal.js';
import { BottomSheet } from './ui/bottom-sheet.js';
import { LedgerTable } from './ui/ledger-table.js';
import { LumpSumsModal } from './ui/lump-sums-modal.js';
import { SandboxModal } from './ui/sandbox-modal.js';

import { LivingArc } from './charts/living-arc.js';
import { TrajectoryChart } from './charts/trajectory-chart.js';
import { OpportunityChart } from './charts/opportunity-chart.js';
import { RateLadderChart } from './charts/rate-ladder-chart.js';
import { MultiDebtChart } from './charts/multi-debt-chart.js';
import { LaborViz } from './charts/labor-viz.js';
import { PaymentDonutChart } from './charts/payment-donut.js';
import { StrategyComparisonChart } from './charts/strategy-comparison-chart.js';
import { PaymentCompositionChart } from './charts/payment-composition-chart.js';
import { SensitivityHeatmap } from './charts/sensitivity-heatmap.js';
import { AnnualCashFlowChart } from './charts/annual-cash-flow-chart.js';
import { CumulativeOutflowChart } from './charts/cumulative-outflow-chart.js';
import { EquityLtvChart } from './charts/equity-ltv-chart.js';

import {
  generateMortgageSchedule,
  calculateCanadianMinDownPayment,
  calculateCmhcInsurance,
  calculateOsfiStressTestRate,
  calculateMilestones,
  calculateMultiDebtCascade,
  calculateClosingTax
} from './core/math.js';
import { computeHeatmapGridSync } from './core/heatmap-math.js';
import { calculateOpportunityCost } from './core/opportunity-cost.js';
import { calculateCareerLabor } from './core/wages.js';
import { runFinancialCopilot } from './core/copilot.js';
import { getRenewalLadder, applyMacroPresetToRates } from './core/rate-shock.js';
import { solvePayoffGoal } from './core/goal-solver.js';
import { decompressInputsFromHandoff } from './core/qr-sync.js';
import { formatCurrency, formatPercent } from './core/formatters.js';
import { DebtMode, Inputs, StudioStage } from './core/types.js';

class StudioApp {
  private store: Store;
  private commandPalette!: CommandPalette;
  private qrModal!: QrHandoffModal;
  private bottomSheet!: BottomSheet;
  private ledgerTable!: LedgerTable;
  private lumpSumsModal!: LumpSumsModal;
  private sandboxModal!: SandboxModal;

  // Micro-Charts
  private livingArc!: LivingArc;
  private trajectoryChart!: TrajectoryChart;
  private opportunityChart!: OpportunityChart;
  private rateLadderChart!: RateLadderChart;
  private multiDebtChart!: MultiDebtChart;
  private laborViz!: LaborViz;
  private paymentDonut!: PaymentDonutChart;
  private strategyComparison!: StrategyComparisonChart;
  private paymentComposition!: PaymentCompositionChart;
  private sensitivityHeatmap!: SensitivityHeatmap;
  private annualCashFlow!: AnnualCashFlowChart;
  private cumulativeOutflow!: CumulativeOutflowChart;
  private equityLtv!: EquityLtvChart;

  constructor() {
    this.store = new Store();
    this.checkUrlHandoff();
    this.store.applyTheme();
    this.initComponents();
    this.bindEvents();
    this.syncPaneCollapse(this.store.getState());
    this.syncModeUi(this.store.getState().currentMode || 'mortgage');
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
    this.lumpSumsModal = new LumpSumsModal(this.store);
    this.sandboxModal = new SandboxModal(this.store);

    const ledgerContainer = document.getElementById('ledger-table-container');
    if (ledgerContainer) {
      this.ledgerTable = new LedgerTable(ledgerContainer);
    }

    this.commandPalette = new CommandPalette(this.store, {
      onOpenGoalSolver: () => this.store.setStage('engine'),
      onOpenHandoff: () => this.qrModal.open(this.store.getInputs()),
      onExportCsv: () => this.ledgerTable?.exportCsv(),
      onOpenLumpSums: () => this.lumpSumsModal.open(),
      onOpenSandbox: () => this.sandboxModal.open()
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

    const donutEl = document.getElementById('payment-donut-container');
    if (donutEl) this.paymentDonut = new PaymentDonutChart(donutEl);

    const stratCompEl = document.getElementById('strategy-comparison-container');
    if (stratCompEl) this.strategyComparison = new StrategyComparisonChart(stratCompEl);

    const payCompEl = document.getElementById('payment-composition-container');
    if (payCompEl) this.paymentComposition = new PaymentCompositionChart(payCompEl);

    const heatmapEl = document.getElementById('sensitivity-heatmap-container');
    if (heatmapEl) this.sensitivityHeatmap = new SensitivityHeatmap(heatmapEl);

    const annualEl = document.getElementById('annual-cash-flow-container');
    if (annualEl) this.annualCashFlow = new AnnualCashFlowChart(annualEl);

    const cumEl = document.getElementById('cumulative-outflow-container');
    if (cumEl) this.cumulativeOutflow = new CumulativeOutflowChart(cumEl);

    const equityLtvEl = document.getElementById('equity-ltv-container');
    if (equityLtvEl) this.equityLtv = new EquityLtvChart(equityLtvEl);
  }

  private recalculate() {
    const inputs = this.store.getInputs();

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

    // 4. Render Primary Micro-Charts
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

    // 5. Monthly Payment Donut & Strategy Comparison
    if (this.paymentDonut) {
      const firstRow = strategy.schedule[0];
      const monthlyPrincipal = firstRow ? firstRow.principal : 0;
      const monthlyInterest = firstRow ? firstRow.interest : 0;
      const useEscrow = inputs.includeEscrow !== false;
      const monthlyTax = useEscrow ? (inputs.propertyTaxAnnual || 4200) / 12 : 0;
      const monthlyIns = useEscrow ? (inputs.homeInsuranceAnnual || 1200) / 12 : 0;
      const monthlyHoa = useEscrow ? (inputs.hoaMonthly || 0) : 0;
      const ltvPct = inputs.homePrice > 0 ? (principalFinanced / inputs.homePrice) * 100 : 80;
      const monthlyPmi = (useEscrow && ltvPct > 80) ? (inputs.homePrice * ((inputs.pmiRate || 0.5) / 100)) / 12 : 0;

      this.paymentDonut.render({
        container: document.getElementById('payment-donut-container')!,
        principal: monthlyPrincipal,
        interest: monthlyInterest,
        tax: monthlyTax,
        insurance: monthlyIns,
        hoa: monthlyHoa,
        pmi: monthlyPmi,
        extra: inputs.extraPayment || 0,
        country: inputs.country
      });
    }

    if (this.strategyComparison) {
      this.strategyComparison.render({
        container: document.getElementById('strategy-comparison-container')!,
        baselineInterest: baseline.summary.totalInterest,
        strategyInterest: strategy.summary.totalInterest,
        baselineYears: baseline.summary.periodsToPayoff / 12,
        strategyYears: strategy.summary.periodsToPayoff / 12,
        country: inputs.country
      });
    }

    // 6. Payment Composition Over Time
    if (this.paymentComposition) {
      this.paymentComposition.render({
        container: document.getElementById('payment-composition-container')!,
        schedule: strategy.schedule,
        country: inputs.country
      });
    }

    // 7. Opportunity Cost
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

    // 8. Career Labor Converter
    const laborMetrics = calculateCareerLabor(inputs, strategy.schedule);
    if (this.laborViz) {
      this.laborViz.render({
        container: document.getElementById('labor-viz-container')!,
        metrics: laborMetrics,
        country: inputs.country
      });
    }

    // 9. Refinancing Rate Ladder
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

    // 10. 2D Prepayment Sensitivity Heatmap
    if (this.sensitivityHeatmap) {
      const mode = this.store.getState().currentMode || 'mortgage';
      const matrix = computeHeatmapGridSync(mode, inputs, principalFinanced, baseline);
      this.sensitivityHeatmap.render({
        container: document.getElementById('sensitivity-heatmap-container')!,
        matrix,
        currentExtra: inputs.extraPayment || 0,
        currentLumpSum: inputs.lumpSum || 0,
        country: inputs.country,
        onSelectCell: (extraMonthly, lumpSum) => {
          this.store.updateInputs({ extraPayment: extraMonthly, lumpSum });
        }
      });
    }

    // 11. Canadian Statutory Figures & CMHC
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

    // 12. Statutory Closing Taxes (LTT / SDLT / Duty)
    const selectCountryEl = document.getElementById('select-closing-country') as HTMLSelectElement | null;
    const selectRegionEl = document.getElementById('select-closing-region') as HTMLSelectElement | null;
    const chkFirstTimeEl = document.getElementById('chk-first-time-buyer') as HTMLInputElement | null;
    const chkAddlPropEl = document.getElementById('chk-additional-property') as HTMLInputElement | null;

    const closingCountry = selectCountryEl?.value || inputs.country || 'CA';
    const closingRegion = selectRegionEl?.value || inputs.province || 'ON';
    const isFirstTime = !!chkFirstTimeEl?.checked;
    const isSecondHome = !!chkAddlPropEl?.checked;

    const closingTaxRes = calculateClosingTax(
      inputs.homePrice,
      closingCountry,
      closingRegion,
      isFirstTime,
      isSecondHome
    );

    const grossTax = closingTaxRes.taxAmount + (closingTaxRes.rebateOrRelief || 0);
    const grossEl = document.getElementById('stat-closing-tax-gross');
    if (grossEl) grossEl.textContent = formatCurrency(grossTax, closingCountry);

    const rebateEl = document.getElementById('stat-closing-rebate');
    if (rebateEl) rebateEl.textContent = `-${formatCurrency(closingTaxRes.rebateOrRelief || 0, closingCountry)}`;

    const netTaxEl = document.getElementById('stat-closing-tax-net');
    if (netTaxEl) netTaxEl.textContent = formatCurrency(closingTaxRes.taxAmount, closingCountry);

    // 13. AI Financial Copilot Insights
    const insights = runFinancialCopilot(inputs, strategy);
    this.renderCopilotInsights(insights);

    // 14. Milestone Highway
    const milestones = calculateMilestones(strategy.schedule, inputs.homePrice, principalFinanced);
    this.renderMilestones(milestones);

    // 15. Multi-Debt Cascade Stack
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

    // 16. Annual Cash Flow Breakdown
    if (this.annualCashFlow) {
      this.annualCashFlow.render({
        container: document.getElementById('annual-cash-flow-container')!,
        schedule: strategy.schedule,
        usePiti: inputs.includeEscrow !== false,
        country: inputs.country
      });
    }

    // 17. Cumulative Outflow Stacked Area
    if (this.cumulativeOutflow) {
      this.cumulativeOutflow.render({
        container: document.getElementById('cumulative-outflow-container')!,
        schedule: strategy.schedule,
        usePiti: inputs.includeEscrow !== false,
        country: inputs.country
      });
    }

    // 18. Home Equity Build-up & LTV Decay Curve
    if (this.equityLtv) {
      this.equityLtv.render({
        container: document.getElementById('equity-ltv-container')!,
        schedule: strategy.schedule,
        homePrice: inputs.homePrice,
        country: inputs.country
      });
    }

    // 19. Full Amortization Ledger Table
    if (this.ledgerTable) {
      this.ledgerTable.render(strategy.schedule, inputs.termYears, inputs.country);
    }

    // 20. Goal Solver calculation
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

    // PITI Escrow Inputs
    const chkPiti = document.getElementById('chk-use-piti') as HTMLInputElement | null;
    if (chkPiti) chkPiti.checked = inputs.includeEscrow !== false;
    setVal('input-tax-rate', inputs.propertyTaxAnnual || 4200);
    setVal('input-ins-rate', inputs.homeInsuranceAnnual || 1200);
    setVal('input-hoa-rate', inputs.hoaMonthly || 0);
    setVal('input-pmi-rate', inputs.pmiRate || 0.5);

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
      this.syncModeUi(state.currentMode);
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

    // 2. Debt Mode Switching
    const modeTabs = document.querySelectorAll('.mode-tab-btn');
    modeTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const mode = (e.currentTarget as HTMLElement).getAttribute('data-mode') as DebtMode;
        if (mode) this.store.setMode(mode);
      });
    });

    // 3. Modals and Palettes
    document.getElementById('btn-sandbox-profiles')?.addEventListener('click', () => this.sandboxModal.open());
    document.getElementById('btn-future-lump-sums')?.addEventListener('click', () => this.lumpSumsModal.open());
    document.getElementById('btn-command-palette')?.addEventListener('click', () => this.commandPalette.toggle());
    document.getElementById('btn-qr-handoff')?.addEventListener('click', () => this.qrModal.open(this.store.getInputs()));
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => this.store.toggleTheme());

    // 4. Panel Toggles
    document.getElementById('toggle-pane-left')?.addEventListener('click', () => this.store.toggleLeftPane());
    document.getElementById('toggle-pane-right')?.addEventListener('click', () => this.store.toggleRightPane());
    document.getElementById('btn-restore-pane-left')?.addEventListener('click', () => this.store.toggleLeftPane());
    document.getElementById('btn-restore-pane-right')?.addEventListener('click', () => this.store.toggleRightPane());
    document.getElementById('btn-header-toggle-left')?.addEventListener('click', () => this.store.toggleLeftPane());
    document.getElementById('btn-header-toggle-right')?.addEventListener('click', () => this.store.toggleRightPane());

    // 5. Form Change Listeners (Zero main-thread lag)
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
    bindInput('input-amortization', 'amortizationYears', parseFloat);
    bindInput('input-term', 'termYears', parseFloat);
    bindInput('select-compounding', 'compounding', (v) => v as any);
    bindInput('select-frequency', 'frequency', (v) => v as any);
    bindInput('input-start-date', 'startDate', (v) => v);
    bindInput('input-offset-balance', 'offsetBalance', parseFloat);
    bindInput('input-offset-monthly', 'offsetMonthlyDeposit', parseFloat);

    // PITI Escrow Listeners
    document.getElementById('chk-use-piti')?.addEventListener('change', (e) => {
      this.store.updateInputs({ includeEscrow: (e.target as HTMLInputElement).checked });
    });
    bindInput('input-tax-rate', 'propertyTaxAnnual', parseFloat);
    bindInput('input-ins-rate', 'homeInsuranceAnnual', parseFloat);
    bindInput('input-hoa-rate', 'hoaMonthly', parseFloat);
    bindInput('input-pmi-rate', 'pmiRate', parseFloat);

    // Closing Tax Matrix triggers
    const triggerClosingTaxRecalc = () => this.recalculate();
    document.getElementById('select-closing-country')?.addEventListener('change', (e) => {
      const country = (e.target as HTMLSelectElement).value;
      const regSelect = document.getElementById('select-closing-region') as HTMLSelectElement | null;
      if (regSelect) {
        if (country === 'UK') {
          regSelect.innerHTML = `<option value="ENG">England / NI (HMRC)</option><option value="SCO">Scotland (LBTT)</option><option value="WAL">Wales (LTT)</option>`;
        } else if (country === 'AU') {
          regSelect.innerHTML = `<option value="NSW">New South Wales (NSW)</option><option value="VIC">Victoria (VIC)</option><option value="QLD">Queensland (QLD)</option><option value="WA">Western Australia (WA)</option><option value="SA">South Australia (SA)</option>`;
        } else if (country === 'US') {
          regSelect.innerHTML = `<option value="US-GEN">Standard Closing Recording Fee</option>`;
        } else {
          regSelect.innerHTML = `<option value="ON">Ontario (General PLTT)</option><option value="ON-TORONTO">City of Toronto (PLTT + MLTT)</option><option value="BC">British Columbia (PTT)</option><option value="AB">Alberta (Bill 20 Title Levy)</option><option value="QC">Quebec (Welcome Tax)</option>`;
        }
      }
      triggerClosingTaxRecalc();
    });
    document.getElementById('select-closing-region')?.addEventListener('change', triggerClosingTaxRecalc);
    document.getElementById('chk-first-time-buyer')?.addEventListener('change', triggerClosingTaxRecalc);
    document.getElementById('chk-additional-property')?.addEventListener('change', triggerClosingTaxRecalc);

    // Credit Card Mode Listeners
    document.getElementById('input-cc-balance')?.addEventListener('input', (e) => {
      const bal = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.store.updateInputs({ homePrice: bal, downPayment: 0 });
    });
    document.getElementById('input-cc-rate')?.addEventListener('input', (e) => {
      const rate = parseFloat((e.target as HTMLInputElement).value) || 19.99;
      this.store.updateInputs({ annualRate: rate });
    });

    // Personal Loan Mode Listeners
    document.getElementById('input-loan-amount')?.addEventListener('input', (e) => {
      const amt = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.store.updateInputs({ homePrice: amt, downPayment: 0 });
    });

    // Cascade Strategy Buttons
    const cascadeBtns = document.querySelectorAll('.cascade-strat-btn');
    cascadeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        cascadeBtns.forEach((b) => b.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');
        const strat = (e.currentTarget as HTMLElement).getAttribute('data-strat') as any;
        if (strat) this.store.updateInputs({ cascadeStrategy: strat });
      });
    });

    // Down payment slider sync
    const sliderDown = document.getElementById('slider-down-payment');
    sliderDown?.addEventListener('input', (e) => {
      const pct = parseFloat((e.target as HTMLInputElement).value) / 100;
      const homePrice = this.store.getInputs().homePrice;
      const down = Math.round(homePrice * pct);
      this.store.updateInputs({ downPayment: down });
    });

    // 6. Stage 1 (Pulse) Dials
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

    // 7. Strategy Lab Sliders
    bindInput('slider-extra-monthly', 'extraPayment', parseFloat);
    bindInput('slider-lump-sum', 'lumpSum', parseFloat);
    bindInput('slider-invest-rate', 'investRate', parseFloat);

    // 8. Macro Scenario Presets
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

    // 9. Goal Solver Apply Button
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

    // 10. Mobile Bottom Dock
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

  private syncModeUi(mode: DebtMode = 'mortgage') {
    const modeTabs = document.querySelectorAll('.mode-tab-btn');
    modeTabs.forEach((tab) => {
      const m = tab.getAttribute('data-mode');
      if (m === mode) tab.classList.add('active');
      else tab.classList.remove('active');
    });

    const paneMtg = document.getElementById('pane-mortgage-controls');
    const paneCc = document.getElementById('pane-cc-controls');
    const paneLoan = document.getElementById('pane-loan-controls');

    if (paneMtg) paneMtg.style.display = (mode === 'mortgage' || mode === 'portfolio') ? 'block' : 'none';
    if (paneCc) paneCc.style.display = mode === 'cc' ? 'block' : 'none';
    if (paneLoan) paneLoan.style.display = mode === 'loan' ? 'block' : 'none';
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
