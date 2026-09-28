/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Multi-Debt Cascade Stacked Micro-Chart
 *
 * Visualizes total liability reduction across the Unified Household Balance Sheet
 * under Avalanche vs. Snowball debt elimination strategies.
 */

import { MultiDebtCascadeResult, MultiDebtPaymentRow } from '../core/types.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';

export interface MultiDebtChartProps {
  container: HTMLElement;
  cascadeResult: MultiDebtCascadeResult;
  country?: string;
}

export class MultiDebtChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private cascadeResult: MultiDebtCascadeResult | null = null;
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

  public render(props: MultiDebtChartProps) {
    this.cascadeResult = props.cascadeResult;
    this.draw();
  }

  private draw() {
    if (!this.cascadeResult || this.cascadeResult.schedule.length === 0) return;

    const dims = getChartDimensions(this.container, 220);
    const ctx = initHiDpiCanvas(this.canvas, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    const sched = this.cascadeResult.schedule;
    const maxMonths = sched.length;
    const startBal = sched[0]?.totalBalance || 1;

    const getX = (idx: number) => dims.padding.left + (idx / (maxMonths - 1 || 1)) * dims.plotWidth;
    const getY = (bal: number) => dims.padding.top + dims.plotHeight - (bal / startBal) * dims.plotHeight;

    // Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    for (let i = 0; i <= 4; i++) {
      const b = (startBal / 4) * i;
      const y = getY(b);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatAxisTick(b), dims.padding.left - 6, y + 3);
    }
    ctx.setLineDash([]);

    // Area Gradient
    const grad = ctx.createLinearGradient(0, dims.padding.top, 0, dims.padding.top + dims.plotHeight);
    grad.addColorStop(0, 'rgba(168, 85, 247, 0.3)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(sched[0]!.totalBalance));
    sched.forEach((row, idx) => {
      ctx.lineTo(getX(idx), getY(row.totalBalance));
    });
    ctx.lineTo(getX(sched.length - 1), dims.padding.top + dims.plotHeight);
    ctx.lineTo(getX(0), dims.padding.top + dims.plotHeight);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Curve Line
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    sched.forEach((row, idx) => {
      const x = getX(idx);
      const y = getY(row.totalBalance);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
