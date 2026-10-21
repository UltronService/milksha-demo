import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReceiveLogPage } from '../src/receive-log-page';
import { buildSampleRecord, SAMPLE_MS_A } from '../mock/fixtures';
import { formatTaipeiWithMs } from '../src/format-taipei-time';
import { mockApiBase, mockControl } from './setup';

const STORE = 'zz-qa-send-time-store';
const CLOUD_NOW_MS = SAMPLE_MS_A;

async function renderRecord(overrides: Record<string, unknown> = {}) {
  await mockControl({
    reset: true,
    record: buildSampleRecord({
      id: 'send-time-row',
      storeNumber: STORE,
      receivedAtMs: CLOUD_NOW_MS,
      rejectedSends: [],
      posTimeStmpRaw: null,
      ...overrides,
    }),
  });
  render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber={STORE} />);
  await waitFor(() => {
    expect(screen.getByText(STORE)).toBeInTheDocument();
  });
}

afterEach(async () => {
  cleanup();
  await mockControl({ reset: true, mode: 'ok' });
});

describe('controller send-time receive-log (8–12)', () => {
  it('8. in range: receive-log shows Taipei time to ms (POS format)', async () => {
    const posSentAtMs = CLOUD_NOW_MS - 5000;
    await renderRecord({ posSentAtMs, posSentAtIgnored: false });
    const expected = formatTaipeiWithMs(posSentAtMs);
    expect(screen.getByTestId('sent-at-cell').textContent).toBe(expected);
    expect(screen.getByTestId('sent-at-cell').textContent).toMatch(/\.\d{3}$/);
  });

  it('9. controller and POS records use same Taipei epoch formatting (no +8h drift)', async () => {
    const posSentAtMs = CLOUD_NOW_MS - 2000;
    await renderRecord({ entry: 'controller', posSentAtMs, posSentAtIgnored: false });
    const posRow = formatTaipeiWithMs(posSentAtMs);
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'pos-peer',
        storeNumber: STORE,
        entry: 'POS',
        receivedAtMs: CLOUD_NOW_MS,
        posSentAtMs,
        posSentAtIgnored: false,
        rejectedSends: [],
      }),
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber={STORE} />);
    await waitFor(() => {
      const cells = screen.getAllByTestId('sent-at-cell');
      expect(cells.length).toBeGreaterThanOrEqual(2);
      expect(cells[0].textContent).toBe(posRow);
      expect(cells[1].textContent).toBe(posRow);
    });
  });

  it('10. clock diff exactly 10s: time still shown', async () => {
    const posSentAtMs = CLOUD_NOW_MS - 10_000;
    await renderRecord({ posSentAtMs, posSentAtIgnored: false });
    expect(screen.getByTestId('sent-at-cell').textContent).toBe(formatTaipeiWithMs(posSentAtMs));
  });

  it('11. diff 10s + 1ms: page shows 時間異常', async () => {
    await renderRecord({
      posSentAtMs: null,
      posSentAtIgnored: true,
    });
    expect(screen.getByTestId('sent-at-cell').textContent).toBe('時間異常');
  });

  it('12. legacy controller records without send time show dash', async () => {
    await renderRecord({
      entry: 'controller',
      posSentAtMs: null,
      posSentAtIgnored: null,
      posTimeStmpRaw: null,
    });
    expect(screen.getByTestId('sent-at-cell').textContent).toBe('—');
    expect(screen.getByTestId('processing-duration-cell').textContent).toBe('—');
  });
});
