/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Mobile-First Touch Bottom Sheet
 *
 * Provides fluid iOS/Android-style drawer modals positioned directly under the thumb,
 * eliminating awkward reach on mobile devices.
 */

export class BottomSheet {
  private backdrop: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private isOpen = false;

  constructor() {
    this.createDom();
  }

  private createDom() {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'bottom-sheet-backdrop';
    this.backdrop.style.display = 'none';

    this.backdrop.innerHTML = `
      <div class="bottom-sheet-container">
        <div class="bottom-sheet-drag-handle"></div>
        <div class="bottom-sheet-header">
          <div class="bottom-sheet-title">Parameter Quick Tune</div>
          <button class="bottom-sheet-close">&times;</button>
        </div>
        <div class="bottom-sheet-content"></div>
      </div>
    `;

    document.body.appendChild(this.backdrop);
    this.sheet = this.backdrop.querySelector('.bottom-sheet-container');
    this.contentEl = this.backdrop.querySelector('.bottom-sheet-content');
    this.titleEl = this.backdrop.querySelector('.bottom-sheet-title');

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    const closeBtn = this.backdrop.querySelector('.bottom-sheet-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Touch swipe down to dismiss
    let startY = 0;
    this.sheet?.addEventListener(
      'touchstart',
      (e) => {
        startY = e.touches[0]?.clientY || 0;
      },
      { passive: true }
    );

    this.sheet?.addEventListener(
      'touchmove',
      (e) => {
        const curY = e.touches[0]?.clientY || 0;
        const diff = curY - startY;
        if (diff > 80) {
          this.close();
        }
      },
      { passive: true }
    );
  }

  public open(title: string, innerHtml: string, onMount?: (contentEl: HTMLElement) => void) {
    if (!this.backdrop || !this.sheet || !this.contentEl || !this.titleEl) return;
    this.titleEl.textContent = title;
    this.contentEl.innerHTML = innerHtml;
    this.backdrop.style.display = 'flex';
    this.isOpen = true;

    requestAnimationFrame(() => {
      this.sheet?.classList.add('visible');
    });

    if (onMount) {
      onMount(this.contentEl);
    }
  }

  public close() {
    if (!this.backdrop || !this.sheet) return;
    this.sheet.classList.remove('visible');
    this.isOpen = false;
    setTimeout(() => {
      if (!this.isOpen && this.backdrop) {
        this.backdrop.style.display = 'none';
      }
    }, 250);
  }
}
