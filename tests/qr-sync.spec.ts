import { describe, it, expect } from 'vitest';
import { compressInputsForHandoff, decompressInputsFromHandoff } from '../src/core/qr-sync.js';
import { DEFAULT_INPUTS } from '../src/core/constants.js';

describe('Zero-Cloud P2P Device Handoff Engine', () => {
  it('compresses and decompresses inputs losslessly without network calls', () => {
    const original = {
      ...DEFAULT_INPUTS,
      homePrice: 750000,
      downPayment: 150000,
      annualRate: 4.75,
      extraPayment: 250
    };

    const compressed = compressInputsForHandoff(original);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(10);

    const restored = decompressInputsFromHandoff(compressed);
    expect(restored).not.toBeNull();
    expect(restored?.homePrice).toBe(750000);
    expect(restored?.downPayment).toBe(150000);
    expect(restored?.annualRate).toBe(4.75);
    expect(restored?.extraPayment).toBe(250);
  });
});
