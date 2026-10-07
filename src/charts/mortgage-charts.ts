/**
 * TrueMortgage — Interactive Multi-Graph Carousel
 *
 * Implements 3 synchronized, hardware-accelerated, high-DPI micro-charts:
 *  1. Balance Over Time (Balance curve + baseline strategy comparison + interactive scrubbing)
 *  2. Lifetime Breakdown (Stacked bar: Interest, Principal, Extra on Total Cost)
 *  3. Annual Cash Flow (Stacked bars per calendar year: Interest, Principal, Extra)
 *
 * Supports:
 *  - Effortless side-to-side touch swiping on mobile (in-place scroll snap)
 *  - Elegant tab switching and next/prev toggling on PC/Mac
 *  - Enlarge/Shrink full-view button (+)
 *  - Rich interactive tooltips and hover highlights
 */

import { Analysis, Country, PaymentRow, YearRow } from '../core/types.js';
import { formatMoney } from '../core/format.js';
import { REGIONS } from '../core/regions.js';

export interface ChartThemeColors {
  isDark: boolean;
  textColor: string;
  mutedColor: string;
  gridColor: string;
  cardBg: string;
  accentColor: string;
  accentSoft: string;
  extraColor: string;
  extraHover: string;
  principalColor: string;
  principalHover: string;
  interestColor: string;
  interestHover: string;
  baselineColor: string;
}

export const getThemeColors = (): ChartThemeColors => {
  let isDark = false;
  if (typeof window !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') {
      isDark = true;
    } else if (attr === 'light') {
      isDark = false;
    } else {
      isDark =
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark');
    }
  }

  return {
    isDark,
    textColor: isDark ? '#f1f5f9' : '#0f172a',
    mutedColor: isDark ? '#94a3b8' : '#64748b',
    gridColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.06)',
    cardBg: isDark ? '#11141c' : '#ffffff',
    accentColor: isDark ? '#60a5fa' : '#2563eb',
    accentSoft: isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(37, 99, 235, 0.1)',
    extraColor: isDark ? '#34d399' : '#059669',
    extraHover: isDark ? '#6ee7b7' : '#10b981',
    principalColor: isDark ? '#60a5fa' : '#2563eb',
    principalHover: isDark ? '#93c5fd' : '#3b82f6',
    interestColor: isDark ? '#fb7185' : '#e11d48',
    interestHover: isDark ? '#fda4af' : '#be123c',
    baselineColor: isDark ? '#94a3b8' : '#64748b'
  };
};

/**
 * Calculates human-friendly round tick intervals (e.g. 20k, 50k, 100k, 200k).
 */
