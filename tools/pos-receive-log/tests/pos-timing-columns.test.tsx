import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ReceiveLogPage } from '../src/receive-log-page';
import { buildSampleRecord, SAMPLE_MS_A } from '../mock/fixtures';
import { mockApiBase, mockControl } from './setup';

const TIMING_STORE = 'zz-qa-timing-store';

async function renderTimingRecord(overrides: Record<string, unknown> = {}) {
  await mockControl({
    reset: true,
    record: buildSampleRecord({
      id: 'timing-row',
      storeNumber: TIMING_STORE,
      rejectedSends: [],
      ...overrides,
    }),
  });
  render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber={TIMING_STORE} />);
  await waitFor(() => {
    expect(screen.getByText(TIMING_STORE)).toBeInTheDocument();
  });
}

afterEach(async () => {
  cleanup();
  await mockControl({ reset: true, mode: 'ok' });
});

describe('POS timing columns (11–18)', () => {
  it('11. received and sent times both show milliseconds', async () => {
    const posSentAtMs = SAMPLE_MS_A - 5000;
    await renderTimingRecord({ receivedAtMs: SAMPLE_MS_A, posSentAtMs, posTimeStmpRaw: null });
    expect(screen.getByTestId('received-at-cell').textContent).toMatch(/11:58:03\.215/);
    expect(screen.getByTestId('sent-at-cell').textContent).toMatch(/11:57:58\.215/);
    expect(screen.getByTestId('sent-at-cell').textContent).toMatch(/\.\d{3}/);
  });

  it('12. processing time is (receivedAtMs - posSentAtMs)/1000 with 3 decimals', async () => {
    await renderTimingRecord({
      receivedAtMs: SAMPLE_MS_A,
      posSentAtMs: SAMPLE_MS_A - 3000,
      posTimeStmpRaw: null,
    });
    expect(screen.getByTestId('processing-duration-cell').textContent).toBe('3.000');
  });

  it('13. both timing fields missing show dash in sent and processing columns', async () => {
    await renderTimingRecord({
      posSentAtMs: null,
      posTimeStmpRaw: null,
    });
    expect(screen.getByTestId('sent-at-cell').textContent).toBe('—');
    expect(screen.getByTestId('processing-duration-cell').textContent).toBe('—');
  });

  it('14. raw stamp without posSentAtMs shows format error and escaped raw in expand', async () => {
    const raw = '<img src=x onerror=alert(1)>2026-bad';
    const user = userEvent.setup();
    await renderTimingRecord({
      posSentAtMs: null,
      posTimeStmpRaw: raw,
    });
    expect(screen.getByTestId('sent-at-cell').textContent).toBe('格式錯誤');
    expect(screen.getByTestId('processing-duration-cell').textContent).toBe('—');
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    const rawEl = screen.getByTestId('pos-time-stmp-raw');
    expect(rawEl.textContent).toContain('<img');
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('15. negative processing duration shows value and clock skew note', async () => {
    await renderTimingRecord({
      receivedAtMs: SAMPLE_MS_A,
      posSentAtMs: SAMPLE_MS_A + 2000,
      posTimeStmpRaw: null,
    });
    const cell = screen.getByTestId('processing-duration-cell');
    expect(cell.textContent).toContain('-2.000');
    expect(screen.getByText('兩邊時鐘不同')).toBeInTheDocument();
  });

  it('16. legacy records without new fields show dash in both columns', async () => {
    await renderTimingRecord({});
    expect(screen.getByTestId('sent-at-cell').textContent).toBe('—');
    expect(screen.getByTestId('processing-duration-cell').textContent).toBe('—');
  });

  it('17. original seven columns and two expanded zones remain', async () => {
    const user = userEvent.setup();
    await renderTimingRecord({ posSentAtMs: SAMPLE_MS_A, posTimeStmpRaw: null });
    const expectedHeaders = [
      '收件時間（Taipei）',
      '送件時間',
      '作業時間',
      '門市',
      '入口',
      '來源 IP',
      '請取餐',
      '準備中',
      '結果',
    ];
    expectedHeaders.forEach((title) => {
      expect(screen.getByRole('columnheader', { name: title })).toBeInTheDocument();
    });
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    const expanded = screen.getByTestId('expanded-row');
    expect(within(expanded).getByTestId('zone-numbers-請取餐')).toBeInTheDocument();
    expect(within(expanded).getByTestId('zone-numbers-準備中')).toBeInTheDocument();
  });
});
