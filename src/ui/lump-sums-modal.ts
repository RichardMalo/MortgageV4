/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Scheduled Future Lump Sums Manager Modal
 *
 * Allows borrowers to schedule one-off or recurring future principal injections:
 * - Payment Number or Calendar Month
 * - Amount ($)
 * - Custom Label ("Annual Bonus", "Tax Refund", "Inheritance")
 * - Recurring Yearly toggle
 * Calculates kinetic savings and displays scheduled injections in real-time.
 */

import { Store } from './store.js';
import { LumpSumItem } from '../core/types.js';
import { formatCurrency, getRowDateLabel } from '../core/formatters.js';

export class LumpSumsModal {
  private store: Store;
  private modal: HTMLElement | null = null;
  private isOpen = false;

  constructor(store: Store) {
    this.store = store;
    this.createDom();
  }

  private createDom() {
    this.modal = document.createElement('div');
    this.modal.className = 'command-palette-backdrop';
    this.modal.style.display = 'none';

    this.modal.innerHTML = `
      <div class="qr-modal-card" style="max-width: 600px;">
        <div class="qr-modal-header">
          <div style="font-weight: 800; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <span>Scheduled Future Lump Sums</span>
          </div>
          <button class="qr-modal-close" id="btn-close-lump-modal">&times;</button>
        </div>

        <div style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">
          Schedule future one-off or recurring principal lump sums (e.g. annual work bonus, tax refunds, or inheritance) to accelerate equity build-up.
        </div>

        <!-- Add Lump Sum Form -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; align-items: end; background: rgba(0,0,0,0.25); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div class="form-group">
            <label class="form-label" for="lump-input-amount">Amount</label>
            <div class="form-input-wrapper">
              <span class="form-input-prefix">$</span>
              <input type="number" id="lump-input-amount" class="form-input has-prefix" placeholder="5000" min="100" step="500" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="lump-input-month">At Month</label>
            <input type="number" id="lump-input-month" class="form-input" placeholder="12" min="1" max="480" />
          </div>

          <div class="form-group">
            <label class="form-label" for="lump-input-label">Label (Optional)</label>
            <input type="text" id="lump-input-label" class="form-input" placeholder="Annual Bonus" />
          </div>

          <div>
            <button class="studio-btn primary small" id="btn-add-lump-sum" style="height: 36px; padding: 0 14px;">
              + Add
            </button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.78rem; padding: 0 4px;">
          <input type="checkbox" id="lump-input-repeat" style="accent-color: var(--accent-cyan); cursor: pointer;" />
          <label for="lump-input-repeat" style="cursor: pointer; color: var(--text-primary);">
            Repeat this lump sum yearly (every 12 months) until payoff
          </label>
        </div>

        <!-- Lump Sums List -->
        <div id="lump-sums-table-container" style="max-height: 240px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
          <!-- Injected via renderList() -->
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px;">
          <div id="lump-sums-total-badge" class="mono text-cyan font-bold" style="font-size: 0.85rem;">
            Total Scheduled: $0
          </div>
          <button class="studio-btn small" id="btn-done-lump-modal">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);
    this.bindEvents();
  }

  public open() {
    if (!this.modal) return;
    this.isOpen = true;
    this.modal.style.display = 'flex';
    this.renderList();
  }

  public close() {
    if (!this.modal) return;
    this.isOpen = false;
    this.modal.style.display = 'none';
  }

  private renderList() {
    const container = this.modal?.querySelector('#lump-sums-table-container');
    const totalBadge = this.modal?.querySelector('#lump-sums-total-badge');
    if (!container) return;

    const inputs = this.store.getInputs();
    const lumpSums = inputs.lumpSums || [];

    if (lumpSums.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; font-size: 0.8rem; color: var(--text-muted);">
          No future lump sums scheduled yet. Add one above!
        </div>
      `;
      if (totalBadge) totalBadge.textContent = 'Total Scheduled: $0';
      return;
    }

    const totalScheduled = lumpSums.reduce((sum, item) => sum + (item.amount || 0), 0);
    if (totalBadge) {
      totalBadge.textContent = `Total Scheduled: ${formatCurrency(totalScheduled, inputs.country)} (${lumpSums.length} items)`;
    }

    const rowsHtml = lumpSums
      .map((item, idx) => {
        const month = item.atMonth || item.paymentNumber || 1;
        const dateLabel = getRowDateLabel(inputs.startDate, month, 12);
        const repeatBadge = item.repeatYearly
          ? `<span style="font-size: 0.65rem; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Yearly</span>`
          : '';

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem;">
            <div>
              <div style="font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 6px;">
                <span>${item.label || 'Lump Sum'}</span>
                ${repeatBadge}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">
                Month ${month} (${dateLabel})
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="mono font-bold text-emerald">${formatCurrency(item.amount, inputs.country)}</span>
              <button class="studio-btn small delete-lump-btn" data-index="${idx}" style="color: #f43f5e; padding: 2px 6px;">
                &times;
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = rowsHtml;

    // Delete buttons
    const delBtns = container.querySelectorAll('.delete-lump-btn');
    delBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0', 10);
        const curList = [...(this.store.getInputs().lumpSums || [])];
        curList.splice(idx, 1);
        this.store.updateInputs({ lumpSums: curList });
        this.renderList();
      });
    });
  }

  private bindEvents() {
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    this.modal?.querySelector('#btn-close-lump-modal')?.addEventListener('click', () => this.close());
    this.modal?.querySelector('#btn-done-lump-modal')?.addEventListener('click', () => this.close());

    const addBtn = this.modal?.querySelector('#btn-add-lump-sum');
    addBtn?.addEventListener('click', () => {
      const amountInput = this.modal?.querySelector('#lump-input-amount') as HTMLInputElement | null;
      const monthInput = this.modal?.querySelector('#lump-input-month') as HTMLInputElement | null;
      const labelInput = this.modal?.querySelector('#lump-input-label') as HTMLInputElement | null;
      const repeatInput = this.modal?.querySelector('#lump-input-repeat') as HTMLInputElement | null;

      const amount = parseFloat(amountInput?.value || '0');
      const month = parseInt(monthInput?.value || '12', 10);
      const label = labelInput?.value.trim() || 'Scheduled Lump Sum';
      const repeatYearly = !!repeatInput?.checked;

      if (amount <= 0 || month <= 0) return;

      const newItem: LumpSumItem = {
        id: `lump-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        amount,
        paymentNumber: month,
        atMonth: month,
        label,
        repeatYearly
      };

      const curList = [...(this.store.getInputs().lumpSums || []), newItem];
      this.store.updateInputs({ lumpSums: curList });

      if (amountInput) amountInput.value = '';
      if (labelInput) labelInput.value = '';
      if (repeatInput) repeatInput.checked = false;

      this.renderList();
    });
  }
}
