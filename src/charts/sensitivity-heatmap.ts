/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * 2D Strategy Sensitivity Heatmap Component
 *
 * Evaluates dozens of prepayment scenarios simultaneously in a 2D matrix:
 * Monthly Extra Surplus (Rows) vs. One-Time Lump Sum (Columns).
 * Interactive cell hovering displays exact years and interest saved.
 * Clicking any cell immediately applies that strategy to the active plan.
 */

import { GridCell, HeatmapMatrixResult } from '../core/heatmap-math.js';
import { formatCurrency } from '../core/formatters.js';

export interface SensitivityHeatmapProps {
  container: HTMLElement;
  matrix: HeatmapMatrixResult;
  currentExtra: number;
  currentLumpSum: number;
  country?: string;
  onSelectCell: (extraMonthly: number, lumpSum: number) => void;
}

export class SensitivityHeatmap {
  private container: HTMLElement;
  private matrix: HeatmapMatrixResult | null = null;
  private currentExtra = 0;
  private currentLumpSum = 0;
  private country = 'CA';
  private hoveredCell: GridCell | null = null;
  private onSelectCellCallback?: (extraMonthly: number, lumpSum: number) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(props: SensitivityHeatmapProps) {
    this.container = props.container;
    this.matrix = props.matrix;
    this.currentExtra = props.currentExtra;
    this.currentLumpSum = props.currentLumpSum;
    this.country = props.country || 'CA';
    this.onSelectCellCallback = props.onSelectCell;

    this.draw();
  }

