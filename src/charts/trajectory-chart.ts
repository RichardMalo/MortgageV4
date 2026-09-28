/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Amortization Trajectory Micro-Chart
 *
 * Hardware-accelerated High-DPI Canvas dual-curve trajectory:
 * - Baseline Amortization Decay Curve
 * - Accelerated Strategy Paydown Curve (with glowing gradient)
 * - Term-End Renewal Red Marker
 * - Debt-Free Payoff Milestone Pin
 * - Interactive Scrubbing Crosshair & Tooltip
 */

import { ScheduleRow, ScheduleSummary } from '../core/types.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';
import { formatCurrency } from '../core/formatters.js';

export interface TrajectoryChartProps {
  container: HTMLElement;
  baselineSchedule: ScheduleRow[];
  strategySchedule: ScheduleRow[];
  termYears: number;
  country?: string;
  onHoverPoint?: (row: ScheduleRow | null) => void;
}

export class TrajectoryChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private baseline: ScheduleRow[] = [];
  private strategy: ScheduleRow[] = [];
  private termYears = 5;
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

    this.resizeObserver = new ResizeObserver(() => {
      this.draw();
    });
    this.resizeObserver.observe(this.container);

    this.bindEvents();
  }

  public render(props: TrajectoryChartProps) {
    this.baseline = props.baselineSchedule;
    this.strategy = props.strategySchedule;
    this.termYears = props.termYears;
    this.country = props.country || 'CA';
    this.onHoverCallback = props.onHoverPoint;

    this.draw();
  }

  private bindEvents() {
    const handleMove = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const dims = getChartDimensions(this.container, 260);

      const relX = x - dims.padding.left;
      const maxPeriods = Math.max(this.baseline.length, this.strategy.length, 1);
      const ratio = Math.max(0, Math.min(1, relX / dims.plotWidth));
      const idx = Math.round(ratio * (this.strategy.length - 1));

      this.hoverIndex = idx >= 0 && idx < this.strategy.length ? idx : null;
      this.draw();

      if (this.onHoverCallback && this.hoverIndex !== null) {
        this.onHoverCallback(this.strategy[this.hoverIndex] || null);
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
    const dims = getChartDimensions(this.container, 260);
    const ctx = initHiDpiCanvas(this.canvas, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    if (this.strategy.length === 0) return;

    const maxPeriods = Math.max(this.baseline.length, this.strategy.length);
    const maxBalance = Math.max(
      this.baseline[0]?.balance || 0,
      this.strategy[0]?.balance || 0,
      1
    );

    const getX = (period: number) => dims.padding.left + ((period - 1) / (maxPeriods - 1 || 1)) * dims.plotWidth;
    const getY = (bal: number) => dims.padding.top + dims.plotHeight - (bal / maxBalance) * dims.plotHeight;

    // 1. Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= 4; i++) {
      const yVal = (maxBalance / 4) * i;
      const y = getY(yVal);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      // Y-axis label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatAxisTick(yVal), dims.padding.left - 8, y + 3);
    }
    ctx.setLineDash([]);

    // 2. Baseline Curve (Slate / Gray dashed)
    if (this.baseline.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      this.baseline.forEach((r, idx) => {
        const x = getX(r.period);
        const y = getY(r.balance);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Strategy Area Gradient
    if (this.strategy.length > 0) {
      const grad = ctx.createLinearGradient(0, dims.padding.top, 0, dims.padding.top + dims.plotHeight);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

      ctx.beginPath();
      ctx.moveTo(getX(this.strategy[0]!.period), getY(this.strategy[0]!.balance));
      this.strategy.forEach((r) => {
        ctx.lineTo(getX(r.period), getY(r.balance));
      });
      const last = this.strategy[this.strategy.length - 1]!;
      ctx.lineTo(getX(last.period), dims.padding.top + dims.plotHeight);
      ctx.lineTo(getX(this.strategy[0]!.period), dims.padding.top + dims.plotHeight);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Strategy Stroke
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      this.strategy.forEach((r, idx) => {
        const x = getX(r.period);
        const y = getY(r.balance);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // 4. Term-End Red Renewal Marker
    const termPeriods = Math.round(this.termYears * 12);
    if (termPeriods > 0 && termPeriods < maxPeriods) {
      const termX = getX(termPeriods);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(termX, dims.padding.top);
      ctx.lineTo(termX, dims.padding.top + dims.plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Badge
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`Year ${this.termYears} Renewal`, termX, dims.padding.top - 6);
    }

    // 5. Debt-Free Payoff Pin
    if (this.strategy.length > 0) {
      const last = this.strategy[this.strategy.length - 1]!;
      const pinX = getX(last.period);
      const pinY = getY(last.balance);

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(pinX, pinY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`Debt Free (${last.dateLabel})`, pinX - 8, pinY - 8);
    }

    // 6. Interactive Hover Crosshair & Tooltip
    if (this.hoverIndex !== null && this.strategy[this.hoverIndex]) {
      const row = this.strategy[this.hoverIndex]!;
      const hX = getX(row.period);
      const hY = getY(row.balance);

      // Vertical line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hX, dims.padding.top);
      ctx.lineTo(hX, dims.padding.top + dims.plotHeight);
      ctx.stroke();

      // Dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hX, hY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip Card
      const tipText1 = `${row.dateLabel} (Month ${row.period})`;
      const tipText2 = `Balance: ${formatCurrency(row.balance, this.country)}`;
      const tipText3 = `Principal: ${formatCurrency(row.principal, this.country)}`;

      ctx.font = '10px JetBrains Mono, monospace';
      const tipW = Math.max(ctx.measureText(tipText1).width, ctx.measureText(tipText2).width) + 20;
      const tipH = 46;
      let tipX = hX + 12;
      if (tipX + tipW > dims.width - 10) tipX = hX - tipW - 12;
      let tipY = hY - tipH / 2;
      if (tipY < dims.padding.top) tipY = dims.padding.top;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tipX, tipY, tipW, tipH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText(tipText1, tipX + 10, tipY + 16);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(tipText2, tipX + 10, tipY + 30);

      ctx.fillStyle = '#10b981';
      ctx.fillText(tipText3, tipX + 10, tipY + 42);
    }
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
