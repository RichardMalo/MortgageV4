/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * The Living Balance Arc ("Vampire vs. Equity Arc")
 *
 * Replaces the old concentric circles with an interactive split-ring gauge
 * that visually balances Financed Principal against Lifetime Bank Interest Drag.
 * Features a timeline scrubber displaying how much of each dollar paid on that date
 * goes toward bank profit vs. real wealth.
 */

import { ScheduleRow, ScheduleSummary } from '../core/types.js';
import { formatCurrency } from '../core/formatters.js';

export interface LivingArcProps {
  container: HTMLElement;
  principal: number;
  totalInterest: number;
  schedule: ScheduleRow[];
  summary: ScheduleSummary;
  country?: string;
  onScrub?: (period: number, row: ScheduleRow) => void;
}

export class LivingArc {
  private container: HTMLElement;
  private principal = 0;
  private totalInterest = 0;
  private schedule: ScheduleRow[] = [];
  private country = 'CA';
  private activePeriod = 1;
  private onScrubCallback?: (period: number, row: ScheduleRow) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(props: LivingArcProps) {
    this.container = props.container;
    this.principal = Math.max(1, props.principal);
    this.totalInterest = Math.max(0, props.totalInterest);
    this.schedule = props.schedule;
    this.country = props.country || 'CA';
    this.onScrubCallback = props.onScrub;

    this.draw();
  }

  public scrubToPeriod(period: number) {
    this.activePeriod = Math.max(1, Math.min(this.schedule.length, period));
    this.updateReadout();
  }

