/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Virtualized / Progressive Chunked Amortization Schedule Ledger Table
 */

import { ScheduleRow } from '../core/types.js';
import { formatCurrency } from '../core/formatters.js';

export class LedgerTable {
  private container: HTMLElement;
  private schedule: ScheduleRow[] = [];
  private termYears = 5;
  private country = 'CA';
  private renderedCount = 0;
  private chunkSize = 75;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(schedule: ScheduleRow[], termYears = 5, country = 'CA') {
    this.schedule = schedule;
    this.termYears = termYears;
    this.country = country;
    this.renderedCount = 0;

    this.container.innerHTML = `
      <div class="ledger-table-card">
        <div class="ledger-table-header">
          <div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #f8fafc;">Full Amortization Schedule Ledger</div>
            <div style="font-size: 0.75rem; opacity: 0.7;">Progressive Institutional-Grade Ledger (${this.schedule.length} Payments)</div>
          </div>
          <button id="ledger-export-csv-btn" class="studio-btn secondary small">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
        </div>

        <div class="ledger-scroll-container">
          <table class="ledger-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Payment</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Extra</th>
                <th>Balance</th>
                <th>LTV</th>
              </tr>
            </thead>
            <tbody id="ledger-tbody"></tbody>
          </table>
          <div id="ledger-load-more" style="text-align: center; padding: 12px; display: none;">
            <button class="studio-btn secondary small" id="ledger-more-btn">Load Next Payments</button>
          </div>
        </div>
      </div>
    `;

    this.renderNextChunk();
    this.bindEvents();
  }

  private renderNextChunk() {
    const tbody = this.container.querySelector('#ledger-tbody');
    const loadMoreContainer = this.container.querySelector('#ledger-load-more') as HTMLElement | null;
    if (!tbody) return;

    const termPeriods = Math.round(this.termYears * 12);
    const start = this.renderedCount;
    const end = Math.min(this.schedule.length, start + this.chunkSize);

    let html = '';
    for (let i = start; i < end; i++) {
      const row = this.schedule[i]!;

      // Insert Red Term Renewal Banner
      if (termPeriods > 0 && i === termPeriods) {
        html += `
          <tr class="term-renewal-banner-row">
            <td colspan="8">
              <div class="term-renewal-banner">
                🚩 Year ${this.termYears} Term Renewal Boundary — Interest Rate Reset
              </div>
            </td>
          </tr>
        `;
      }

      html += `
        <tr>
          <td class="mono font-bold">${row.period}</td>
          <td>${row.dateLabel}</td>
          <td class="mono font-semibold">${formatCurrency(row.payment, this.country)}</td>
          <td class="mono text-emerald">${formatCurrency(row.principal, this.country)}</td>
          <td class="mono text-rose">${formatCurrency(row.interest, this.country)}</td>
          <td class="mono text-cyan">${row.extra > 0 ? formatCurrency(row.extra, this.country) : '-'}</td>
          <td class="mono font-bold">${formatCurrency(row.balance, this.country)}</td>
          <td class="mono opacity-70">${row.ltv ? `${row.ltv.toFixed(1)}%` : '-'}</td>
        </tr>
      `;
    }

    tbody.insertAdjacentHTML('beforeend', html);
    this.renderedCount = end;

    if (loadMoreContainer) {
      loadMoreContainer.style.display = this.renderedCount < this.schedule.length ? 'block' : 'none';
    }
  }

  private bindEvents() {
    const moreBtn = this.container.querySelector('#ledger-more-btn');
    moreBtn?.addEventListener('click', () => this.renderNextChunk());

    const exportBtn = this.container.querySelector('#ledger-export-csv-btn');
    exportBtn?.addEventListener('click', () => this.exportCsv());
  }

  public exportCsv() {
    if (this.schedule.length === 0) return;

    const headers = ['Period', 'Date', 'Payment', 'Principal', 'Interest', 'Extra', 'Balance', 'LTV%'];
    const rows = this.schedule.map((r) => [
      r.period,
      `"${r.dateLabel}"`,
      r.payment.toFixed(2),
      r.principal.toFixed(2),
      r.interest.toFixed(2),
      r.extra.toFixed(2),
      r.balance.toFixed(2),
      r.ltv ? r.ltv.toFixed(2) : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `TrueMortgage_Studio_Schedule_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
