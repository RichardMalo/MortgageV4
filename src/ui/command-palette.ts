/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Command Palette (Cmd/Ctrl + K Command Studio)
 */

import { Store } from './store.js';

export interface CommandItem {
  id: string;
  category: 'Stage' | 'Mode' | 'Macro' | 'Action' | 'Theme';
  title: string;
  subtitle: string;
  shortcut?: string;
  handler: () => void;
}

export class CommandPalette {
  private store: Store;
  private modal: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private list: HTMLElement | null = null;
  private isOpen = false;
  private selectedIndex = 0;
  private filteredCommands: CommandItem[] = [];
  private commands: CommandItem[] = [];

  constructor(store: Store, extraActions?: { onOpenGoalSolver?: () => void; onOpenHandoff?: () => void; onExportCsv?: () => void }) {
    this.store = store;
    this.initCommands(extraActions);
    this.createDom();
    this.bindGlobalShortcuts();
  }

  private initCommands(extraActions?: { onOpenGoalSolver?: () => void; onOpenHandoff?: () => void; onExportCsv?: () => void }) {
    this.commands = [
      {
        id: 'stage-pulse',
        category: 'Stage',
        title: 'Stage 1: The Pulse',
        subtitle: 'Casual / Quick 3-dial estimation and kinetic hero savings',
        shortcut: '1',
        handler: () => this.store.setStage('pulse')
      },
      {
        id: 'stage-lab',
        category: 'Stage',
        title: 'Stage 2: Strategy Lab',
        subtitle: 'Interactive scrubbers, Living Balance Arc, and S&P 500 opportunity cost',
        shortcut: '2',
        handler: () => this.store.setStage('lab')
      },
      {
        id: 'stage-engine',
        category: 'Stage',
        title: 'Stage 3: The Engine Room',
        subtitle: 'CMHC tiers, Rate-Shock Ladder, Closing Taxes, and full ledger',
        shortcut: '3',
        handler: () => this.store.setStage('engine')
      },
      {
        id: 'mode-mortgage',
        category: 'Mode',
        title: 'Switch to Residential Mortgage',
        subtitle: 'Fixed/variable residential loan paydown engine',
        handler: () => this.store.setMode('mortgage')
      },
      {
        id: 'mode-portfolio',
        category: 'Mode',
        title: 'Switch to Unified Household Portfolio',
        subtitle: 'Mortgage + Revolving Credit Cards + Auto Loans cascade balance sheet',
        handler: () => this.store.setMode('portfolio')
      },
      {
        id: 'macro-status-quo',
        category: 'Macro',
        title: 'Macro Scenario: Status Quo',
        subtitle: 'Hold interest rates constant across all future renewal terms',
        handler: () => this.store.updateInputs({ rateShockEnabled: false, rateShockPreset: 'status-quo' })
      },
      {
        id: 'macro-soft-landing',
        category: 'Macro',
        title: 'Macro Scenario: Historical Soft Landing',
        subtitle: 'Simulate progressive -1.50% central bank rate cuts across renewals',
        handler: () => this.store.updateInputs({ rateShockEnabled: true, rateShockPreset: 'soft-landing' })
      },
      {
        id: 'macro-inflation-spike',
        category: 'Macro',
        title: 'Macro Scenario: Inflation Spike',
        subtitle: 'Simulate +2.00% rate hike shock at next 5-year renewal window',
        handler: () => this.store.updateInputs({ rateShockEnabled: true, rateShockPreset: 'inflation-spike' })
      },
      {
        id: 'action-goal-solver',
        category: 'Action',
        title: 'Payoff Goal Solver',
        subtitle: 'Solve exact monthly extra payment needed to be debt-free in X years',
        handler: () => { if (extraActions?.onOpenGoalSolver) extraActions.onOpenGoalSolver(); }
      },
      {
        id: 'action-handoff',
        category: 'Action',
        title: 'Zero-Cloud P2P Device Handoff (QR Code)',
        subtitle: 'Transfer this exact scenario to iPhone/Android with zero server calls',
        handler: () => { if (extraActions?.onOpenHandoff) extraActions.onOpenHandoff(); }
      },
      {
        id: 'action-csv',
        category: 'Action',
        title: 'Export Amortization Ledger (CSV)',
        subtitle: 'Download complete chunked payment schedule to Excel / CSV format',
        handler: () => { if (extraActions?.onExportCsv) extraActions.onExportCsv(); }
      },
      {
        id: 'theme-toggle',
        category: 'Theme',
        title: 'Toggle Dark / Light Theme',
        subtitle: 'Switch between Obsidian Bloomberg dark mode and clean studio light mode',
        handler: () => this.store.toggleTheme()
      }
    ];
  }