export const getNiceTicks = (maxValue: number, maxTicks = 5): number[] => {
  if (maxValue <= 0) return [0];
  const roughStep = maxValue / (maxTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let step: number;
  if (normalized < 1.5) step = 1 * magnitude;
  else if (normalized < 3) step = 2 * magnitude;
  else if (normalized < 7) step = 5 * magnitude;
  else step = 10 * magnitude;

  const ticks: number[] = [];
  for (let val = 0; val <= maxValue + step * 0.05; val += step) {
    ticks.push(Math.round(val));
  }
  if (ticks.length > 0 && ticks[ticks.length - 1]! < maxValue) {
    ticks.push(ticks[ticks.length - 1]! + step);
  }
  return ticks;
};

/**
 * Formats compact numbers for axis labels (e.g. $20k, $40k, $600k, $1.2M).
 */
export const formatCompactMoney = (val: number, country: Country = 'CA'): string => {
  const r = REGIONS[country] || REGIONS.CA;
  const sym = r.currency === 'GBP' ? '£' : '$';
  if (val === 0) return `${sym}0`;
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `${sym}${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (val >= 1_000) {
    const k = val / 1_000;
    return `${sym}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${sym}${Math.round(val)}`;
};

/**
 * Initializes a canvas for HiDPI/Retina screens.
 */
export const initHiDpiCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null => {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
  return ctx;
};

export class MortgageChartsManager {
  private card: HTMLElement;
  private viewport: HTMLElement;
  private titleEl: HTMLElement;
  private expandBtn: HTMLButtonElement;
  private tabs: HTMLButtonElement[] = [];
  private dots: HTMLButtonElement[] = [];
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;

  // Canvases
  private canvasBalance: HTMLCanvasElement;
  private canvasLifetime: HTMLCanvasElement;
  private canvasCashFlow: HTMLCanvasElement;

  // Floating Tooltip
  private tooltipEl: HTMLElement;

  // State
  private activeIndex: 0 | 1 | 2 = 0;
  private isExpanded = false;
  private currentAnalysis: Analysis | null = null;
  private hasLoan = false;
  private resizeObserver: ResizeObserver | null = null;
  private isProgrammaticScrolling = false;
  private scrollDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  // Chart titles corresponding to tabs
  private readonly titles = ['Balance over time', 'Lifetime Breakdown', 'Annual Cash Flow'];

  // Hover states
  private hoverBalancePeriod: number | null = null;
  private hoverLifetimeSegment: 'interest' | 'principal' | 'extra' | null = null;
  private hoverCashFlowYearIdx: number | null = null;

  constructor() {
    this.card = document.getElementById('chart-card') as HTMLElement;
    this.viewport = document.getElementById('chart-carousel-viewport') as HTMLElement;
    this.titleEl = document.getElementById('chart-active-title') as HTMLElement;
    this.expandBtn = document.getElementById('chart-expand-btn') as HTMLButtonElement;
    this.prevBtn = document.getElementById('chart-prev-btn') as HTMLButtonElement | null;
    this.nextBtn = document.getElementById('chart-next-btn') as HTMLButtonElement | null;

    this.tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.chart-tab-btn'));
    this.dots = Array.from(document.querySelectorAll<HTMLButtonElement>('.chart-dot'));

    // Create canvases inside containers
    this.canvasBalance = this.setupCanvas('chart-balance');
    this.canvasLifetime = this.setupCanvas('chart-lifetime');
    this.canvasCashFlow = this.setupCanvas('chart-cashflow');

    // Create floating tooltip element
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'chart-floating-tooltip';
    this.tooltipEl.setAttribute('aria-hidden', 'true');
    this.tooltipEl.hidden = true;
    this.card.appendChild(this.tooltipEl);

    this.bindEvents();
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

    // Toggle baseline legend visibility on slide 0
    const baselineLegend = document.getElementById('legend-baseline');
    if (baselineLegend) {
      baselineLegend.hidden = !analysis.hasStrategy;
    }

    this.drawAll();
  }

  public drawAll() {
    this.drawBalanceChart();
    this.drawLifetimeChart();
    this.drawCashFlowChart();
  }

  private getDimensions(canvas: HTMLCanvasElement, defaultHeight = 250) {
    const rect = canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(260, rect?.width || this.viewport.clientWidth || 320);
    const height = this.isExpanded ? 420 : defaultHeight;
    const padding = { top: 20, right: 20, bottom: 38, left: 62 };
    const plotWidth = Math.max(10, width - padding.left - padding.right);
    const plotHeight = Math.max(10, height - padding.top - padding.bottom);

    return { width, height, padding, plotWidth, plotHeight };
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
      const step = years.length > 20 ? 5 : years.length > 10 ? 2 : 1;
      if (idx % step === 0 || idx === years.length - 1) {
        ctx.fillStyle = isHovered ? colors.textColor : colors.mutedColor;
        ctx.font = isHovered
          ? 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          : '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(calYear), centerX, dims.padding.top + dims.plotHeight + 16);
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
    const bounded = Math.max(0, Math.min(2, index)) as 0 | 1 | 2;
    if (this.activeIndex === bounded && !scrollViewport) return;
    this.activeIndex = bounded;

    // Update Title
    if (this.titleEl) {
      this.titleEl.textContent = this.titles[this.activeIndex] || 'Mortgage Chart';
    }

    // Update Tabs
    this.tabs.forEach((tab) => {
      const idx = parseInt(tab.dataset.tab || '0', 10);
      const active = idx === this.activeIndex;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
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
      if (this.activeIndex === 0) this.drawBalanceChart();
      else if (this.activeIndex === 1) this.drawLifetimeChart();
      else this.drawCashFlowChart();
    });
  }

  public toggleExpand() {
    this.isExpanded = !this.isExpanded;
    this.card.classList.toggle('expanded', this.isExpanded);

    if (this.expandBtn) {
      this.expandBtn.innerHTML = this.isExpanded ? '−' : '+';
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
      const prev = this.activeIndex === 0 ? 2 : this.activeIndex - 1;
      this.setActiveIndex(prev, true);
    });

    this.nextBtn?.addEventListener('click', () => {
      const next = this.activeIndex === 2 ? 0 : this.activeIndex + 1;
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
          if (deltaX < 0 && this.activeIndex < 2) {
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
      } else if (e.key === 'ArrowRight' && this.activeIndex < 2) {
        e.preventDefault();
        this.setActiveIndex(this.activeIndex + 1, true);
      }
    });

    // 8. Interactive Canvas Hover / Touch Handlers
    this.bindBalanceInteractivity();
    this.bindLifetimeInteractivity();
    this.bindCashFlowInteractivity();

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
  // Canvas 0: Balance Over Time Interactivity
  // =========================================================================
  private bindBalanceInteractivity() {
    const handleMove = (clientX: number, clientY: number) => {
      if (!this.hasLoan || !this.currentAnalysis || this.activeIndex !== 0) return;
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
      if (!this.hasLoan || !this.currentAnalysis || this.activeIndex !== 1) return;
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
        this.activeIndex !== 2
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
