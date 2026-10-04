/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Cumulative Outflow Stacked Area Micro-Chart
 *
 * Visualizes cumulative lifetime cash outlay:
 * - Cumulative Interest (rose)
 * - Cumulative Principal Repaid (emerald)
 * - Cumulative Escrow/PITI (amber)
 * Includes interactive hover scrub with exact dollar totals.
 */

import { ScheduleRow } from '../core/types.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';
import { formatCurrency } from '../core/formatters.js';

export interface CumulativeOutflowProps {
  container: HTMLElement;
  schedule: ScheduleRow[];
  usePiti?: boolean;
  country?: string;
  onHoverPoint?: (row: ScheduleRow | null) => void;
}

export class CumulativeOutflowChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private schedule: ScheduleRow[] = [];
  private usePiti = true;
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

  public render(props: CumulativeOutflowProps) {
    this.schedule = props.schedule;
    this.usePiti = props.usePiti !== false;
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
    const lastRow = this.schedule[this.schedule.length - 1]!;
    const maxOutflow =
      lastRow.totalInterest +
      lastRow.totalPrincipal +
      (this.usePiti ? lastRow.totalEscrow || 0 : 0);

    const safeMax = Math.max(1, maxOutflow);

    const getX = (period: number) =>
      dims.padding.left + ((period - 1) / (maxPeriods - 1 || 1)) * dims.plotWidth;
    const getY = (val: number) =>
      dims.padding.top + dims.plotHeight - (val / safeMax) * dims.plotHeight;

    // 1. Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= 4; i++) {
      const yVal = (safeMax / 4) * i;
      const y = getY(yVal);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatAxisTick(yVal), dims.padding.left - 8, y + 3);
    }
    ctx.setLineDash([]);

    // 2. Cumulative Interest Area (Bottom Layer - Rose)
    ctx.beginPath();
    ctx.moveTo(getX(this.schedule[0]!.period), getY(this.schedule[0]!.totalInterest));
    this.schedule.forEach((r) => {
      ctx.lineTo(getX(r.period), getY(r.totalInterest));
    });
    ctx.lineTo(getX(lastRow.period), dims.padding.top + dims.plotHeight);
    ctx.lineTo(getX(this.schedule[0]!.period), dims.padding.top + dims.plotHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
    ctx.fill();

    // 3. Cumulative Principal Area (Stacked on Interest - Emerald)
    ctx.beginPath();
    const p0 = this.schedule[0]!.totalInterest + this.schedule[0]!.totalPrincipal;
    ctx.moveTo(getX(this.schedule[0]!.period), getY(p0));
    this.schedule.forEach((r) => {
      ctx.lineTo(getX(r.period), getY(r.totalInterest + r.totalPrincipal));
    });
    for (let i = this.schedule.length - 1; i >= 0; i--) {
      ctx.lineTo(getX(this.schedule[i]!.period), getY(this.schedule[i]!.totalInterest));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.fill();

    // 4. Cumulative Escrow Area (If PITI enabled - Amber)
    if (this.usePiti && lastRow.totalEscrow > 0) {
      ctx.beginPath();
      const esc0 = this.schedule[0]!.totalInterest + this.schedule[0]!.totalPrincipal + (this.schedule[0]!.totalEscrow || 0);
      ctx.moveTo(getX(this.schedule[0]!.period), getY(esc0));
      this.schedule.forEach((r) => {
        ctx.lineTo(getX(r.period), getY(r.totalInterest + r.totalPrincipal + (r.totalEscrow || 0)));
      });
      for (let i = this.schedule.length - 1; i >= 0; i--) {
        ctx.lineTo(getX(this.schedule[i]!.period), getY(this.schedule[i]!.totalInterest + this.schedule[i]!.totalPrincipal));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.fill();
    }

    // Top Curve Stroke
    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    this.schedule.forEach((r, idx) => {
      const total = r.totalInterest + r.totalPrincipal + (this.usePiti ? r.totalEscrow || 0 : 0);
      const x = getX(r.period);
      const y = getY(total);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 5. Hover Crosshair & Tooltip
    if (this.hoverIndex !== null && this.schedule[this.hoverIndex]) {
      const row = this.schedule[this.hoverIndex]!;
      const hX = getX(row.period);
      const total = row.totalInterest + row.totalPrincipal + (this.usePiti ? row.totalEscrow || 0 : 0);
      const hY = getY(total);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hX, dims.padding.top);
      ctx.lineTo(hX, dims.padding.top + dims.plotHeight);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hX, hY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip Card
      const t1 = `${row.dateLabel} (Month ${row.period})`;
      const t2 = `Total Paid: ${formatCurrency(total, this.country)}`;
      const t3 = `Principal Paid: ${formatCurrency(row.totalPrincipal, this.country)}`;
      const t4 = `Interest Paid: ${formatCurrency(row.totalInterest, this.country)}`;
      const t5 = this.usePiti && row.totalEscrow > 0 ? `Escrow Paid: ${formatCurrency(row.totalEscrow, this.country)}` : '';

      ctx.font = '10px JetBrains Mono, monospace';
      const tipW = 180;
      const lines = [t1, t2, t3, t4, t5].filter(Boolean);
      const tipH = lines.length * 14 + 10;
      let tipX = hX + 12;
      if (tipX + tipW > dims.width - 10) tipX = hX - tipW - 12;
      let tipY = hY - tipH / 2;
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
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(t2, tipX + 10, currY);

      currY += 14;
      ctx.fillStyle = '#10b981';
      ctx.fillText(t3, tipX + 10, currY);

      currY += 14;
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(t4, tipX + 10, currY);

      if (t5) {
        currY += 14;
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(t5, tipX + 10, currY);
      }
    }
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