  private createDom() {
    this.modal = document.createElement('div');
    this.modal.className = 'command-palette-backdrop';
    this.modal.style.display = 'none';
    this.modal.innerHTML = `
      <div class="command-palette-modal">
        <div class="command-palette-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" class="command-palette-input" placeholder="Type a command or search parameters (e.g. Rate, Soft Landing, CMHC)..." aria-label="Command search" />
          <kbd class="command-palette-badge">ESC</kbd>
        </div>
        <div class="command-palette-list" role="listbox"></div>
      </div>
    `;

    document.body.appendChild(this.modal);
    this.input = this.modal.querySelector('.command-palette-input');
    this.list = this.modal.querySelector('.command-palette-list');

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    this.input?.addEventListener('input', () => {
      this.filter(this.input?.value || '');
    });

    this.input?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % Math.max(1, this.filteredCommands.length);
        this.renderList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % Math.max(1, this.filteredCommands.length);
        this.renderList();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = this.filteredCommands[this.selectedIndex];
        if (selected) {
          selected.handler();
          this.close();
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  private bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === '[' && !this.isTypingInInput(e)) {
        e.preventDefault();
        this.store.toggleLeftPane();
      } else if (e.key === ']' && !this.isTypingInInput(e)) {
        e.preventDefault();
        this.store.toggleRightPane();
      } else if (e.key === '1' && !this.isTypingInInput(e)) {
        this.store.setStage('pulse');
      } else if (e.key === '2' && !this.isTypingInInput(e)) {
        this.store.setStage('lab');
      } else if (e.key === '3' && !this.isTypingInInput(e)) {
        this.store.setStage('engine');
      }
    });
  }

  private isTypingInInput(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement;
    return target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
  }

  public open() {
    if (!this.modal || !this.input) return;
    this.isOpen = true;
    this.modal.style.display = 'flex';
    this.input.value = '';
    this.filter('');
    setTimeout(() => this.input?.focus(), 50);
  }

  public close() {
    if (!this.modal) return;
    this.isOpen = false;
    this.modal.style.display = 'none';
  }

  public toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private filter(query: string) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.filteredCommands = [...this.commands];
    } else {
      this.filteredCommands = this.commands.filter(
        (c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
      );
    }
    this.selectedIndex = 0;
    this.renderList();
  }

  private renderList() {
    if (!this.list) return;
    if (this.filteredCommands.length === 0) {
      this.list.innerHTML = `<div class="command-palette-empty">No matching commands found.</div>`;
      return;
    }

    this.list.innerHTML = this.filteredCommands
      .map((cmd, idx) => {
        const isSelected = idx === this.selectedIndex;
        return `
          <div class="command-palette-item ${isSelected ? 'selected' : ''}" data-index="${idx}">
            <div class="command-palette-item-main">
              <span class="command-palette-item-tag ${cmd.category.toLowerCase()}">${cmd.category}</span>
              <span class="command-palette-item-title">${cmd.title}</span>
            </div>
            <div class="command-palette-item-sub">${cmd.subtitle}</div>
            ${cmd.shortcut ? `<kbd class="command-palette-item-key">${cmd.shortcut}</kbd>` : ''}
          </div>
        `;
      })
      .join('');

    const items = this.list.querySelectorAll('.command-palette-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-index') || '0', 10);
        const cmd = this.filteredCommands[idx];
        if (cmd) {
          cmd.handler();
          this.close();
        }
      });
    });
  }
}
