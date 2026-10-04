/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Scenario Sandbox & Profiles Manager Modal
 *
 * Allows borrowers to save, clone, switch, and compare multiple financial scenarios:
 * - Save active setup as named scenario profile
 * - Duplicate scenario for experimentation
 * - Compare Mode: overlay delta badges and comparative analysis
 */

import { Store } from './store.js';
import { Profile } from '../core/types.js';
import { formatCurrency } from '../core/formatters.js';

export class SandboxModal {
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
      <div class="qr-modal-card" style="max-width: 560px;">
        <div class="qr-modal-header">
          <div style="font-weight: 800; font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>Scenario Sandbox & Profiles</span>
          </div>
          <button class="qr-modal-close" id="btn-close-sandbox-modal">&times;</button>
        </div>

        <div style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">
          Create and compare multiple financial scenarios (e.g. 15-Yr vs 30-Yr, Aggressive Prepayment vs Status Quo, Rental Property vs Primary Residence).
        </div>

        <!-- Create Profile Input -->
        <div style="display: flex; gap: 8px;">
          <input type="text" id="sandbox-new-name" class="form-input" placeholder="New Scenario Name (e.g. Aggressive 10-Yr Paydown)" style="flex: 1;" />
          <button class="studio-btn primary small" id="btn-save-as-new-profile" style="white-space: nowrap;">
            + Save As New
          </button>
        </div>

        <!-- Profiles List -->
        <div id="sandbox-profiles-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto;">
          <!-- Injected via renderProfiles() -->
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px;">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 0.78rem;">
            <input type="checkbox" id="chk-compare-mode" style="accent-color: var(--accent-cyan); cursor: pointer;" />
            <label for="chk-compare-mode" style="cursor: pointer; color: var(--text-primary);">
              Enable Side-by-Side Comparison Mode
            </label>
          </div>
          <button class="studio-btn small" id="btn-done-sandbox-modal">Done</button>
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
    this.renderProfiles();
  }

  public close() {
    if (!this.modal) return;
    this.isOpen = false;
    this.modal.style.display = 'none';
  }

  private renderProfiles() {
    const container = this.modal?.querySelector('#sandbox-profiles-list');
    const chkCompare = this.modal?.querySelector('#chk-compare-mode') as HTMLInputElement | null;
    if (!container) return;

    const state = this.store.getState();
    const profiles = Object.values(state.profiles);
    const activeId = state.activeProfileId;
    const compId = state.comparisonProfileId;

    if (chkCompare) {
      chkCompare.checked = !!state.compareModeActive;
    }

    container.innerHTML = profiles
      .map((p) => {
        const isActive = p.id === activeId;
        const isComp = p.id === compId;
        const loanBal = p.inputs.homePrice - p.inputs.downPayment;

        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: var(--radius-md); background: ${isActive ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.02)'}; border: 1px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-color)'};">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="color: ${isActive ? '#38bdf8' : '#ffffff'}; font-size: 0.85rem;">${p.name}</strong>
                ${isActive ? `<span style="font-size: 0.65rem; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Active</span>` : ''}
                ${isComp ? `<span style="font-size: 0.65rem; background: rgba(168, 85, 247, 0.2); color: #a855f7; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Comparing</span>` : ''}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-secondary);" class="mono">
                ${formatCurrency(loanBal, p.inputs.country)} • ${p.inputs.annualRate}% APR • ${p.inputs.amortizationYears} Yrs • ${p.inputs.frequency}
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
              ${
                !isActive
                  ? `<button class="studio-btn small select-profile-btn" data-id="${p.id}">Load</button>`
                  : ''
              }
              <button class="studio-btn small duplicate-profile-btn" data-id="${p.id}" title="Duplicate Scenario">
                Copy
              </button>
              ${
                !isActive && profiles.length > 1
                  ? `<button class="studio-btn small delete-profile-btn" data-id="${p.id}" style="color: #f43f5e;" title="Delete">&times;</button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    // Bind item buttons
    container.querySelectorAll('.select-profile-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) {
          const s = this.store.getState();
          s.activeProfileId = id;
          this.store.updateInputs({}, true);
          this.renderProfiles();
        }
      });
    });

    container.querySelectorAll('.duplicate-profile-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        const s = this.store.getState();
        const src = id ? s.profiles[id] : null;
        if (src) {
          const newId = `profile-${Date.now()}`;
          const newProfile: Profile = {
            id: newId,
            name: `${src.name} (Copy)`,
            createdAt: Date.now(),
            inputs: JSON.parse(JSON.stringify(src.inputs))
          };
          s.profiles[newId] = newProfile;
          s.activeProfileId = newId;
          this.store.updateInputs({}, true);
          this.renderProfiles();
        }
      });
    });

    container.querySelectorAll('.delete-profile-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        const s = this.store.getState();
        if (id && s.profiles[id] && Object.keys(s.profiles).length > 1) {
          delete s.profiles[id];
          if (s.activeProfileId === id) {
            s.activeProfileId = Object.keys(s.profiles)[0]!;
          }
          this.store.updateInputs({}, true);
          this.renderProfiles();
        }
      });
    });
  }

  private bindEvents() {
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    this.modal?.querySelector('#btn-close-sandbox-modal')?.addEventListener('click', () => this.close());
    this.modal?.querySelector('#btn-done-sandbox-modal')?.addEventListener('click', () => this.close());

    // Save as new
    this.modal?.querySelector('#btn-save-as-new-profile')?.addEventListener('click', () => {
      const nameInput = this.modal?.querySelector('#sandbox-new-name') as HTMLInputElement | null;
      const name = nameInput?.value.trim() || `Scenario ${Date.now().toString().slice(-4)}`;
      const s = this.store.getState();
      const newId = `profile-${Date.now()}`;
      s.profiles[newId] = {
        id: newId,
        name,
        createdAt: Date.now(),
        inputs: JSON.parse(JSON.stringify(this.store.getInputs()))
      };
      s.activeProfileId = newId;
      this.store.updateInputs({}, true);
      if (nameInput) nameInput.value = '';
      this.renderProfiles();
    });

    // Compare mode toggle
    const chkCompare = this.modal?.querySelector('#chk-compare-mode') as HTMLInputElement | null;
    chkCompare?.addEventListener('change', (e) => {
      const s = this.store.getState();
      s.compareModeActive = (e.target as HTMLInputElement).checked;
      if (s.compareModeActive && !s.comparisonProfileId) {
        // Pick another profile to compare against
        const keys = Object.keys(s.profiles).filter((k) => k !== s.activeProfileId);
        s.comparisonProfileId = keys[0] || null;
      }
      this.store.updateInputs({}, true);
      this.renderProfiles();
    });
  }
}
