/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Payment Composition Micro-Chart
 *
 * Hardware-accelerated High-DPI Canvas dual-area chart:
 * - Principal (+ Extra) area (emerald/cyan)
 * - Interest area (rose)
 * - Marks the Interest Tipping Point (where Principal > Interest)
 * - Interactive Scrubbing Crosshair & Tooltip
 */

import { ScheduleRow } from '../core/types.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';
import { formatCurrency } from '../core/formatters.js';

export interface PaymentCompositionProps {
  container: HTMLElement;
  schedule: ScheduleRow[];
  country?: string;
  onHoverPoint?: (row: ScheduleRow | null) => void;
}

export class PaymentCompositionChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private schedule: ScheduleRow[] = [];
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

  public render(props: PaymentCompositionProps) {
    this.schedule = props.schedule;
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
    let maxPayment = 1;
    let crossoverPeriod: number | null = null;

    this.schedule.forEach((r) => {
      const totalPI = r.principal + r.interest + (r.extra || 0);
      if (totalPI > maxPayment) maxPayment = totalPI;
      if (crossoverPeriod === null && (r.principal + (r.extra || 0)) > r.interest) {
        crossoverPeriod = r.period;
      }
    });

    const getX = (period: number) =>
      dims.padding.left + ((period - 1) / (maxPeriods - 1 || 1)) * dims.plotWidth;
    const getY = (amount: number) =>
      dims.padding.top + dims.plotHeight - (amount / maxPayment) * dims.plotHeight;

    // 1. Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= 4; i++) {
      const yVal = (maxPayment / 4) * i;
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

    // 2. Interest Area (Rose)
    ctx.beginPath();
    ctx.moveTo(getX(this.schedule[0]!.period), getY(this.schedule[0]!.interest));
    this.schedule.forEach((r) => {
      ctx.lineTo(getX(r.period), getY(r.interest));
    });
    ctx.lineTo(getX(this.schedule[this.schedule.length - 1]!.period), dims.padding.top + dims.plotHeight);
    ctx.lineTo(getX(this.schedule[0]!.period), dims.padding.top + dims.plotHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.18)';
    ctx.fill();

    // Interest Line
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    this.schedule.forEach((r, idx) => {
      const x = getX(r.period);
      const y = getY(r.interest);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Principal Area (Emerald / Cyan)
    ctx.beginPath();
    const p0 = this.schedule[0]!.principal + (this.schedule[0]!.extra || 0);
    ctx.moveTo(getX(this.schedule[0]!.period), getY(p0));
    this.schedule.forEach((r) => {
      const p = r.principal + (r.extra || 0);
      ctx.lineTo(getX(r.period), getY(p));
    });
    ctx.lineTo(getX(this.schedule[this.schedule.length - 1]!.period), dims.padding.top + dims.plotHeight);
    ctx.lineTo(getX(this.schedule[0]!.period), dims.padding.top + dims.plotHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
    ctx.fill();

    // Principal Line
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    this.schedule.forEach((r, idx) => {
      const p = r.principal + (r.extra || 0);
      const x = getX(r.period);
      const y = getY(p);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 4. Interest Crossover Marker
    if (crossoverPeriod !== null) {
      const crossX = getX(crossoverPeriod);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(crossX, dims.padding.top);
      ctx.lineTo(crossX, dims.padding.top + dims.plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚖️ Tipping Point', crossX, dims.padding.top - 5);
    }

    // 5. Hover Crosshair & Tooltip
    if (this.hoverIndex !== null && this.schedule[this.hoverIndex]) {
      const row = this.schedule[this.hoverIndex]!;
      const hX = getX(row.period);
      const principalTotal = row.principal + (row.extra || 0);
      const hYPrincipal = getY(principalTotal);
      const hYInterest = getY(row.interest);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hX, dims.padding.top);
      ctx.lineTo(hX, dims.padding.top + dims.plotHeight);
      ctx.stroke();

      // Dots
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(hX, hYPrincipal, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(hX, hYInterest, 4, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip
      const t1 = `${row.dateLabel} (Pmt #${row.period})`;
      const t2 = `Principal: ${formatCurrency(principalTotal, this.country)}`;
      const t3 = `Interest: ${formatCurrency(row.interest, this.country)}`;
      const total = principalTotal + row.interest;
      const pctPrincipal = total > 0 ? Math.round((principalTotal / total) * 100) : 0;
      const t4 = `Equity Share: ${pctPrincipal}%`;

      ctx.font = '10px JetBrains Mono, monospace';
      const tipW = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width, ctx.measureText(t3).width) + 24;
      const tipH = 58;
      let tipX = hX + 12;
      if (tipX + tipW > dims.width - 10) tipX = hX - tipW - 12;
      let tipY = Math.min(hYPrincipal, hYInterest) - 10;
      if (tipY < dims.padding.top) tipY = dims.padding.top;
      if (tipY + tipH > dims.height - 10) tipY = dims.height - tipH - 10;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText(t1, tipX + 10, tipY + 14);

      ctx.fillStyle = '#10b981';
      ctx.fillText(t2, tipX + 10, tipY + 28);

      ctx.fillStyle = '#f43f5e';
      ctx.fillText(t3, tipX + 10, tipY + 42);

      ctx.fillStyle = '#f8fafc';
      ctx.fillText(t4, tipX + 10, tipY + 54);
    }
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
