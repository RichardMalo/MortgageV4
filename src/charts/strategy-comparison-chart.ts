/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Strategy Comparison Bars Micro-Chart
 *
 * Side-by-side comparative bars contrasting:
 * - Total Lifetime Interest Cost ($ Baseline vs. Strategy)
 * - Payoff Duration (Years Baseline vs. Strategy)
 */

import { formatCurrency } from '../core/formatters.js';
import { getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';

export interface StrategyComparisonProps {
  container: HTMLElement;
  baselineInterest: number;
  strategyInterest: number;
  baselineYears: number;
  strategyYears: number;
  country?: string;
}

export class StrategyComparisonChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private baselineInterest = 0;
  private strategyInterest = 0;
  private baselineYears = 25;
  private strategyYears = 25;
  private country = 'CA';
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.container);
  }

  public render(props: StrategyComparisonProps) {
    this.baselineInterest = Math.max(0, props.baselineInterest);
    this.strategyInterest = Math.max(0, props.strategyInterest);
    this.baselineYears = Math.max(0.1, props.baselineYears);
    this.strategyYears = Math.max(0.1, props.strategyYears);
    this.country = props.country || 'CA';
    this.draw();
  }

  private draw() {
    const dims = getChartDimensions(this.container, 200);
    const ctx = initHiDpiCanvas(this.canvas, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    const halfWidth = (dims.width - dims.padding.left - dims.padding.right - 24) / 2;
    const chartHeight = dims.height - dims.padding.top - dims.padding.bottom;

    // Helper to draw a comparative bar pair
    const drawPair = (
      startX: number,
      title: string,
      baseVal: number,
      stratVal: number,
      formatVal: (v: number) => string,
      deltaLabel: string,
      deltaColor: string
    ) => {
      const maxVal = Math.max(baseVal, stratVal, 1);
      const colWidth = Math.min(48, (halfWidth - 30) / 2);

      // Title
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title, startX + halfWidth / 2, dims.padding.top - 4);

      // Baseline bar (Slate/Red)
      const bX = startX + halfWidth / 2 - colWidth - 6;
      const bHeight = (baseVal / maxVal) * (chartHeight - 40);
      const bY = dims.padding.top + chartHeight - 20 - bHeight;

      ctx.fillStyle = 'rgba(244, 63, 94, 0.7)';
      ctx.beginPath();
      ctx.roundRect(bX, bY, colWidth, bHeight, [4, 4, 0, 0]);
      ctx.fill();

      // Strategy bar (Emerald)
      const sX = startX + halfWidth / 2 + 6;
      const sHeight = (stratVal / maxVal) * (chartHeight - 40);
      const sY = dims.padding.top + chartHeight - 20 - sHeight;

      ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.beginPath();
      ctx.roundRect(sX, sY, colWidth, sHeight, [4, 4, 0, 0]);
      ctx.fill();

      // Top value text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatVal(baseVal), bX + colWidth / 2, bY - 6);
      ctx.fillText(formatVal(stratVal), sX + colWidth / 2, sY - 6);

      // Bottom bar labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText('Baseline', bX + colWidth / 2, dims.padding.top + chartHeight - 6);
      ctx.fillText('Strategy', sX + colWidth / 2, dims.padding.top + chartHeight - 6);

      // Delta Callout Badge
      ctx.fillStyle = deltaColor;
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(deltaLabel, startX + halfWidth / 2, dims.padding.top + chartHeight + 10);
    };

    // Pair 1: Total Interest Cost
    const savedInterest = Math.max(0, this.baselineInterest - this.strategyInterest);
    drawPair(
      dims.padding.left,
      'Total Bank Interest Cost',
      this.baselineInterest,
      this.strategyInterest,
      (v) => formatCurrency(v, this.country),
      `Saved: ${formatCurrency(savedInterest, this.country)}`,
      '#10b981'
    );

    // Pair 2: Time to Pay Off (Years)
    const savedYears = Math.max(0, this.baselineYears - this.strategyYears);
    drawPair(
      dims.padding.left + halfWidth + 24,
      'Time to Debt Freedom',
      this.baselineYears,
      this.strategyYears,
      (v) => `${v.toFixed(1)} Yrs`,
      `Shaved: ${savedYears.toFixed(1)} Years`,
      '#38bdf8'
    );
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
