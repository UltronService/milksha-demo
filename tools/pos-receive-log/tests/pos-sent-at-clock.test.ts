import { describe, expect, it } from 'vitest';
import { resolvePosSentAtIgnored } from '../src/pos-sent-at-clock';
import { formatSentTimeCell } from '../src/pos-timing-display';
import { formatTaipeiWithMs } from '../src/format-taipei-time';
import { SAMPLE_MS_A } from '../mock/fixtures';

const CLOUD = SAMPLE_MS_A;

describe('pos-sent-at-clock policy', () => {
  it('slow 10000 ms: not ignored without API flag', () => {
    expect(resolvePosSentAtIgnored(CLOUD, CLOUD - 10_000, null)).toBe(false);
  });

  it('slow 10001 ms: ignored without API flag', () => {
    expect(resolvePosSentAtIgnored(CLOUD, CLOUD - 10_001, null)).toBe(true);
  });

  it('fast 10000 ms: not ignored without API flag', () => {
    expect(resolvePosSentAtIgnored(CLOUD, CLOUD + 10_000, null)).toBe(false);
  });

  it('fast 10001 ms: ignored without API flag', () => {
    expect(resolvePosSentAtIgnored(CLOUD, CLOUD + 10_001, null)).toBe(true);
  });
});

describe('formatSentTimeCell boundary display', () => {
  it('shows Taipei time at exactly 10000 ms slow skew', () => {
    const sent = CLOUD - 10_000;
    expect(formatSentTimeCell(sent, null, null, CLOUD)).toBe(formatTaipeiWithMs(sent));
  });

  it('shows 時間異常 at 10001 ms fast skew via comparison', () => {
    expect(formatSentTimeCell(CLOUD + 10_001, null, null, CLOUD)).toBe('時間異常');
  });
});