  private draw() {
    if (!this.matrix) return;

    const { grid, maxSaved, axes } = this.matrix;

    // Header columns (Lump Sums)
    const headerCols = axes.lumpSum
      .map(
        (ls) => `
        <th style="padding: 8px 6px; font-size: 0.72rem; text-align: center; color: var(--text-secondary); font-family: var(--font-mono); border-bottom: 1px solid var(--border-color);">
          ${ls === 0 ? '$0 Upfront' : formatCurrency(ls, this.country)}
        </th>
      `
      )
      .join('');

    // Rows
    const rowsHtml = grid
      .map((row, rIdx) => {
        const monthly = axes.monthly[rIdx] ?? 0;
        const cellsHtml = row
          .map((cell) => {
            const isCurrent =
              cell.monthly === this.currentExtra && cell.lumpSum === this.currentLumpSum;
            const ratio = maxSaved > 0 ? Math.min(1, cell.yearsSaved / maxSaved) : 0;

            // Heatmap color interpolation: from dark slate (0 saved) to vibrant emerald/cyan
            let bg = 'rgba(255, 255, 255, 0.03)';
            let borderColor = 'rgba(255, 255, 255, 0.05)';
            let textColor = 'var(--text-muted)';

            if (cell.yearsSaved > 0) {
              const alpha = (0.15 + ratio * 0.55).toFixed(2);
              bg = `rgba(16, 185, 129, ${alpha})`;
              borderColor = ratio > 0.6 ? 'rgba(56, 189, 248, 0.6)' : 'rgba(16, 185, 129, 0.3)';
              textColor = '#ffffff';
            }

            if (isCurrent) {
              borderColor = '#38bdf8';
              bg = 'rgba(56, 189, 248, 0.35)';
            }

            return `
              <td
                class="heatmap-cell ${isCurrent ? 'selected' : ''}"
                data-monthly="${cell.monthly}"
                data-lumpsum="${cell.lumpSum}"
                style="padding: 10px 6px; text-align: center; cursor: pointer; border-radius: 6px; background: ${bg}; border: 1px solid ${borderColor}; transition: transform 0.15s, border-color 0.15s;"
                title="+$${cell.monthly}/mo & $${cell.lumpSum} lump sum: -${cell.yearsSaved} yrs, save ${formatCurrency(cell.interestSaved, this.country)}"
              >
                <div style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; color: ${textColor};">
                  ${cell.yearsSaved === 0 ? '0.0y' : `-${cell.yearsSaved.toFixed(1)}y`}
                </div>
                <div style="font-family: var(--font-mono); font-size: 0.65rem; opacity: 0.8; color: ${ratio > 0.4 ? '#38bdf8' : 'var(--text-muted)'};">
                  ${cell.interestSaved > 0 ? formatCurrency(cell.interestSaved, this.country) : '-'}
                </div>
              </td>
            `;
          })
          .join('');

        return `
          <tr>
            <td style="padding: 8px 10px; font-size: 0.75rem; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono); white-space: nowrap; border-right: 1px solid var(--border-color);">
              ${monthly === 0 ? '+$0/mo' : `+${formatCurrency(monthly, this.country)}/mo`}
            </td>
            ${cellsHtml}
          </tr>
        `;
      })
      .join('');

    // Active hovered / selected preview card
    const activeCell =
      this.hoveredCell ||
      grid.flat().find((c) => c.monthly === this.currentExtra && c.lumpSum === this.currentLumpSum) ||
      grid[0]?.[0];

    const previewHtml = activeCell
      ? `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: 8px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); font-size: 0.78rem;">
        <div>
          <span style="color: var(--text-secondary);">Target Plan: </span>
          <strong class="mono text-cyan">+${formatCurrency(activeCell.monthly, this.country)}/mo</strong>
          <span style="color: var(--text-secondary);"> with </span>
          <strong class="mono text-cyan">${formatCurrency(activeCell.lumpSum, this.country)} Lump Sum</strong>
        </div>
        <div style="display: flex; gap: 14px; align-items: center;">
          <div>
            <span style="color: var(--text-secondary);">Shaves: </span>
            <strong class="mono text-emerald font-bold">${activeCell.yearsSaved > 0 ? `-${activeCell.yearsSaved.toFixed(1)} Years` : '0 Years'}</strong>
          </div>
          <div>
            <span style="color: var(--text-secondary);">Interest Saved: </span>
            <strong class="mono text-emerald font-bold">${formatCurrency(activeCell.interestSaved, this.country)}</strong>
          </div>
          <button class="studio-btn small primary" id="btn-apply-heatmap-cell" data-monthly="${activeCell.monthly}" data-lumpsum="${activeCell.lumpSum}">
            Apply Strategy
          </button>
        </div>
      </div>
    `
      : '';

    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        ${previewHtml}
        <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.25);">
          <table style="width: 100%; border-collapse: separate; border-spacing: 4px; padding: 8px;">
            <thead>
              <tr>
                <th style="padding: 8px 10px; font-size: 0.72rem; text-align: left; color: var(--text-muted); font-family: var(--font-mono); border-bottom: 1px solid var(--border-color); border-right: 1px solid var(--border-color);">
                  Extra / Lump Sum
                </th>
                ${headerCols}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
        <div style="font-size: 0.72rem; opacity: 0.7; text-align: center; color: var(--text-secondary);">
          💡 <strong>Interactive Strategy Grid:</strong> Hover to inspect combinations. Click any cell to immediately apply it to your scenario.
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents() {
    const cells = this.container.querySelectorAll('.heatmap-cell');
    cells.forEach((cellEl) => {
      cellEl.addEventListener('mouseenter', (e) => {
        const m = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-monthly') || '0');
        const ls = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-lumpsum') || '0');
        const found = this.matrix?.grid.flat().find((c) => c.monthly === m && c.lumpSum === ls);
        if (found) {
          this.hoveredCell = found;
          this.draw();
        }
      });

      cellEl.addEventListener('click', (e) => {
        const m = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-monthly') || '0');
        const ls = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-lumpsum') || '0');
        if (this.onSelectCellCallback) {
          this.onSelectCellCallback(m, ls);
        }
      });
    });

    const applyBtn = this.container.querySelector('#btn-apply-heatmap-cell');
    applyBtn?.addEventListener('click', (e) => {
      const m = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-monthly') || '0');
      const ls = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-lumpsum') || '0');
      if (this.onSelectCellCallback) {
        this.onSelectCellCallback(m, ls);
      }
    });
  }
}
