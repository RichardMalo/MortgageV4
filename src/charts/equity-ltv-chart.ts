/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Equity Build-Up & LTV Eradication Micro-Chart
 *
 * Visualizes:
 * - Accumulated Equity ($) trajectory (emerald)
 * - Loan-to-Value (LTV %) decay curve (cyan)
 * - Statutory 80% LTV PMI Eradication Threshold line (rose dashed)
 * Includes interactive hover scrub with exact equity dollar & LTV percent.
 */

import { ScheduleRow } from '../core/types.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';
import { formatCurrency } from '../core/formatters.js';

export interface EquityLtvProps {
  container: HTMLElement;
  schedule: ScheduleRow[];
  homePrice: number;
  country?: string;
  onHoverPoint?: (row: ScheduleRow | null) => void;
}

export class EquityLtvChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private schedule: ScheduleRow[] = [];
  private homePrice = 0;
  private country = 'CA';
  private resizeObserver: ResizeObserver;
  private hoverIndex: number | null = null;
  private onHoverCallback?: (row: ScheduleRow | null) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'crosshair';

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.container);

    this.bindEvents();
  }

  public render(props: EquityLtvProps) {
    this.schedule = props.schedule;
    this.homePrice = Math.max(1, props.homePrice);
    this.country = props.country || 'CA';
    this.onHoverCallback = props.onHoverPoint;
    this.draw();
  }

  private bindEvents() {
    const handleMove = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const dims = getChartDimensions(this.container, 250);

      const relX = x - dims.padding.left;
      const ratio = Math.max(0, Math.min(1, relX / dims.plotWidth));
      const idx = Math.round(ratio * (this.schedule.length - 1));

      this.hoverIndex = idx >= 0 && idx < this.schedule.length ? idx : null;
      this.draw();

      if (this.onHoverCallback && this.hoverIndex !== null) {
        this.onHoverCallback(this.schedule[this.hoverIndex] || null);
      }
    };

    this.canvas.addEventListener('mousemove', (e) => handleMove(e.clientX));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverIndex = null;
      this.draw();
      if (this.onHoverCallback) this.onHoverCallback(null);
    });

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX);
      },
      { passive: true }
    );
    this.canvas.addEventListener('touchend', () => {
      this.hoverIndex = null;
      this.draw();
    });
  }

  private draw() {
    const dims = getChartDimensions(this.container, 250);
    const ctx = initHiDpiCanvas(this.canvas, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);
    if (this.schedule.length === 0) return;

    const maxPeriods = this.schedule.length;
    const maxEquity = this.homePrice;

    const getX = (period: number) =>
      dims.padding.left + ((period - 1) / (maxPeriods - 1 || 1)) * dims.plotWidth;
    const getYEquity = (val: number) =>
      dims.padding.top + dims.plotHeight - (val / maxEquity) * dims.plotHeight;
    const getYLtv = (ltvPct: number) =>
      dims.padding.top + dims.plotHeight - (ltvPct / 100) * dims.plotHeight;

    // 1. Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= 4; i++) {
      const yVal = (maxEquity / 4) * i;
      const y = getYEquity(yVal);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      // Left axis label ($ Equity)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatAxisTick(yVal), dims.padding.left - 8, y + 3);
    }
    ctx.setLineDash([]);

    // 2. 80% LTV PMI Drop Line
    const y80 = getYLtv(80);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(dims.padding.left, y80);
    ctx.lineTo(dims.padding.left + dims.plotWidth, y80);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('80% LTV PMI Drop Threshold', dims.padding.left + 8, y80 - 4);

    // 3. Equity Area (Emerald Gradient)
    const grad = ctx.createLinearGradient(0, dims.padding.top, 0, dims.padding.top + dims.plotHeight);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    ctx.beginPath();
    const firstEquity = Math.max(0, this.homePrice - this.schedule[0]!.balance);
    ctx.moveTo(getX(this.schedule[0]!.period), getYEquity(firstEquity));
    this.schedule.forEach((r) => {
      const eq = Math.max(0, this.homePrice - r.balance);
      ctx.lineTo(getX(r.period), getYEquity(eq));
    });
    ctx.lineTo(getX(this.schedule[this.schedule.length - 1]!.period), dims.padding.top + dims.plotHeight);
    ctx.lineTo(getX(this.schedule[0]!.period), dims.padding.top + dims.plotHeight);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Equity Curve
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    this.schedule.forEach((r, idx) => {
      const eq = Math.max(0, this.homePrice - r.balance);
      const x = getX(r.period);
      const y = getYEquity(eq);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 4. LTV Curve (Cyan Line)
    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    this.schedule.forEach((r, idx) => {
      const ltv = r.ltv || (r.balance / this.homePrice) * 100;
      const x = getX(r.period);
      const y = getYLtv(ltv);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 5. Hover Crosshair & Tooltip
    if (this.hoverIndex !== null && this.schedule[this.hoverIndex]) {
      const row = this.schedule[this.hoverIndex]!;
      const hX = getX(row.period);
      const equity = Math.max(0, this.homePrice - row.balance);
      const ltv = row.ltv || (row.balance / this.homePrice) * 100;
      const hYEquity = getYEquity(equity);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hX, dims.padding.top);
      ctx.lineTo(hX, dims.padding.top + dims.plotHeight);
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(hX, hYEquity, 4, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip Card
      const t1 = `${row.dateLabel} (Month ${row.period})`;
      const t2 = `Home Equity: ${formatCurrency(equity, this.country)} (${((equity / this.homePrice) * 100).toFixed(1)}%)`;
      const t3 = `Remaining Balance: ${formatCurrency(row.balance, this.country)}`;
      const t4 = `Current LTV: ${ltv.toFixed(1)}%`;

      ctx.font = '10px JetBrains Mono, monospace';
      const tipW = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width, ctx.measureText(t3).width) + 24;
      const tipH = 68;
      let tipX = hX + 12;
      if (tipX + tipW > dims.width - 10) tipX = hX - tipW - 12;
      let tipY = hYEquity - tipH / 2;
      if (tipY < dims.padding.top) tipY = dims.padding.top;
      if (tipY + tipH > dims.height - 10) tipY = dims.height - tipH - 10;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 6);
      ctx.fill();
      ctx.stroke();

      let currY = tipY + 14;
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText(t1, tipX + 10, currY);

      currY += 14;
      ctx.fillStyle = '#10b981';
      ctx.fillText(t2, tipX + 10, currY);

      currY += 14;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t3, tipX + 10, currY);

      currY += 14;
      ctx.fillStyle = ltv <= 80 ? '#10b981' : '#f59e0b';
      ctx.fillText(t4, tipX + 10, currY);
    }
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
