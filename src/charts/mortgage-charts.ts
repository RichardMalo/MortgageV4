/**
 * TrueMortgage — Interactive Multi-Graph Carousel
 *
 * Slides are declared in index.html (`.chart-slide[data-chart]`) and resolved through a
 * small registry, so adding a chart means adding one slide + one definition:
 *
 *  Progress
 *   - balance     Balance over time (plan vs baseline, interactive scrubbing)
 *   - kept        Money Kept race (cumulative interest gap)            → insight-charts.ts
 *   - tipping     Interest vs principal tipping point                  → insight-charts.ts
 *  Decide
 *   - extra       Extra-payment sensitivity curve (click to apply)     → insight-charts.ts
 *   - strategies  Strategy leaderboard (click to apply)                → insight-charts.ts
 *   - waiting     Cost of waiting                                      → insight-charts.ts
 *  Breakdown
 *   - lifetime    Lifetime breakdown (stacked bar: Interest, Principal, Extra)
 *   - cashflow    Annual cash flow (stacked bars per calendar year)
 *
 * Supports:
 *  - Effortless side-to-side touch swiping on mobile (in-place scroll snap)
 *  - Elegant tab switching and next/prev toggling on PC/Mac
 *  - Enlarge/Shrink full-view button (+)
 *  - Rich interactive tooltips, hover highlights and a one-line takeaway caption per chart
 */

import { Analysis, MortgageInputs } from '../core/types.js';
import { formatDuration, formatMoney, formatMonthYear } from '../core/format.js';
import { REGIONS } from '../core/regions.js';
import {
  ChartPadding,
  formatCompactMoney,
  getNiceTicks,
  getThemeColors,
  initHiDpiCanvas
} from './chart-utils.js';
import { ApplyAction, INSIGHT_CHARTS, InsightChart, InsightData, computeInsights } from './insight-charts.js';

// Re-exported for backwards compatibility (tests and other modules import them from here).
export {
  formatCompactMoney,
  getNiceTicks,
  getThemeColors,
  initHiDpiCanvas
} from './chart-utils.js';
export type { ChartThemeColors } from './chart-utils.js';

type BuiltInChartId = 'balance' | 'lifetime' | 'cashflow';

interface SlideDef {
  id: string;
  title: string;
  /** Present for registry-driven insight charts; built-in charts use dedicated methods. */
  insight?: InsightChart;
  canvas: HTMLCanvasElement;
}

export interface ChartsManagerOptions {
  /** Called when the user clicks a chart point that maps to a plan change. */
  onApply?: (action: ApplyAction) => void;
}

export class MortgageChartsManager {
  private card: HTMLElement;
  private viewport: HTMLElement;
  private titleEl: HTMLElement;
  private captionEl: HTMLElement | null;
  private expandBtn: HTMLButtonElement;
  private tabsEl: HTMLElement | null;
  private tabs: HTMLButtonElement[] = [];
  private dots: HTMLButtonElement[] = [];
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;

  // Canvases (built-in charts)
  private canvasBalance: HTMLCanvasElement;
  private canvasLifetime: HTMLCanvasElement;
  private canvasCashFlow: HTMLCanvasElement;

  // Slide registry, in DOM order
  private slides: SlideDef[] = [];

  // Floating Tooltip
  private tooltipEl: HTMLElement;

  // State
  private activeIndex = 0;
  private isExpanded = false;
  private currentAnalysis: Analysis | null = null;
  private insightData: InsightData | null = null;
  private hasLoan = false;
  private resizeObserver: ResizeObserver | null = null;
  private isProgrammaticScrolling = false;
  private scrollDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly options: ChartsManagerOptions;

  // Hover states
  private hoverBalancePeriod: number | null = null;
  private hoverLifetimeSegment: 'interest' | 'principal' | 'extra' | null = null;
  private hoverCashFlowYearIdx: number | null = null;
  private insightHover: Record<string, number | null> = {};

  constructor(options: ChartsManagerOptions = {}) {
    this.options = options;
    this.card = document.getElementById('chart-card') as HTMLElement;
    this.viewport = document.getElementById('chart-carousel-viewport') as HTMLElement;
    this.titleEl = document.getElementById('chart-active-title') as HTMLElement;
    this.captionEl = document.getElementById('chart-caption');
    this.expandBtn = document.getElementById('chart-expand-btn') as HTMLButtonElement;
    this.prevBtn = document.getElementById('chart-prev-btn') as HTMLButtonElement | null;
    this.nextBtn = document.getElementById('chart-next-btn') as HTMLButtonElement | null;
    this.tabsEl = this.card.querySelector<HTMLElement>('.chart-tabs');

    this.tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.chart-tab-btn'));
    this.dots = Array.from(document.querySelectorAll<HTMLButtonElement>('.chart-dot'));

    // Create canvases inside containers
    this.canvasBalance = this.setupCanvas('chart-balance');
    this.canvasLifetime = this.setupCanvas('chart-lifetime');
    this.canvasCashFlow = this.setupCanvas('chart-cashflow');

    // Build the slide registry from the DOM (order = carousel order)
    const builtIn: Record<BuiltInChartId, HTMLCanvasElement> = {
      balance: this.canvasBalance,
      lifetime: this.canvasLifetime,
      cashflow: this.canvasCashFlow
    };
    this.slides = Array.from(this.viewport.querySelectorAll<HTMLElement>('.chart-slide')).map((el) => {
      const id = el.dataset.chart || '';
      const title = el.dataset.title || 'Mortgage chart';
      const insight = INSIGHT_CHARTS[id];
      if (insight) {
        this.insightHover[id] = null;
        return { id, title, insight, canvas: this.setupCanvas(`chart-${id}`) };
      }
      const canvas = builtIn[id as BuiltInChartId];
      if (!canvas) throw new Error(`Unknown chart slide "${id}".`);
      return { id, title, canvas };
    });

    // Create floating tooltip element
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'chart-floating-tooltip';
    this.tooltipEl.setAttribute('aria-hidden', 'true');
    this.tooltipEl.hidden = true;
    this.card.appendChild(this.tooltipEl);

    this.bindEvents();
  }

