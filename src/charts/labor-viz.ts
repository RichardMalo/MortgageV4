/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Career Labor Converter & Vampire Drain Interactive Visualizer
 *
 * Implements the 5 views:
 * 1. Bank Wages (Hours & working days dedicated to bank profit)
 * 2. Dead Rent Equivalent
 * 3. Rent + Carrying Costs (Tax + Ins)
 * 4. Multi-Year Proportions
 * 5. Freedom Day Horizon (Exact calendar day each month where borrower stops working for the bank)
 */

import { CareerLaborMetrics } from '../core/types.js';
import { formatCurrency } from '../core/formatters.js';

export interface LaborVizProps {
  container: HTMLElement;
  metrics: CareerLaborMetrics;
  country?: string;
  activeView?: 'wages' | 'rent' | 'rent-tax-ins' | 'calendar' | 'days-owned';
  onViewChange?: (view: 'wages' | 'rent' | 'rent-tax-ins' | 'calendar' | 'days-owned') => void;
}

export class LaborViz {
  private container: HTMLElement;
  private metrics: CareerLaborMetrics | null = null;
  private country = 'CA';
  private activeView: 'wages' | 'rent' | 'rent-tax-ins' | 'calendar' | 'days-owned' = 'days-owned';
  private onViewChangeCallback?: (view: 'wages' | 'rent' | 'rent-tax-ins' | 'calendar' | 'days-owned') => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(props: LaborVizProps) {
    this.metrics = props.metrics;
    this.country = props.country || 'CA';
    if (props.activeView) this.activeView = props.activeView;
    this.onViewChangeCallback = props.onViewChange;

    this.draw();
  }

