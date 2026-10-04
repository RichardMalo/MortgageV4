/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Annual Cash Flow Stacked Bar Micro-Chart
 *
 * Visualizes annual outlays partitioned by calendar year:
 * - Principal repaid (emerald)
 * - Interest paid (rose)
 * - Extra prepayments (cyan)
 * - Escrow / PITI expenses (amber)
 * Includes interactive hover tooltips detailing year totals.
 */

import { ScheduleRow } from '../core/types.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';
import { formatCurrency } from '../core/formatters.js';

export interface AnnualCashFlowProps {
  container: HTMLElement;
  schedule: ScheduleRow[];
  usePiti?: boolean;
  country?: string;
}

interface YearData {
  year: number;
  principal: number;
  interest: number;
  extra: number;
  escrow: number;
  total: number;
}

export class AnnualCashFlowChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private schedule: ScheduleRow[] = [];
  private usePiti = true;
  private country = 'CA';
  private resizeObserver: ResizeObserver;
  private hoveredYearIndex: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'pointer';

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.container);

    this.bindEvents();
  }

  public render(props: AnnualCashFlowProps) {
    this.schedule = props.schedule;
    this.usePiti = props.usePiti !== false;
    this.country = props.country || 'CA';
    this.draw();
  }

  private aggregateByYear(): YearData[] {
    const map = new Map<number, YearData>();

    this.schedule.forEach((row) => {
      const yr = row.calendarYear || row.year;
      let existing = map.get(yr);
      if (!existing) {
        existing = { year: yr, principal: 0, interest: 0, extra: 0, escrow: 0, total: 0 };
        map.set(yr, existing);
      }
      existing.principal += row.principal;
      existing.interest += row.interest;
      existing.extra += row.extra || 0;
      if (this.usePiti) existing.escrow += row.escrow || 0;
      existing.total = existing.principal + existing.interest + existing.extra + existing.escrow;
    });

    return Array.from(map.values()).sort((a, b) => a.year - b.year);
  }

  private bindEvents() {
    const handleMove = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const dims = getChartDimensions(this.container, 250);
      const years = this.aggregateByYear();
      if (years.length === 0) return;

      const relX = x - dims.padding.left;
      const slotWidth = dims.plotWidth / years.length;
      const idx = Math.floor(relX / slotWidth);

      this.hoveredYearIndex = idx >= 0 && idx < years.length ? idx : null;
      this.draw();
    };

    this.canvas.addEventListener('mousemove', (e) => handleMove(e.clientX));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredYearIndex = null;
      this.draw();
    });

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX);
      },
      { passive: true }
    );
    this.canvas.addEventListener('touchend', () => {
      this.hoveredYearIndex = null;
      this.draw();
    });
  }

  private draw() {
    const dims = getChartDimensions(this.container, 250);
    const ctx = initHiDpiCanvas(this.canvas, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);
    const years = this.aggregateByYear();
    if (years.length === 0) return;

    const maxTotal = Math.max(...years.map((y) => y.total), 1);
    const slotWidth = dims.plotWidth / years.length;
    const barWidth = Math.max(4, Math.min(28, slotWidth * 0.72));

    const getY = (val: number) =>
      dims.padding.top + dims.plotHeight - (val / maxTotal) * dims.plotHeight;

    // 1. Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= 4; i++) {
      const yVal = (maxTotal / 4) * i;
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

    // 2. Render Stacked Bars for each year
    years.forEach((yd, idx) => {
      const centerX = dims.padding.left + idx * slotWidth + slotWidth / 2;
      const barX = centerX - barWidth / 2;
      const isHovered = idx === this.hoveredYearIndex;

      let currentStackY = dims.padding.top + dims.plotHeight;

      const drawSegment = (amount: number, color: string) => {
        if (amount <= 0) return;
        const segHeight = (amount / maxTotal) * dims.plotHeight;
        currentStackY -= segHeight;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(barX, currentStackY, barWidth, segHeight, [2, 2, 0, 0]);
        ctx.fill();
      };

      // Segments: 1) Escrow, 2) Principal, 3) Extra, 4) Interest
      if (yd.escrow > 0) drawSegment(yd.escrow, isHovered ? '#fbbf24' : '#f59e0b');
      drawSegment(yd.principal, isHovered ? '#34d399' : '#10b981');
      if (yd.extra > 0) drawSegment(yd.extra, isHovered ? '#67e8f9' : '#06b6d4');
      drawSegment(yd.interest, isHovered ? '#fb7185' : '#f43f5e');

      // X-Axis Year Labels (display every Nth year so labels don't collide)
      const step = years.length > 20 ? 5 : years.length > 10 ? 2 : 1;
      if (idx % step === 0 || idx === years.length - 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(yd.year), centerX, dims.padding.top + dims.plotHeight + 14);
      }
    });

    // 3. Tooltip for hovered year
    if (this.hoveredYearIndex !== null && years[this.hoveredYearIndex]) {
      const yd = years[this.hoveredYearIndex]!;
      const centerX = dims.padding.left + this.hoveredYearIndex * slotWidth + slotWidth / 2;

      const t1 = `Year ${yd.year}`;
      const t2 = `Interest: ${formatCurrency(yd.interest, this.country)}`;
      const t3 = `Principal: ${formatCurrency(yd.principal, this.country)}`;
      const t4 = yd.extra > 0 ? `Extra: ${formatCurrency(yd.extra, this.country)}` : '';
      const t5 = yd.escrow > 0 ? `Escrow: ${formatCurrency(yd.escrow, this.country)}` : '';
      const tTot = `Total: ${formatCurrency(yd.total, this.country)}`;

      ctx.font = '10px JetBrains Mono, monospace';
      const tipW = 160;
      const lines = [t1, t2, t3, t4, t5, tTot].filter(Boolean);
      const tipH = lines.length * 14 + 10;
      let tipX = centerX + 12;
      if (tipX + tipW > dims.width - 10) tipX = centerX - tipW - 12;
      let tipY = dims.padding.top + 10;

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
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(t2, tipX + 10, currY);

      currY += 14;
      ctx.fillStyle = '#10b981';
      ctx.fillText(t3, tipX + 10, currY);

      if (t4) {
        currY += 14;
        ctx.fillStyle = '#06b6d4';
        ctx.fillText(t4, tipX + 10, currY);
      }
      if (t5) {
        currY += 14;
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(t5, tipX + 10, currY);
      }

      currY += 14;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(tTot, tipX + 10, currY);
    }
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