  private get slideCount(): number {
    return Math.max(1, this.slides.length);
  }

  private setupCanvas(containerId: string): HTMLCanvasElement {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container #${containerId} not found in DOM.`);
    }
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'chart-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    return canvas;
  }

  public render(analysis: Analysis, hasLoan: boolean) {
    this.currentAnalysis = analysis;
    this.hasLoan = hasLoan;
    this.insightData = hasLoan ? computeInsights(analysis) : null;

    // Toggle baseline legend visibility on the balance slide
    const baselineLegend = document.getElementById('legend-baseline');
    if (baselineLegend) {
      baselineLegend.hidden = !analysis.hasStrategy;
    }
    const keptLegend = document.getElementById('legend-kept-baseline');
    if (keptLegend) keptLegend.hidden = !analysis.hasStrategy;
    const tippingLegend = document.getElementById('legend-tipping-baseline');
    if (tippingLegend) tippingLegend.hidden = !analysis.hasStrategy;

    this.drawAll();
    this.updateCaption();
  }

  public drawAll() {
    this.drawBalanceChart();
    this.drawLifetimeChart();
    this.drawCashFlowChart();
    this.slides.forEach((s) => s.insight && this.drawInsight(s));
  }

  private getDimensions(
    canvas: HTMLCanvasElement,
    defaultHeight = 250,
    padding: ChartPadding = { top: 20, right: 20, bottom: 38, left: 62 },
    expandedHeight = 420
  ) {
    const rect = canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(260, rect?.width || this.viewport.clientWidth || 320);
    const height = this.isExpanded ? expandedHeight : defaultHeight;
    const plotWidth = Math.max(10, width - padding.left - padding.right);
    const plotHeight = Math.max(10, height - padding.top - padding.bottom);

    return { width, height, padding, plotWidth, plotHeight };
  }

  // =========================================================================
  // Registry-driven insight charts (see insight-charts.ts)
  // =========================================================================
  private insightDims(slide: SlideDef) {
    const chart = slide.insight!;
    return this.getDimensions(slide.canvas, chart.height, chart.padding, chart.expandedHeight);
  }

  private drawInsight(slide: SlideDef) {
    const chart = slide.insight!;
    const dims = this.insightDims(slide);
    const ctx = initHiDpiCanvas(slide.canvas, dims.width, dims.height);
    if (!ctx) return;
    ctx.clearRect(0, 0, dims.width, dims.height);

    const container = slide.canvas.parentElement;
    if (!this.hasLoan || !this.currentAnalysis || !this.insightData) {
      container?.classList.remove('clickable');
      this.drawEmptyState(ctx, dims, 'Enter a loan to see this chart.');
      return;
    }
    const hoverIdx = this.insightHover[chart.id] ?? null;
    const isActionable =
      chart.isClickable(this.currentAnalysis, this.insightData) &&
      (!chart.apply || hoverIdx === null || chart.apply(hoverIdx, this.currentAnalysis, this.insightData) !== null);
    container?.classList.toggle('clickable', isActionable);
    chart.draw({
      ctx,
      dims,
      a: this.currentAnalysis,
      d: this.insightData,
      colors: getThemeColors(),
      hover: hoverIdx
    });
  }

  private bindInsightInteractivity(slide: SlideDef) {
    const chart = slide.insight!;
    const canvas = slide.canvas;
    const locate = (clientX: number, clientY: number) => {
      if (!this.hasLoan || !this.currentAnalysis || !this.insightData) return null;
      const rect = canvas.getBoundingClientRect();
      return chart.hit(clientX - rect.left, clientY - rect.top, this.insightDims(slide), this.currentAnalysis, this.insightData);
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (this.slides[this.activeIndex] !== slide) return;
      const idx = locate(clientX, clientY);
      if (idx === this.insightHover[chart.id] && idx !== null) {
        this.showTooltip(clientX, clientY, this.tooltipEl.innerHTML);
        return;
      }
      this.insightHover[chart.id] = idx;
      this.drawInsight(slide);
      if (idx === null) {
        this.tooltipEl.hidden = true;
        return;
      }
      this.showTooltip(clientX, clientY, chart.tooltip(idx, this.currentAnalysis!, this.insightData!));
    };

    const clear = () => {
      this.insightHover[chart.id] = null;
      this.tooltipEl.hidden = true;
      this.drawInsight(slide);
    };

    canvas.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    canvas.addEventListener('mouseleave', clear);
    canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    canvas.addEventListener('touchend', () => setTimeout(clear, 1500));

    canvas.addEventListener('click', (e) => {
      if (!chart.apply || !this.currentAnalysis || !this.insightData) return;
      if (!chart.isClickable(this.currentAnalysis, this.insightData)) return;
      const idx = locate(e.clientX, e.clientY);
      if (idx === null) return;
      const action = chart.apply(idx, this.currentAnalysis, this.insightData);
      if (action) {
        this.hideTooltip();
        this.options.onApply?.(action);
      }
    });
  }

  // =========================================================================
  // Captions — one takeaway sentence under the active chart
  // =========================================================================
  private updateCaption() {
    if (!this.captionEl) return;
    const slide = this.slides[this.activeIndex];
    const a = this.currentAnalysis;
    if (!slide || !a || !this.hasLoan) {
      this.captionEl.innerHTML = '';
      this.captionEl.hidden = true;
      return;
    }
    let html = '';
    if (slide.insight && this.insightData) {
      html = slide.insight.caption(a, this.insightData);
    } else {
      html = this.builtInCaption(slide.id as BuiltInChartId, a);
    }
    this.captionEl.innerHTML = html;
    this.captionEl.hidden = !html;
  }

  private builtInCaption(id: BuiltInChartId, a: Analysis): string {
    const c = a.inputs.country;
    const strong = (s: string) => `<strong>${s}</strong>`;
    if (id === 'balance') {
      const when = formatMonthYear(a.plan.payoffDate, c);
      if (a.hasStrategy && a.monthsSaved > 0) {
        return `You'll be mortgage-free in ${strong(when)} — ${strong(
          formatDuration(a.monthsSaved)
        )} sooner than paying monthly with no extras.`;
      }
      return `On this plan you'll be mortgage-free in ${strong(when)}. Open the ${strong('Decide')} charts to find a faster path.`;
    }
    if (id === 'lifetime') {
      const perDollar = a.loanAmount > 0 ? (a.loanAmount + a.plan.totalInterest) / a.loanAmount : 0;
      return `For every ${formatMoney(1, c)} you borrow, you'll repay ${strong(formatMoney(perDollar, c, true))} in total.${
        a.interestSaved >= 1 ? ` Your extras already cut ${strong(formatMoney(a.interestSaved, c))} of interest.` : ''
      }`;
    }
    const first = a.years[0];
    if (!first) return '';
    const share = (y: { interest: number; principal: number; extra: number }) =>
      Math.round((y.interest / Math.max(1, y.interest + y.principal + y.extra)) * 100);
    const later = a.years[Math.min(a.years.length - 1, 9)];
    return later && later !== first
      ? `In year 1, ${strong(`${share(first)}%`)} of what you pay goes to interest; by year ${later.year} it's ${strong(
          `${share(later)}%`
        )}.`
      : `In year 1, ${strong(`${share(first)}%`)} of what you pay goes to interest.`;
  }

  // =========================================================================
  // 1. Balance Over Time Chart
  // =========================================================================
  private drawBalanceChart() {
    const dims = this.getDimensions(this.canvasBalance, 240);
    const ctx = initHiDpiCanvas(this.canvasBalance, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    if (!this.hasLoan || !this.currentAnalysis) {
      this.drawEmptyState(ctx, dims, 'No balance to chart.');
      return;
    }

    const a = this.currentAnalysis;
    const colors = getThemeColors();
    const maxYears = Math.max(
      a.baseline.numPayments / 12,
      a.plan.numPayments / a.plan.periodsPerYear,
      1
    );
    const maxY = Math.max(a.loanAmount, 1);

    const getX = (years: number) =>
      dims.padding.left + (years / maxYears) * dims.plotWidth;
    const getY = (bal: number) =>
      dims.padding.top + dims.plotHeight - (bal / maxY) * dims.plotHeight;

    // Grid lines & Y ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    yTicks.forEach((v) => {
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = colors.mutedColor;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatCompactMoney(v, a.inputs.country), dims.padding.left - 8, y + 4);
    });
    ctx.setLineDash([]);

    // X-axis ticks
    const xStep = maxYears <= 10 ? 1 : maxYears <= 20 ? 2 : 5;
    ctx.fillStyle = colors.mutedColor;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';

    for (let t = 0; t <= maxYears + 1e-9; t += xStep) {
      const x = getX(t);
      ctx.fillText(t === 0 ? 'Now' : `${t}y`, x, dims.padding.top + dims.plotHeight + 20);
    }

    // Baseline polyline (if strategy active)
    if (a.hasStrategy && a.baseline.rows.length > 0) {
      ctx.strokeStyle = colors.baselineColor;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(a.loanAmount));
      a.baseline.rows.forEach((r) => {
        const yr = r.n / a.baseline.periodsPerYear;
        ctx.lineTo(getX(yr), getY(r.balance));
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Plan Area Fill
    if (a.plan.rows.length > 0) {
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(a.loanAmount));
      a.plan.rows.forEach((r) => {
        const yr = r.n / a.plan.periodsPerYear;
        ctx.lineTo(getX(yr), getY(r.balance));
      });
      const lastRow = a.plan.rows[a.plan.rows.length - 1]!;
      const lastYr = lastRow.n / a.plan.periodsPerYear;
      ctx.lineTo(getX(lastYr), dims.padding.top + dims.plotHeight);
      ctx.lineTo(getX(0), dims.padding.top + dims.plotHeight);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(
        0,
        dims.padding.top,
        0,
        dims.padding.top + dims.plotHeight
      );
      gradient.addColorStop(0, colors.accentSoft);
      gradient.addColorStop(1, 'rgba(37, 99, 235, 0.01)');
      ctx.fillStyle = gradient;
      ctx.fill();

      // Plan Solid Stroke
      ctx.beginPath();
      ctx.strokeStyle = colors.accentColor;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.moveTo(getX(0), getY(a.loanAmount));
      a.plan.rows.forEach((r) => {
        const yr = r.n / a.plan.periodsPerYear;
        ctx.lineTo(getX(yr), getY(r.balance));
      });
      ctx.stroke();
    }

    // Interactive Hover indicator
    if (this.hoverBalancePeriod !== null && a.plan.rows.length > 0) {
      const targetIdx = Math.max(
        0,
        Math.min(a.plan.rows.length - 1, this.hoverBalancePeriod - 1)
      );
      const planRow = a.plan.rows[targetIdx]!;
      const planYr = planRow.n / a.plan.periodsPerYear;
      const hX = getX(planYr);
      const hYPlan = getY(planRow.balance);

      // Vertical guide line
      ctx.strokeStyle = colors.isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hX, dims.padding.top);
      ctx.lineTo(hX, dims.padding.top + dims.plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Baseline dot if strategy
      if (a.hasStrategy && a.baseline.rows.length > 0) {
        const baseIdx = Math.min(
          a.baseline.rows.length - 1,
          Math.round((planRow.n / a.plan.periodsPerYear) * a.baseline.periodsPerYear) - 1
        );
        if (baseIdx >= 0 && a.baseline.rows[baseIdx]) {
          const baseRow = a.baseline.rows[baseIdx]!;
          const hYBase = getY(baseRow.balance);
          ctx.fillStyle = colors.baselineColor;
          ctx.beginPath();
          ctx.arc(hX, hYBase, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Highlight dot on plan
      ctx.fillStyle = colors.accentColor;
      ctx.beginPath();
      ctx.arc(hX, hYPlan, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.cardBg;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // =========================================================================
  // 2. Lifetime Breakdown Chart (Matches screenshot)
  // =========================================================================
  private drawLifetimeChart() {
    const dims = this.getDimensions(this.canvasLifetime, 240);
    const ctx = initHiDpiCanvas(this.canvasLifetime, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    if (!this.hasLoan || !this.currentAnalysis) {
      this.drawEmptyState(ctx, dims, 'No loan data to breakdown.');
      return;
    }

    const a = this.currentAnalysis;
    const colors = getThemeColors();

    const totalInterest = Math.max(0, a.plan.totalInterest);
    const totalExtra = a.plan.rows.reduce((sum, r) => sum + (r.extra || 0), 0);
    const regularPrincipal = Math.max(0, a.loanAmount - totalExtra);
    const totalCost = regularPrincipal + totalExtra + totalInterest;

    const niceTicks = getNiceTicks(Math.max(totalCost, 1), 5);
    const maxY = niceTicks[niceTicks.length - 1]!;

    const getY = (val: number) =>
      dims.padding.top + dims.plotHeight - (val / maxY) * dims.plotHeight;

    // Grid lines & Y ticks
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    niceTicks.forEach((v) => {
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = colors.mutedColor;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      // Format with commas if wide enough, compact otherwise
      const label =
        dims.width > 420
          ? formatMoney(v, a.inputs.country, false)
          : formatCompactMoney(v, a.inputs.country);
      ctx.fillText(label, dims.padding.left - 8, y + 4);
    });
    ctx.setLineDash([]);

    // X-Axis Label "Total Cost" (matching user screenshot)
    const centerX = dims.padding.left + dims.plotWidth / 2;
    ctx.fillStyle = colors.textColor;
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Total Cost', centerX, dims.padding.top + dims.plotHeight + 24);

    // Bar dimensions
    const barWidth = Math.min(180, Math.max(80, dims.plotWidth * 0.42));
    const barX = centerX - barWidth / 2;

    // Stacked segments:
    // Bottom: Interest (coral red)
    // Middle: Principal (blue)
    // Top: Extra (emerald green)
    let currentStackY = dims.padding.top + dims.plotHeight;

    const drawSegment = (
      amount: number,
      baseColor: string,
      hoverColor: string,
      segKey: 'interest' | 'principal' | 'extra',
      isTop: boolean
    ) => {
      if (amount <= 0) return;
      const segH = (amount / maxY) * dims.plotHeight;
      currentStackY -= segH;

      const isHovered = this.hoverLifetimeSegment === segKey;
      ctx.fillStyle = isHovered ? hoverColor : baseColor;

      ctx.beginPath();
      if (isTop) {
        ctx.roundRect(barX, currentStackY, barWidth, segH, [4, 4, 0, 0]);
      } else {
        ctx.rect(barX, currentStackY, barWidth, segH);
      }
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = colors.isDark ? '#ffffff' : '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    // 1. Bottom: Interest
    drawSegment(
      totalInterest,
      colors.interestColor,
      colors.interestHover,
      'interest',
      regularPrincipal <= 0 && totalExtra <= 0
    );

    // 2. Middle: Principal
    drawSegment(
      regularPrincipal,
      colors.principalColor,
      colors.principalHover,
      'principal',
      totalExtra <= 0
    );

    // 3. Top: Extra
    if (totalExtra > 0) {
      drawSegment(totalExtra, colors.extraColor, colors.extraHover, 'extra', true);
    }
  }

  // =========================================================================
  // 3. Annual Cash Flow Chart (Matches screenshot)
  // =========================================================================
  private drawCashFlowChart() {
    const dims = this.getDimensions(this.canvasCashFlow, 240);
    const ctx = initHiDpiCanvas(this.canvasCashFlow, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    if (!this.hasLoan || !this.currentAnalysis || aHasNoYears(this.currentAnalysis)) {
      this.drawEmptyState(ctx, dims, 'No cash flow to chart.');
      return;
    }

    const a = this.currentAnalysis;
    const colors = getThemeColors();
    const years = a.years;

    const maxYearTotal = Math.max(
      ...years.map((y) => (y.interest || 0) + (y.principal || 0) + (y.extra || 0)),
      1
    );

    const niceTicks = getNiceTicks(maxYearTotal, 5);
    const maxY = niceTicks[niceTicks.length - 1]!;

    const getY = (val: number) =>
      dims.padding.top + dims.plotHeight - (val / maxY) * dims.plotHeight;

    // Grid lines & Y ticks
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    niceTicks.forEach((v) => {
      const y = getY(v);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = colors.mutedColor;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      const label =
        dims.width > 420
          ? formatMoney(v, a.inputs.country, false)
          : formatCompactMoney(v, a.inputs.country);
      ctx.fillText(label, dims.padding.left - 8, y + 4);
    });
    ctx.setLineDash([]);

    // X-Axis Title "Year" (matching screenshot)
    ctx.fillStyle = colors.textColor;
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Year',
      dims.padding.left + dims.plotWidth / 2,
      dims.padding.top + dims.plotHeight + 32
    );

    // Bars
    const slotWidth = dims.plotWidth / years.length;
    const barWidth = Math.max(4, Math.min(26, slotWidth * 0.72));

    years.forEach((yr, idx) => {
      const centerX = dims.padding.left + idx * slotWidth + slotWidth / 2;
      const barX = centerX - barWidth / 2;
      const isHovered = idx === this.hoverCashFlowYearIdx;

      // Highlight column background for hovered year
      if (isHovered) {
        ctx.fillStyle = colors.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(37, 99, 235, 0.06)';
        ctx.fillRect(
          centerX - slotWidth / 2,
          dims.padding.top,
          slotWidth,
          dims.plotHeight
        );
      }

      let currentStackY = dims.padding.top + dims.plotHeight;

      const drawSegment = (
        amount: number,
        baseColor: string,
        hoverColor: string,
        isTop: boolean
      ) => {
        if (amount <= 0) return;
        const segH = (amount / maxY) * dims.plotHeight;
        currentStackY -= segH;

        ctx.fillStyle = isHovered ? hoverColor : baseColor;
        ctx.beginPath();
        if (isTop) {
          ctx.roundRect(barX, currentStackY, barWidth, segH, [2, 2, 0, 0]);
        } else {
          ctx.rect(barX, currentStackY, barWidth, segH);
        }
        ctx.fill();
      };

      // 1. Bottom: Interest (red)
      drawSegment(
        yr.interest,
        colors.interestColor,
        colors.interestHover,
        yr.principal <= 0 && yr.extra <= 0
      );

      // 2. Middle: Principal (blue)
      drawSegment(yr.principal, colors.principalColor, colors.principalHover, yr.extra <= 0);

      // 3. Top: Extra (green)
      if (yr.extra > 0) {
        drawSegment(yr.extra, colors.extraColor, colors.extraHover, true);
      }

      // X-Axis Year Labels
      const calYear = yr.endDate.getFullYear();
      const yrText = dims.width < 480 ? `'${String(calYear).slice(-2)}` : String(calYear);
      const step = years.length > 20 ? 5 : years.length > 10 ? 2 : 1;
      if (idx % step === 0 || idx === years.length - 1) {
        ctx.fillStyle = isHovered ? colors.textColor : colors.mutedColor;
        ctx.font = isHovered
          ? 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          : '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(yrText, centerX, dims.padding.top + dims.plotHeight + 16);
      }
    });
  }

  private drawEmptyState(
    ctx: CanvasRenderingContext2D,
    dims: { width: number; height: number },
    message: string
  ) {
    const colors = getThemeColors();
    ctx.fillStyle = colors.mutedColor;
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, dims.width / 2, dims.height / 2);
  }

  // =========================================================================
  // Carousel Navigation & Touch Swipe Handling
  // =========================================================================
  public setActiveIndex(index: number, scrollViewport = true) {
    const bounded = Math.max(0, Math.min(this.slideCount - 1, index));
    if (this.activeIndex === bounded && !scrollViewport) return;
    this.activeIndex = bounded;

    const currentSlide = this.slides[this.activeIndex];

    // Update Title
    if (this.titleEl && currentSlide) {
      this.titleEl.textContent = currentSlide.title || 'Mortgage Chart';
    }

    // Update Tabs
    this.tabs.forEach((tab) => {
      const idx = parseInt(tab.dataset.tab || '0', 10);
      const active = idx === this.activeIndex;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      if (active && this.tabsEl && this.tabsEl.scrollWidth > this.tabsEl.clientWidth) {
        const targetScroll = tab.offsetLeft - this.tabsEl.clientWidth / 2 + tab.offsetWidth / 2;
        this.tabsEl.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
      }
    });

    // Update Dots
    this.dots.forEach((dot) => {
      const idx = parseInt(dot.dataset.dot || '0', 10);
      const active = idx === this.activeIndex;
      dot.classList.toggle('active', active);
      dot.setAttribute('aria-current', active ? 'true' : 'false');
    });

    // Hide tooltip when changing slide
    this.hideTooltip();
    this.updateCaption();

    // Scroll viewport smoothly if requested
    if (scrollViewport && this.viewport) {
      this.isProgrammaticScrolling = true;
      const targetLeft = this.activeIndex * this.viewport.clientWidth;
      this.viewport.scrollTo({ left: targetLeft, behavior: 'smooth' });
      setTimeout(() => {
        this.isProgrammaticScrolling = false;
      }, 350);
    }

    // Redraw active slide for pixel perfection
    requestAnimationFrame(() => {
      if (!currentSlide) return;
      if (currentSlide.id === 'balance') this.drawBalanceChart();
      else if (currentSlide.id === 'lifetime') this.drawLifetimeChart();
      else if (currentSlide.id === 'cashflow') this.drawCashFlowChart();
      else if (currentSlide.insight) this.drawInsight(currentSlide);
    });
  }

  public toggleExpand() {
    this.isExpanded = !this.isExpanded;
    this.card.classList.toggle('expanded', this.isExpanded);

    if (this.expandBtn) {
      this.expandBtn.innerHTML = this.isExpanded ? '&minus;' : '+';
      this.expandBtn.title = this.isExpanded ? 'Shrink chart' : 'Enlarge chart';
      this.expandBtn.setAttribute(
        'aria-label',
        this.isExpanded ? 'Shrink chart' : 'Enlarge chart'
      );
    }

    this.hideTooltip();
    setTimeout(() => {
      this.drawAll();
      // Keep viewport aligned with current slide
      const targetLeft = this.activeIndex * this.viewport.clientWidth;
      this.viewport.scrollLeft = targetLeft;
    }, 150);
  }

  // =========================================================================
  // Tooltips & Interactivity
  // =========================================================================
  private showTooltip(clientX: number, clientY: number, htmlContent: string) {
    const cardRect = this.card.getBoundingClientRect();
    let x = clientX - cardRect.left;
    let y = clientY - cardRect.top - 12;

    this.tooltipEl.innerHTML = htmlContent;
    this.tooltipEl.hidden = false;

    const tipW = this.tooltipEl.offsetWidth || 180;
    const tipH = this.tooltipEl.offsetHeight || 80;

    // Boundary clamping
    if (x + tipW / 2 > cardRect.width - 12) {
      x = cardRect.width - tipW / 2 - 12;
    } else if (x - tipW / 2 < 12) {
      x = tipW / 2 + 12;
    }

    if (y - tipH < 10) {
      y = clientY - cardRect.top + 24; // show below cursor if too high
    } else {
      y = y - tipH;
    }

    this.tooltipEl.style.left = `${Math.round(x)}px`;
    this.tooltipEl.style.top = `${Math.round(y)}px`;
  }

  private hideTooltip() {
    this.tooltipEl.hidden = true;
    this.hoverBalancePeriod = null;
    this.hoverLifetimeSegment = null;
    this.hoverCashFlowYearIdx = null;
    Object.keys(this.insightHover).forEach((k) => (this.insightHover[k] = null));
  }

  // =========================================================================
  // Event Binding
  // =========================================================================
  private bindEvents() {
    // 1. Tab buttons
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const idx = parseInt(tab.dataset.tab || '0', 10);
        this.setActiveIndex(idx, true);
      });
    });

    // 2. Pagination dots
    this.dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.dataset.dot || '0', 10);
        this.setActiveIndex(idx, true);
      });
    });

    // 3. Prev / Next buttons
    this.prevBtn?.addEventListener('click', () => {
      const prev = this.activeIndex === 0 ? this.slideCount - 1 : this.activeIndex - 1;
      this.setActiveIndex(prev, true);
    });

    this.nextBtn?.addEventListener('click', () => {
      const next = this.activeIndex === this.slideCount - 1 ? 0 : this.activeIndex + 1;
      this.setActiveIndex(next, true);
    });

    // 4. Expand / Shrink (+) button
    this.expandBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleExpand();
    });

    // 5. Native Scroll / Snap Listener on Viewport
    this.viewport.addEventListener(
      'scroll',
      () => {
        if (this.isProgrammaticScrolling) return;
        clearTimeout(this.scrollDebounceTimer);
        this.scrollDebounceTimer = setTimeout(() => {
          const width = this.viewport.clientWidth;
          if (width > 0) {
            const idx = Math.round(this.viewport.scrollLeft / width);
            this.setActiveIndex(idx, false);
          }
        }, 60);
      },
      { passive: true }
    );

    // 6. Touch Swipe Detection
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    this.viewport.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
        }
      },
      { passive: true }
    );

    this.viewport.addEventListener(
      'touchend',
      (e) => {
        if (!e.changedTouches[0]) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const elapsed = Date.now() - touchStartTime;

        // If swipe was swift and predominantly horizontal
        if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 400) {
          if (deltaX < 0 && this.activeIndex < this.slideCount - 1) {
            this.setActiveIndex(this.activeIndex + 1, true);
          } else if (deltaX > 0 && this.activeIndex > 0) {
            this.setActiveIndex(this.activeIndex - 1, true);
          }
        }
      },
      { passive: true }
    );

    // 7. Keyboard Navigation (Left / Right Arrow)
    this.viewport.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' && this.activeIndex > 0) {
        e.preventDefault();
        this.setActiveIndex(this.activeIndex - 1, true);
      } else if (e.key === 'ArrowRight' && this.activeIndex < this.slideCount - 1) {
        e.preventDefault();
        this.setActiveIndex(this.activeIndex + 1, true);
      }
    });

    // 8. Interactive Canvas Hover / Touch Handlers
    this.bindBalanceInteractivity();
    this.bindLifetimeInteractivity();
    this.bindCashFlowInteractivity();
    this.slides.forEach((s) => s.insight && this.bindInsightInteractivity(s));

    // 9. ResizeObserver
    this.resizeObserver = new ResizeObserver(() => {
      this.drawAll();
      const targetLeft = this.activeIndex * this.viewport.clientWidth;
      this.viewport.scrollLeft = targetLeft;
    });
    this.resizeObserver.observe(this.viewport);

    // System theme change listener
    window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener('change', () => {
      if (!document.documentElement.getAttribute('data-theme')) {
        this.drawAll();
      }
    });

    // Hide tooltip on tap outside or window scroll
    window.addEventListener('scroll', () => this.hideTooltip(), { passive: true });
  }

  // =========================================================================
  // Canvas: Balance Over Time Interactivity
  // =========================================================================
  private bindBalanceInteractivity() {
    const handleMove = (clientX: number, clientY: number) => {
      if (!this.hasLoan || !this.currentAnalysis || this.slides[this.activeIndex]?.id !== 'balance') return;
      const a = this.currentAnalysis;
      const rect = this.canvasBalance.getBoundingClientRect();
      const x = clientX - rect.left;
      const dims = this.getDimensions(this.canvasBalance, 240);

      const relX = x - dims.padding.left;
      if (relX < 0 || relX > dims.plotWidth || a.plan.rows.length === 0) {
        this.hoverBalancePeriod = null;
        this.hideTooltip();
        this.drawBalanceChart();
        return;
      }

      const maxYears = Math.max(
        a.baseline.numPayments / 12,
        a.plan.numPayments / a.plan.periodsPerYear,
        1
      );
      const ratio = Math.max(0, Math.min(1, relX / dims.plotWidth));
      const targetYear = ratio * maxYears;
      const targetPeriod = Math.max(1, Math.round(targetYear * a.plan.periodsPerYear));

      this.hoverBalancePeriod = Math.min(a.plan.rows.length, targetPeriod);
      this.drawBalanceChart();

      const row = a.plan.rows[this.hoverBalancePeriod - 1];
      if (row) {
        const c = a.inputs.country;
        const locale = REGIONS[c]?.locale || 'en-CA';
        const dateStr = row.date.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
        const yr = Math.ceil(row.n / a.plan.periodsPerYear);

        let baselineHtml = '';
        if (a.hasStrategy && a.baseline.rows.length > 0) {
          const baseIdx = Math.min(
            a.baseline.rows.length - 1,
            Math.round((row.n / a.plan.periodsPerYear) * a.baseline.periodsPerYear) - 1
          );
          if (baseIdx >= 0 && a.baseline.rows[baseIdx]) {
            const bRow = a.baseline.rows[baseIdx]!;
            const diff = bRow.balance - row.balance;
            baselineHtml = `
              <div class="tip-row muted">
                <span>Baseline:</span> <strong>${formatMoney(bRow.balance, c)}</strong>
              </div>
              ${diff > 50 ? `<div class="tip-row good"><span>Ahead:</span> <strong>${formatMoney(diff, c)}</strong></div>` : ''}
            `;
          }
        }

        const html = `
          <div class="tip-header">${dateStr} · Year ${yr} <span class="tip-sub">#${row.n}</span></div>
          <div class="tip-row plan">
            <span>Balance:</span> <strong>${formatMoney(row.balance, c)}</strong>
          </div>
          ${baselineHtml}
          <div class="tip-divider"></div>
          <div class="tip-row muted"><span>Principal paid:</span> <strong>${formatMoney(row.principal + row.extra, c)}</strong></div>
          <div class="tip-row muted"><span>Interest paid:</span> <strong>${formatMoney(row.interest, c)}</strong></div>
        `;
        this.showTooltip(clientX, clientY, html);
      }
    };

    this.canvasBalance.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    this.canvasBalance.addEventListener('mouseleave', () => {
      this.hoverBalancePeriod = null;
      this.hideTooltip();
      this.drawBalanceChart();
    });

    this.canvasBalance.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    this.canvasBalance.addEventListener('touchend', () => {
      setTimeout(() => {
        this.hoverBalancePeriod = null;
        this.hideTooltip();
        this.drawBalanceChart();
      }, 1500);
    });
  }

  // =========================================================================
  // Canvas 1: Lifetime Breakdown Interactivity
  // =========================================================================
  private bindLifetimeInteractivity() {
    const handleMove = (clientX: number, clientY: number) => {
      if (!this.hasLoan || !this.currentAnalysis || this.slides[this.activeIndex]?.id !== 'lifetime') return;
      const a = this.currentAnalysis;
      const rect = this.canvasLifetime.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const dims = this.getDimensions(this.canvasLifetime, 240);

      const totalInterest = Math.max(0, a.plan.totalInterest);
      const totalExtra = a.plan.rows.reduce((sum, r) => sum + (r.extra || 0), 0);
      const regularPrincipal = Math.max(0, a.loanAmount - totalExtra);
      const totalCost = regularPrincipal + totalExtra + totalInterest;

      const niceTicks = getNiceTicks(Math.max(totalCost, 1), 5);
      const maxY = niceTicks[niceTicks.length - 1]!;

      const barWidth = Math.min(180, Math.max(80, dims.plotWidth * 0.42));
      const centerX = dims.padding.left + dims.plotWidth / 2;
      const barX = centerX - barWidth / 2;

      // Check if mouse is horizontally within bar bounds (with generous touch margin)
      const inBarX = x >= barX - 10 && x <= barX + barWidth + 10;
      if (!inBarX) {
        this.hoverLifetimeSegment = null;
        this.hideTooltip();
        this.drawLifetimeChart();
        return;
      }

      // Heights from bottom
      const intH = (totalInterest / maxY) * dims.plotHeight;
      const prinH = (regularPrincipal / maxY) * dims.plotHeight;
      const extraH = (totalExtra / maxY) * dims.plotHeight;

      const baseY = dims.padding.top + dims.plotHeight;
      const intTopY = baseY - intH;
      const prinTopY = intTopY - prinH;
      const extraTopY = prinTopY - extraH;

      if (y >= intTopY && y <= baseY) {
        this.hoverLifetimeSegment = 'interest';
      } else if (y >= prinTopY && y < intTopY) {
        this.hoverLifetimeSegment = 'principal';
      } else if (y >= extraTopY && y < prinTopY && totalExtra > 0) {
        this.hoverLifetimeSegment = 'extra';
      } else if (y >= extraTopY - 15 && y <= baseY + 15) {
        // Near bar: default to whichever is closest
        this.hoverLifetimeSegment = y < prinTopY ? 'extra' : y < intTopY ? 'principal' : 'interest';
      } else {
        this.hoverLifetimeSegment = null;
        this.hideTooltip();
        this.drawLifetimeChart();
        return;
      }

      this.drawLifetimeChart();

      const c = a.inputs.country;
      const pct = (amt: number) =>
        totalCost > 0 ? ((amt / totalCost) * 100).toFixed(1) + '%' : '0%';

      const html = `
        <div class="tip-header">Lifetime Breakdown</div>
        <div class="tip-row extra ${this.hoverLifetimeSegment === 'extra' ? 'highlight' : ''}">
          <span><i class="swatch extra"></i>Extra:</span>
          <strong>${formatMoney(totalExtra, c)} <span class="tip-pct">(${pct(totalExtra)})</span></strong>
        </div>
        <div class="tip-row principal ${this.hoverLifetimeSegment === 'principal' ? 'highlight' : ''}">
          <span><i class="swatch chart-principal"></i>Principal:</span>
          <strong>${formatMoney(regularPrincipal, c)} <span class="tip-pct">(${pct(regularPrincipal)})</span></strong>
        </div>
        <div class="tip-row interest ${this.hoverLifetimeSegment === 'interest' ? 'highlight' : ''}">
          <span><i class="swatch chart-interest"></i>Interest:</span>
          <strong>${formatMoney(totalInterest, c)} <span class="tip-pct">(${pct(totalInterest)})</span></strong>
        </div>
        <div class="tip-divider"></div>
        <div class="tip-row total">
          <span>Total Cost:</span>
          <strong>${formatMoney(totalCost, c)}</strong>
        </div>
      `;
      this.showTooltip(clientX, clientY, html);
    };

    this.canvasLifetime.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    this.canvasLifetime.addEventListener('mouseleave', () => {
      this.hoverLifetimeSegment = null;
      this.hideTooltip();
      this.drawLifetimeChart();
    });

    this.canvasLifetime.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    this.canvasLifetime.addEventListener('touchend', () => {
      setTimeout(() => {
        this.hoverLifetimeSegment = null;
        this.hideTooltip();
        this.drawLifetimeChart();
      }, 1500);
    });

    // Legend hover triggers
    const legendEl = document.getElementById('chart-legend-lifetime');
    legendEl?.querySelectorAll<HTMLElement>('.legend-item').forEach((item) => {
      item.addEventListener('mouseenter', () => {
        const cat = item.dataset.cat as 'extra' | 'principal' | 'interest';
        if (cat) {
          this.hoverLifetimeSegment = cat;
          this.drawLifetimeChart();
        }
      });
      item.addEventListener('mouseleave', () => {
        this.hoverLifetimeSegment = null;
        this.drawLifetimeChart();
      });
    });
  }

  // =========================================================================
  // Canvas 2: Annual Cash Flow Interactivity
  // =========================================================================
  private bindCashFlowInteractivity() {
    const handleMove = (clientX: number, clientY: number) => {
      if (
        !this.hasLoan ||
        !this.currentAnalysis ||
        aHasNoYears(this.currentAnalysis) ||
        this.slides[this.activeIndex]?.id !== 'cashflow'
      )
        return;
      const a = this.currentAnalysis;
      const years = a.years;
      const rect = this.canvasCashFlow.getBoundingClientRect();
      const x = clientX - rect.left;
      const dims = this.getDimensions(this.canvasCashFlow, 240);

      const relX = x - dims.padding.left;
      if (relX < 0 || relX > dims.plotWidth || years.length === 0) {
        this.hoverCashFlowYearIdx = null;
        this.hideTooltip();
        this.drawCashFlowChart();
        return;
      }

      const slotWidth = dims.plotWidth / years.length;
      const idx = Math.max(0, Math.min(years.length - 1, Math.floor(relX / slotWidth)));

      this.hoverCashFlowYearIdx = idx;
      this.drawCashFlowChart();

      const yr = years[idx]!;
      const c = a.inputs.country;
      const totalPaid = yr.interest + yr.principal + yr.extra;

      const html = `
        <div class="tip-header">${yr.endDate.getFullYear()} · Year ${yr.year}</div>
        ${yr.extra > 0 ? `<div class="tip-row extra"><span><i class="swatch extra"></i>Extra:</span> <strong>${formatMoney(yr.extra, c)}</strong></div>` : ''}
        <div class="tip-row principal"><span><i class="swatch chart-principal"></i>Principal:</span> <strong>${formatMoney(yr.principal, c)}</strong></div>
        <div class="tip-row interest"><span><i class="swatch chart-interest"></i>Interest:</span> <strong>${formatMoney(yr.interest, c)}</strong></div>
        <div class="tip-divider"></div>
        <div class="tip-row total"><span>Total Paid:</span> <strong>${formatMoney(totalPaid, c)}</strong></div>
        <div class="tip-row muted"><span>Balance left:</span> <strong>${formatMoney(yr.endBalance, c)}</strong></div>
      `;
      this.showTooltip(clientX, clientY, html);
    };

    this.canvasCashFlow.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    this.canvasCashFlow.addEventListener('mouseleave', () => {
      this.hoverCashFlowYearIdx = null;
      this.hideTooltip();
      this.drawCashFlowChart();
    });

    this.canvasCashFlow.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    this.canvasCashFlow.addEventListener('touchend', () => {
      setTimeout(() => {
        this.hoverCashFlowYearIdx = null;
        this.hideTooltip();
        this.drawCashFlowChart();
      }, 1500);
    });
  }

  public destroy() {
    this.resizeObserver?.disconnect();
  }
}

const aHasNoYears = (a: Analysis) => !a.years || a.years.length === 0;
