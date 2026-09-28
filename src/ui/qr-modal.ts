/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Zero-Cloud P2P Device Handoff Modal
 */

import { generateHandoffQRCodeUrl } from '../core/qr-sync.js';
import { Inputs } from '../core/types.js';

export class QrHandoffModal {
  private backdrop: HTMLElement | null = null;

  constructor() {
    this.createDom();
  }

  private createDom() {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'qr-modal-backdrop';
    this.backdrop.style.display = 'none';

    this.backdrop.innerHTML = `
      <div class="qr-modal-card">
        <div class="qr-modal-header">
          <div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #f8fafc;">Zero-Cloud Device Handoff</div>
            <div style="font-size: 0.78rem; opacity: 0.7; margin-top: 2px;">100% Client-Side P2P Encrypted Continuity</div>
          </div>
          <button class="qr-modal-close" aria-label="Close modal">&times;</button>
        </div>

        <div class="qr-modal-body">
          <div class="qr-image-wrapper">
            <img id="qr-modal-img" alt="Handoff QR Code" src="" />
            <div id="qr-loading-spinner" style="font-size: 0.85rem; opacity: 0.7;">Generating cryptographic QR payload...</div>
          </div>

          <div class="qr-instructions">
            <strong>Scan with Phone Camera:</strong> Point your iPhone or Android camera at this code. Your exact loan scenario, rate shock settings, and extra payments open instantly on mobile with zero cloud transmission.
          </div>

          <div class="qr-link-box">
            <input type="text" id="qr-share-url-input" readonly />
            <button id="qr-copy-btn">Copy Link</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.backdrop);

    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });

    const closeBtn = this.backdrop.querySelector('.qr-modal-close');
    closeBtn?.addEventListener('click', () => this.close());

    const copyBtn = this.backdrop.querySelector('#qr-copy-btn') as HTMLButtonElement | null;
    const urlInput = this.backdrop.querySelector('#qr-share-url-input') as HTMLInputElement | null;

    copyBtn?.addEventListener('click', () => {
      if (urlInput) {
        navigator.clipboard.writeText(urlInput.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Link';
        }, 2000);
      }
    });
  }

  public async open(inputs: Inputs) {
    if (!this.backdrop) return;
    this.backdrop.style.display = 'flex';

    const img = this.backdrop.querySelector('#qr-modal-img') as HTMLImageElement | null;
    const spinner = this.backdrop.querySelector('#qr-loading-spinner') as HTMLElement | null;
    const input = this.backdrop.querySelector('#qr-share-url-input') as HTMLInputElement | null;

    if (img && spinner) {
      img.style.display = 'none';
      spinner.style.display = 'block';
    }

    try {
      const { qrDataUrl, shareUrl } = await generateHandoffQRCodeUrl(inputs);
      if (img && spinner && input) {
        img.src = qrDataUrl;
        img.style.display = 'block';
        spinner.style.display = 'none';
        input.value = shareUrl;
      }
    } catch (err) {
      console.error('Failed to generate handoff QR', err);
    }
  }

  public close() {
    if (!this.backdrop) return;
    this.backdrop.style.display = 'none';
  }
}
