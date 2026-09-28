/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Refinancing Rate-Ladder Micro-Chart & Interactive Macro Scenarios Visualizer
 *
 * Supports direct touch and click-and-drag on renewal nodes:
 * - Touch/click any renewal point and drag vertically to adjust the renewal rate in real time.
 * - 0.05% magnetic snapping for banking precision.
 * - Fluid 120fps canvas rendering with glowing drag handles, vertical guidelines, and real-time tooltips.
 * - Directly recalculates the mortgage amortization schedule, monthly payment shifts, and ledger table.
 */

import { RenewalStep } from '../core/rate-shock.js';
import { formatAxisTick, getChartDimensions, initHiDpiCanvas } from './micro-chart-base.js';

export interface RateLadderChartProps {
  container: HTMLElement;
  initialRate: number;
  ladder: RenewalStep[];
  amortizationYears: number;
  onRateChange?: (year: number, newRate: number) => void;
}

export class RateLadderChart {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private initialRate = 4.89;
  private ladder: RenewalStep[] = [];
  private amortizationYears = 25;
  private onRateChangeCallback?: (year: number, newRate: number) => void;
  private resizeObserver: ResizeObserver;

  // Interaction state
  private hoveredYear: number | null = null;
  private draggingYear: number | null = null;
  private isPointerDown = false;
  private cachedMinRate = 1.0;
  private cachedMaxRate = 10.0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none'; // Prevent scrolling while dragging nodes
    this.canvas.style.userSelect = 'none';

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.container);
  }

  public render(props: RateLadderChartProps) {
    this.initialRate = props.initialRate;
    this.ladder = props.ladder;
    this.amortizationYears = props.amortizationYears;
    this.onRateChangeCallback = props.onRateChange;
    this.draw();
  }

  private bindEvents() {
    const getPos = (e: MouseEvent | Touch): { x: number; y: number } => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const handlePointerDown = (pos: { x: number; y: number }) => {
      const target = this.hitTest(pos.x, pos.y);
      if (target !== null) {
        this.draggingYear = target;
        this.isPointerDown = true;
        this.canvas.style.cursor = 'grabbing';
        this.draw();
      }
    };

    const handlePointerMove = (pos: { x: number; y: number }) => {
      if (this.isPointerDown && this.draggingYear !== null) {
        // Drag in progress: update rate
        const dims = getChartDimensions(this.container, 220, { top: 32, right: 30, bottom: 32, left: 45 });
        const clampedY = Math.max(dims.padding.top, Math.min(dims.padding.top + dims.plotHeight, pos.y));
        const relRatio = 1 - (clampedY - dims.padding.top) / dims.plotHeight;
        const rawRate = this.cachedMinRate + relRatio * (this.cachedMaxRate - this.cachedMinRate);
        const snappedRate = Math.round(rawRate * 20) / 20; // 0.05% snapping
        const clampedRate = Math.min(25.0, Math.max(0.1, snappedRate));

        // Update local step
        const step = this.ladder.find((s) => s.year === this.draggingYear);
        if (step) {
          step.rate = clampedRate;
          step.rateDelta = Math.round((clampedRate - this.initialRate) * 100) / 100;
        }

        this.draw();

        if (this.onRateChangeCallback) {
          this.onRateChangeCallback(this.draggingYear, clampedRate);
        }
      } else {
        // Hover test
        const target = this.hitTest(pos.x, pos.y);
        if (target !== this.hoveredYear) {
          this.hoveredYear = target;
          this.canvas.style.cursor = target !== null ? 'grab' : 'default';
          this.draw();
        }
      }
    };

    const handlePointerUp = () => {
      if (this.isPointerDown) {
        this.isPointerDown = false;
        this.draggingYear = null;
        this.canvas.style.cursor = this.hoveredYear !== null ? 'grab' : 'default';
        this.draw();
      }
    };

    // Mouse Events
    this.canvas.addEventListener('mousedown', (e) => handlePointerDown(getPos(e)));
    window.addEventListener('mousemove', (e) => handlePointerMove(getPos(e)));
    window.addEventListener('mouseup', handlePointerUp);

    // Touch Events
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches[0]) {
          const pos = getPos(e.touches[0]);
          const target = this.hitTest(pos.x, pos.y);
          if (target !== null) {
            e.preventDefault();
            handlePointerDown(pos);
          }
        }
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        if (this.isPointerDown && e.touches[0]) {
          e.preventDefault();
          handlePointerMove(getPos(e.touches[0]));
        }
      },
      { passive: false }
    );

    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);
  }

  /**
   * Hit test to find if (x, y) is near any renewal node circle
   */
  private hitTest(x: number, y: number): number | null {
    const dims = getChartDimensions(this.container, 220, { top: 32, right: 30, bottom: 32, left: 45 });
    const getX = (year: number) =>
      dims.padding.left + (year / (this.amortizationYears || 25)) * dims.plotWidth;
    const getY = (rate: number) =>
      dims.padding.top +
      dims.plotHeight -
      ((rate - this.cachedMinRate) / (this.cachedMaxRate - this.cachedMinRate || 1)) * dims.plotHeight;

    const hitRadius = 22; // Generous 22px touch radius

    for (const step of this.ladder) {
      const sX = getX(step.year);
      const sY = getY(step.rate);
      const dist = Math.hypot(x - sX, y - sY);
      if (dist <= hitRadius) {
        return step.year;
      }
    }
    return null;
  }

  private draw() {
    const dims = getChartDimensions(this.container, 220, { top: 32, right: 30, bottom: 32, left: 45 });
    const ctx = initHiDpiCanvas(this.canvas, dims.width, dims.height);
    if (!ctx) return;

    ctx.clearRect(0, 0, dims.width, dims.height);

    const allRates = [this.initialRate, ...this.ladder.map((s) => s.rate)];
    const minVal = Math.min(...allRates);
    const maxVal = Math.max(...allRates);

    // Provide ample vertical space for dragging
    this.cachedMinRate = Math.max(0, Math.floor(Math.min(minVal, 1.5) - 0.5));
    this.cachedMaxRate = Math.ceil(Math.max(maxVal, 9.5) + 1.5);

    const getX = (year: number) =>
      dims.padding.left + (year / (this.amortizationYears || 25)) * dims.plotWidth;
    const getY = (rate: number) =>
      dims.padding.top +
      dims.plotHeight -
      ((rate - this.cachedMinRate) / (this.cachedMaxRate - this.cachedMinRate || 1)) * dims.plotHeight;

    // 1. Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    const numTicks = 4;
    for (let i = 0; i <= numTicks; i++) {
      const r = this.cachedMinRate + (i / numTicks) * (this.cachedMaxRate - this.cachedMinRate);
      const y = getY(r);
      ctx.beginPath();
      ctx.moveTo(dims.padding.left, y);
      ctx.lineTo(dims.padding.left + dims.plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${r.toFixed(1)}%`, dims.padding.left - 6, y + 3);
    }
    ctx.setLineDash([]);

    // 2. Initial Contract Rate Reference Line
    const baseLineY = getY(this.initialRate);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(dims.padding.left, baseLineY);
    ctx.lineTo(dims.padding.left + dims.plotWidth, baseLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`Initial Contract: ${this.initialRate.toFixed(2)}%`, dims.padding.left + 8, baseLineY - 4);

    // 3. Stepped Ladder Path
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    let currentX = getX(0);
    let currentY = getY(this.initialRate);
    ctx.moveTo(currentX, currentY);

    this.ladder.forEach((step) => {
      const stepX = getX(step.year);
      ctx.lineTo(stepX, currentY);
      currentY = getY(step.rate);
      ctx.lineTo(stepX, currentY);
      currentX = stepX;
    });

    ctx.lineTo(dims.padding.left + dims.plotWidth, currentY);
    ctx.stroke();

    // 4. Instructions in top right
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('💡 Click & drag nodes up/down to simulate rate shocks', dims.width - dims.padding.right, dims.padding.top - 12);

    // 5. Draw Renewal Nodes & Drag Handles
    this.ladder.forEach((step) => {
      const sX = getX(step.year);
      const sY = getY(step.rate);
      const isHovered = this.hoveredYear === step.year;
      const isDragging = this.draggingYear === step.year;

      const nodeColor =
        step.rateDelta > 0 ? '#f43f5e' : step.rateDelta < 0 ? '#10b981' : '#38bdf8';

      // Vertical guide line if active
      if (isHovered || isDragging) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(sX, dims.padding.top);
        ctx.lineTo(sX, dims.padding.top + dims.plotHeight);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Outer glow pulse ring
      if (isDragging || isHovered) {
        ctx.fillStyle = isDragging ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(sX, sY, isDragging ? 20 : 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Main Handle Circle
      ctx.fillStyle = nodeColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = isDragging ? 2.5 : 2;
      ctx.beginPath();
      ctx.arc(sX, sY, isDragging ? 8 : isHovered ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tooltip / Rate Pill above node
      const deltaSign = step.rateDelta > 0 ? '+' : '';
      const deltaText = step.rateDelta !== 0 ? ` (${deltaSign}${step.rateDelta.toFixed(2)}%)` : '';
      const labelText = `Yr ${step.year}: ${step.rate.toFixed(2)}%${deltaText}`;

      ctx.font = isDragging ? 'bold 11px JetBrains Mono, monospace' : 'bold 9px JetBrains Mono, monospace';
      const textWidth = ctx.measureText(labelText).width;
      const pillW = textWidth + 14;
      const pillH = isDragging ? 22 : 18;
      const pillX = sX - pillW / 2;
      const pillY = sY - pillH - (isDragging ? 12 : 8);

      // Pill background
      ctx.fillStyle = isDragging ? 'rgba(15, 23, 42, 0.95)' : 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = isDragging ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx.fill();
      ctx.stroke();

      // Pill text
      ctx.fillStyle = isDragging ? '#38bdf8' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, sX, pillY + (isDragging ? 15 : 12));
    });
  }

  public destroy() {
    this.resizeObserver.disconnect();
  }
}