  private draw() {
    const totalLifetime = this.principal + this.totalInterest;
    const principalPct = (this.principal / totalLifetime) * 100;
    const interestPct = (this.totalInterest / totalLifetime) * 100;
    const ratio = (this.totalInterest / this.principal).toFixed(2);

    // SVG parameters
    const size = 300;
    const strokeWidth = 26;
    const radius = (size - strokeWidth) / 2 - 10;
    const circumference = 2 * Math.PI * radius;

    // Split arc: 260 degrees arc with gap at bottom
    const arcDegrees = 260;
    const totalArcLength = (arcDegrees / 360) * circumference;

    const principalLength = (this.principal / totalLifetime) * totalArcLength;
    const interestLength = (this.totalInterest / totalLifetime) * totalArcLength;

    const currentRow = this.schedule[this.activePeriod - 1] || this.schedule[0];
    const pmt = currentRow ? currentRow.payment : 1;
    const principalShare = currentRow ? Math.min(1, Math.max(0, currentRow.principal / (currentRow.principal + currentRow.interest || 1))) : 0.4;
    const interestShare = 1 - principalShare;

    this.container.innerHTML = `
      <div class="living-arc-wrapper" style="position: relative; display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 360px; margin: 0 auto;">
        <svg viewBox="0 0 ${size} ${size}" class="living-arc-svg" style="width: 100%; height: auto; transform: rotate(140deg); overflow: visible;">
          <!-- Track background -->
          <circle
            cx="${size / 2}" cy="${size / 2}" r="${radius}"
            fill="none"
            stroke="var(--arc-track-color, rgba(255,255,255,0.06))"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${totalArcLength} ${circumference}"
            stroke-linecap="round"
          />

          <!-- Principal Financed Arc (Emerald / Real Wealth) -->
          <circle
            cx="${size / 2}" cy="${size / 2}" r="${radius}"
            fill="none"
            stroke="var(--arc-principal-color, #10b981)"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${principalLength} ${circumference}"
            stroke-dashoffset="0"
            stroke-linecap="round"
            style="filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.4)); transition: stroke-dasharray 0.4s ease;"
          />

          <!-- Interest Drag Arc (Rose / Vampire Drain) -->
          <circle
            cx="${size / 2}" cy="${size / 2}" r="${radius}"
            fill="none"
            stroke="var(--arc-interest-color, #f43f5e)"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${interestLength} ${circumference}"
            stroke-dashoffset="-${principalLength + 4}"
            stroke-linecap="round"
            style="filter: drop-shadow(0 0 8px rgba(244, 63, 94, 0.4)); transition: stroke-dasharray 0.4s ease;"
          />
        </svg>

        <!-- Center Kinetic Readout -->
        <div class="living-arc-center" style="position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%); text-align: center; pointer-events: none;">
          <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.65; font-weight: 700;">Lifetime Outflow</div>
          <div style="font-size: 1.65rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: var(--text-color, #f8fafc); margin: 2px 0;">
            ${formatCurrency(totalLifetime, this.country)}
          </div>
          <div class="arc-ratio-badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; background: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.25); font-size: 0.75rem; font-weight: 700; color: #f43f5e;">
            <span>$1 : $${ratio} Interest Drag</span>
          </div>
        </div>

        <!-- Interactive Dollar Scrubber Box -->
        <div class="arc-scrubber-card" style="width: 100%; margin-top: -24px; padding: 14px; border-radius: 14px; background: var(--card-bg, rgba(30, 41, 59, 0.7)); backdrop-filter: blur(12px); border: 1px solid var(--border-color, rgba(255,255,255,0.08));">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7;">
              Payment Breakdown Scrubber
            </div>
            <div id="arc-scrubber-date" style="font-size: 0.8rem; font-weight: 800; font-family: monospace; color: var(--primary-color, #38bdf8);">
              ${currentRow?.dateLabel || 'Period 1'}
            </div>
          </div>

          <!-- Dollar Distribution Meter -->
          <div style="position: relative; height: 12px; width: 100%; border-radius: 6px; overflow: hidden; display: flex; background: rgba(0,0,0,0.25); margin-bottom: 8px;">
            <div id="arc-meter-principal" style="width: ${(principalShare * 100).toFixed(1)}%; background: #10b981; transition: width 0.1s ease;"></div>
            <div id="arc-meter-interest" style="width: ${(interestShare * 100).toFixed(1)}%; background: #f43f5e; transition: width 0.1s ease;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; font-family: monospace;">
            <span style="color: #10b981;">Equity: <span id="arc-dollar-equity">$${(principalShare).toFixed(2)}</span> / $1</span>
            <span style="color: #f43f5e;">Bank Profit: <span id="arc-dollar-interest">$${(interestShare).toFixed(2)}</span> / $1</span>
          </div>

          <!-- Timeline Slider -->
          <input
            type="range"
            class="arc-timeline-slider"
            min="1"
            max="${Math.max(1, this.schedule.length)}"
            value="${this.activePeriod}"
            style="width: 100%; margin-top: 10px; cursor: pointer; accent-color: #38bdf8;"
            aria-label="Timeline Scrubber"
          />
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents() {
    const slider = this.container.querySelector('.arc-timeline-slider') as HTMLInputElement | null;
    if (!slider) return;

    slider.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      this.scrubToPeriod(val);
    });
  }

  private updateReadout() {
    const currentRow = this.schedule[this.activePeriod - 1] || this.schedule[0];
    if (!currentRow) return;

    const totalPortion = (currentRow.principal || 0) + (currentRow.interest || 0);
    const principalShare = totalPortion > 0 ? currentRow.principal / totalPortion : 0.5;
    const interestShare = Math.max(0, 1 - principalShare);

    const dateEl = this.container.querySelector('#arc-scrubber-date');
    if (dateEl) dateEl.textContent = currentRow.dateLabel || `Period ${currentRow.period}`;

    const meterP = this.container.querySelector('#arc-meter-principal') as HTMLElement | null;
    if (meterP) meterP.style.width = `${(principalShare * 100).toFixed(1)}%`;

    const meterI = this.container.querySelector('#arc-meter-interest') as HTMLElement | null;
    if (meterI) meterI.style.width = `${(interestShare * 100).toFixed(1)}%`;

    const eqEl = this.container.querySelector('#arc-dollar-equity');
    if (eqEl) eqEl.textContent = `$${principalShare.toFixed(2)}`;

    const intEl = this.container.querySelector('#arc-dollar-interest');
    if (intEl) intEl.textContent = `$${interestShare.toFixed(2)}`;

    if (this.onScrubCallback) {
      this.onScrubCallback(this.activePeriod, currentRow);
    }
  }
}
