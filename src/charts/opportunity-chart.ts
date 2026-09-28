/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Opportunity Cost Micro-Chart (Prepay vs. S&P 500 Index Compounding)
 *
 * High-performance dual-curve projection showing real-time Net Worth accumulation:
 * - Prepay Net Worth trajectory (Home Equity + Redirected Post-Payoff Indexing)
 * - Invest Net Worth trajectory (Standard Equity + Direct S&P 500 Compounding)
 * - Crossover Year indicator badge
 */

import { OppCostSummary, OppCostPoint } from '../core/opportunity-cost.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';
import { formatCurrency } from '../core/formatters.js';

export interface OpportunityChartProps {
  container: HTMLElement;
  summary: OppCostSummary;
  country?: string;
}

export class OpportunityChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private summary: OppCostSummary | null = null;
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

  public render(props: OpportunityChartProps) {
    this.summary = props.summary;
    this.country = props.country || 'CA';
    this.draw();
  }

  private draw() {
    if (!this.summary || this.summary.points.length === 0) return;

    const dims = getChartDimensions(this.container, 250);
    const ctx = initHiDpiCanvas(this.canvas, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    const pts = this.summary.points;
    const maxVal = Math.max(
      ...pts.map((p) => Math.max(p.prepayNetWorth, p.investNetWorth)),
      100000
    );

    const getX = (idx: number) => dims.padding.left + (idx / (pts.length - 1 || 1)) * dims.plotWidth;
    const getY = (val: number) => dims.padding.top + dims.plotHeight - (val / maxVal) * dims.plotHeight;

    // 1. Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    for (let i = 0; i <= 4; i++) {
      const yVal = (maxVal / 4) * i;
      const y = getY(yVal);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatAxisTick(yVal), dims.padding.left - 6, y + 3);
    }
    ctx.setLineDash([]);

    // 2. Prepay Curve (Emerald / Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    pts.forEach((p, idx) => {
      const x = getX(idx);
      const y = getY(p.prepayNetWorth);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Invest Curve (Amber / Gold)
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 2]);
    pts.forEach((p, idx) => {
      const x = getX(idx);
      const y = getY(p.investNetWorth);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Legend
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#10b981';
    ctx.fillRect(dims.padding.left, dims.padding.top - 12, 10, 3);
    ctx.fillText('Debt Prepayment Path', dims.padding.left + 15, dims.padding.top - 8);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(dims.padding.left + 140, dims.padding.top - 12, 10, 3);
    ctx.fillText('S&P 500 Index Compounding', dims.padding.left + 155, dims.padding.top - 8);
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