  private draw() {
    if (!this.metrics) return;

    const m = this.metrics;
    const freedomDay = m.freedomDayOfMonth; // e.g. 18

    this.container.innerHTML = `
      <div class="labor-viz-wrapper" style="display: flex; flex-direction: column; gap: 14px; width: 100%;">
        <!-- View Toggle Pills -->
        <div class="labor-view-selector" style="display: flex; flex-wrap: wrap; gap: 6px; background: rgba(0,0,0,0.25); padding: 4px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
          <button class="labor-pill-btn ${this.activeView === 'days-owned' ? 'active' : ''}" data-view="days-owned" style="flex: 1; min-width: 100px; padding: 6px 10px; font-size: 0.72rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.2s;">
            Freedom Day
          </button>
          <button class="labor-pill-btn ${this.activeView === 'wages' ? 'active' : ''}" data-view="wages" style="flex: 1; min-width: 100px; padding: 6px 10px; font-size: 0.72rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.2s;">
            Bank Labor
          </button>
          <button class="labor-pill-btn ${this.activeView === 'rent' ? 'active' : ''}" data-view="rent" style="flex: 1; min-width: 100px; padding: 6px 10px; font-size: 0.72rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.2s;">
            Dead Rent
          </button>
          <button class="labor-pill-btn ${this.activeView === 'rent-tax-ins' ? 'active' : ''}" data-view="rent-tax-ins" style="flex: 1; min-width: 100px; padding: 6px 10px; font-size: 0.72rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.2s;">
            Carrying Total
          </button>
        </div>

        <!-- View Content -->
        <div class="labor-view-content" style="padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);">
          ${this.renderViewContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderViewContent(): string {
    if (!this.metrics) return '';
    const m = this.metrics;

    switch (this.activeView) {
      case 'days-owned': {
        // Render 30-day monthly time-share calendar
        const days = Array.from({ length: 30 }, (_, i) => i + 1);
        return `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <div>
                <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; font-weight: 700;">Monthly Freedom Day</span>
                <div style="font-size: 1.4rem; font-weight: 800; color: #10b981; font-family: 'JetBrains Mono', monospace;">
                  Day ${m.freedomDayOfMonth} of 30
                </div>
              </div>
              <div style="font-size: 0.78rem; text-align: right; opacity: 0.8;">
                <span style="color: #f43f5e; font-weight: 700;">${m.freedomDayOfMonth} Days</span> for Bank<br/>
                <span style="color: #10b981; font-weight: 700;">${30 - m.freedomDayOfMonth} Days</span> for Yourself
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 6px;">
              ${days
                .map((d) => {
                  const isBank = d <= m.freedomDayOfMonth;
                  const bg = isBank ? 'rgba(244, 63, 94, 0.18)' : 'rgba(16, 185, 129, 0.22)';
                  const border = isBank ? 'rgba(244, 63, 94, 0.4)' : 'rgba(16, 185, 129, 0.5)';
                  const color = isBank ? '#f43f5e' : '#10b981';
                  const label = d === m.freedomDayOfMonth ? '🏁' : d;
                  return `
                    <div style="height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 6px; background: ${bg}; border: 1px solid ${border}; font-size: 0.75rem; font-weight: 700; color: ${color}; font-family: monospace;">
                      ${label}
                    </div>
                  `;
                })
                .join('')}
            </div>
            <div style="font-size: 0.75rem; opacity: 0.65; margin-top: 4px; text-align: center;">
              From Day 1 to ${m.freedomDayOfMonth}, your monthly paycheck pays interest. After Day ${m.freedomDayOfMonth}, you build pure equity.
            </div>
          </div>
        `;
      }

      case 'wages': {
        const yearsEquivalent = (m.totalDaysWorkedForBank / 250).toFixed(1);
        return `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; font-weight: 700;">Career Labor Donated to Bank</span>
            <div style="display: flex; gap: 20px; align-items: baseline;">
              <div>
                <div style="font-size: 1.8rem; font-weight: 800; color: #f43f5e; font-family: 'JetBrains Mono', monospace;">
                  ${m.totalDaysWorkedForBank.toLocaleString()}
                </div>
                <div style="font-size: 0.75rem; opacity: 0.7;">Working Days (${yearsEquivalent} Career Years)</div>
              </div>
              <div>
                <div style="font-size: 1.4rem; font-weight: 800; color: #f8fafc; font-family: 'JetBrains Mono', monospace;">
                  ${m.totalHoursWorkedForBank.toLocaleString()}
                </div>
                <div style="font-size: 0.75rem; opacity: 0.7;">Total Labor Hours</div>
              </div>
            </div>
            <div style="font-size: 0.78rem; opacity: 0.75; margin-top: 6px; line-height: 1.4;">
              Based on your household income, you will spend over <strong>${m.totalDaysWorkedForBank} full 8-hour workdays</strong> generating profit for the lending institution.
            </div>
          </div>
        `;
      }

      case 'rent': {
        return `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; font-weight: 700;">Dead Rent Equivalent</span>
            <div style="font-size: 1.8rem; font-weight: 800; color: #f43f5e; font-family: 'JetBrains Mono', monospace;">
              ${formatCurrency(m.monthlyDeadRent, this.country)} <span style="font-size: 0.9rem; opacity: 0.7; font-weight: 500;">/ Month</span>
            </div>
            <div style="font-size: 0.78rem; opacity: 0.75; line-height: 1.4;">
              Even though you own the property, your first-year mortgage interest equates to paying <strong>${formatCurrency(m.monthlyDeadRent, this.country)}</strong> every single month in unrecoverable "rent" to the bank.
            </div>
          </div>
        `;
      }

      case 'rent-tax-ins':
      default: {
        return `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; font-weight: 700;">Total Monthly Carrying Cost</span>
            <div style="font-size: 1.8rem; font-weight: 800; color: #fb7185; font-family: 'JetBrains Mono', monospace;">
              ${formatCurrency(m.monthlyRentPlusCarrying, this.country)} <span style="font-size: 0.9rem; opacity: 0.7; font-weight: 500;">/ Month</span>
            </div>
            <div style="font-size: 0.78rem; opacity: 0.75; line-height: 1.4;">
              Combined monthly unrecoverable outflow: Bank Interest (${formatCurrency(m.monthlyDeadRent, this.country)}) + Property Taxes & Home Insurance.
            </div>
          </div>
        `;
      }
    }
  }

  private bindEvents() {
    const buttons = this.container.querySelectorAll('.labor-pill-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const view = (e.currentTarget as HTMLElement).getAttribute('data-view') as any;
        if (view) {
          this.activeView = view;
          this.draw();
          if (this.onViewChangeCallback) this.onViewChangeCallback(view);
        }
      });
    });
  }
}
