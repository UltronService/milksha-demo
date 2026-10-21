import { describe, expect, it } from 'vitest';
import {
  formatProcessingDuration,
  formatSentTimeCell,
} from '../src/pos-timing-display';
import { SAMPLE_MS_A } from '../mock/fixtures';

describe('pos-timing-display', () => {
  it('18. processing duration zero shows 0.000 not dash', () => {
    const out = formatProcessingDuration(SAMPLE_MS_A, SAMPLE_MS_A);
    expect(out.text).toBe('0.000');
    expect(out.clockSkew).toBe(false);
  });

  it('12. processing duration uses three decimal seconds', () => {
    const out = formatProcessingDuration(SAMPLE_MS_A, SAMPLE_MS_A - 3000);
    expect(out.text).toBe('3.000');
  });

  it('13. missing posSentAtMs shows dash for processing', () => {
    const out = formatProcessingDuration(SAMPLE_MS_A, null);
    expect(out.text).toBe('—');
  });
});
