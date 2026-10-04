/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Monthly Payment Composition Donut Micro-Chart
 *
 * Lightweight SVG/Canvas Donut chart displaying:
 * - Principal (emerald)
 * - Interest (rose)
 * - Taxes (amber)
 * - Home Insurance (purple)
 * - HOA / Condo Fee (teal)
 * - PMI (pink)
 * - Extra Principal Surplus (cyan)
 * Features centered total payment readout and interactive segment legend.
 */

import { formatCurrency } from '../core/formatters.js';

export interface PaymentDonutProps {
  container: HTMLElement;
  principal: number;
  interest: number;
  tax?: number;
  insurance?: number;
  hoa?: number;
  pmi?: number;
  extra?: number;
  country?: string;
}

interface DonutSlice {
  label: string;
  amount: number;
  color: string;
  pct: number;
}

export class PaymentDonutChart {
  private container: HTMLElement;
  private country = 'CA';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(props: PaymentDonutProps) {
    this.container = props.container;
    this.country = props.country || 'CA';

    const slicesRaw: Array<{ label: string; amount: number; color: string }> = [
      { label: 'Principal', amount: Math.max(0, props.principal || 0), color: '#10b981' },
      { label: 'Interest', amount: Math.max(0, props.interest || 0), color: '#f43f5e' },
      { label: 'Property Tax', amount: Math.max(0, props.tax || 0), color: '#f59e0b' },
      { label: 'Insurance', amount: Math.max(0, props.insurance || 0), color: '#a855f7' },
      { label: 'HOA / Fees', amount: Math.max(0, props.hoa || 0), color: '#14b8a6' },
      { label: 'PMI', amount: Math.max(0, props.pmi || 0), color: '#ec4899' },
      { label: 'Extra Surplus', amount: Math.max(0, props.extra || 0), color: '#06b6d4' }
    ];

    const activeSlices = slicesRaw.filter((s) => s.amount > 0.009);
    const total = activeSlices.reduce((sum, s) => sum + s.amount, 0);

    const slices: DonutSlice[] = activeSlices.map((s) => ({
      ...s,
      pct: total > 0 ? (s.amount / total) * 100 : 0
    }));

    // SVG parameters
    const size = 220;
    const strokeWidth = 24;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    let accumulatedPct = 0;
    const paths = slices.map((slice) => {
      const dashLength = (slice.pct / 100) * circumference;
      const spaceLength = circumference - dashLength;
      const strokeDashoffset = -((accumulatedPct / 100) * circumference);
      accumulatedPct += slice.pct;

      return `
        <circle
          cx="${center}"
          cy="${center}"
          r="${radius}"
          fill="none"
          stroke="${slice.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${dashLength} ${spaceLength}"
          stroke-dashoffset="${strokeDashoffset}"
          style="transition: stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease;"
        >
          <title>${slice.label}: ${formatCurrency(slice.amount, this.country)} (${slice.pct.toFixed(1)}%)</title>
        </circle>
      `;
    });

    const legendHtml = slices
      .map(
        (s) => `
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${s.color};"></span>
            <span style="color: var(--text-secondary);">${s.label}</span>
          </div>
          <span class="mono font-semibold" style="color: #ffffff;">${formatCurrency(s.amount, this.country)}</span>
        </div>
      `
      )
      .join('');

    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%;">
        <div style="position: relative; width: ${size}px; height: ${size}px;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg); overflow: visible;">
            <!-- Background track -->
            <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}" />
            ${paths.join('')}
          </svg>
          <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
            <span style="font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); font-weight: 700;">Periodic Total</span>
            <span class="mono font-bold" style="font-size: 1.3rem; color: #ffffff;">${formatCurrency(total, this.country)}</span>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 5px; width: 100%; max-width: 260px; padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid var(--border-color);">
          ${legendHtml}
        </div>
      </div>
    `;
  }
}
