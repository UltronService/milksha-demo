import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiveLogPage } from '../src/receive-log-page';
import { buildManyRecords, buildSampleRecord, SAMPLE_MS_A } from '../mock/fixtures';
import { mockApiBase, mockControl } from './setup';
import realFeedRecord from './fixtures/pos-intake-log-feed-record.json';

async function readLastFeedRequest(): Promise<{
  hasStoreId: boolean;
  storeId: string | null;
}> {
  const res = await fetch(`${mockApiBase}/__mock/last-request`);
  return (await res.json()) as { hasStoreId: boolean; storeId: string | null };
}

async function renderPage(overrides: Partial<{ refreshIntervalMs: number }> = {}) {
  const user = userEvent.setup();
  render(
    <ReceiveLogPage
      apiBaseUrl={mockApiBase}
      initialStoreNumber="zz-qa-store-a"
      refreshIntervalMs={overrides.refreshIntervalMs ?? 500}
    />,
  );
  await waitFor(() => {
    expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
  });
  return { user };
}

afterEach(async () => {
  cleanup();
  await mockControl({ reset: true, mode: 'ok' });
});

describe('POS receive log page', () => {
  it('1. read-only: no send/clear/delete buttons', async () => {
    await renderPage();
    const forbidden = [/送出/, /清除/, /刪除/, /send/i, /clear/i, /delete/i];
    forbidden.forEach((re) => {
      expect(screen.queryByRole('button', { name: re })).toBeNull();
    });
  });

  it('2. shows Taipei time with milliseconds', async () => {
    await renderPage();
    expect(screen.getAllByTestId('received-at-cell')[0].textContent).toMatch(
      /11:58:03\.215 Taipei/,
    );
  });

  it('3. each row shows store, entry, source IP', async () => {
    await renderPage();
    expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    expect(screen.getAllByText('controller').length).toBeGreaterThan(0);
    expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
    expect(screen.getByText('198.51.100.2')).toBeInTheDocument();
  });

  it('4. zones show counts; expand shows numbers with source tags', async () => {
    const { user } = await renderPage();
    expect(screen.getByText('2')).toBeInTheDocument();
    const expandButtons = screen.getAllByRole('button', { name: /expand/i });
    await user.click(expandButtons[0]);
    const expanded = screen.getByTestId('expanded-row');
    expect(within(expanded).getByText('門市')).toBeInTheDocument();
    expect(within(expanded).getByText('Uber Eats')).toBeInTheDocument();
    expect(within(expanded).getByText('foodpanda')).toBeInTheDocument();
  });

  it('5. result tags colored; not-shown reasons visible on expand', async () => {
    const { user } = await renderPage();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('skipped')).toBeInTheDocument();
    const expandButtons = screen.getAllByRole('button', { name: /expand/i });
    await user.click(expandButtons[0]);
    expect(screen.getByTestId('not-shown-reasons').textContent).toContain('版面已滿');
  });

  it('6. rejected sends listed with reason on expand', async () => {
    const { user } = await renderPage();
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    const rejected = screen.getByTestId('rejected-sends');
    expect(rejected.textContent).toContain('3001');
    expect(rejected.textContent).toContain('格式錯誤');
  });

  it('7. two records in same millisecond both listed', async () => {
    await renderPage();
    const times = screen.getAllByTestId('received-at-cell');
    const sameMs = times.filter((el) => el.textContent?.includes('11:58:03.215'));
    expect(sameMs.length).toBe(2);
  });

  it('8. raw payload only on expand; secrets redacted; not in page source', async () => {
    const { user } = await renderPage();
    expect(screen.queryByTestId('raw-payload')).toBeNull();
    expect(document.documentElement.innerHTML).not.toMatch(/apiKey":"[^<]/);
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    const raw = screen.getByTestId('raw-payload');
    expect(raw.textContent).toContain('<REDACTED>');
    expect(document.documentElement.innerHTML).not.toContain('legacy-secret-value');
  });

  it('9. store + time filters; empty shows 此條件下沒有收件紀錄', async () => {
    const { user } = await renderPage();
    const input = screen.getByRole('textbox', { name: '門市編號' });
    await user.clear(input);
    await user.type(input, 'zz-qa-empty-store');
    await waitFor(() => {
      expect(screen.getByText('此條件下沒有收件紀錄')).toBeInTheDocument();
    });
  });

  it('10. auto-refresh adds rows without collapsing expanded row', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: SAMPLE_MS_A + 3_600_000 });
    const { user } = await renderPage({ refreshIntervalMs: 1000 });
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    expect(screen.getByTestId('expanded-row')).toBeInTheDocument();
    await mockControl({
      record: buildSampleRecord({
        id: 'rec-new',
        receivedAtMs: SAMPLE_MS_A + 1,
        storeNumber: 'zz-qa-store-a',
        sourceIp: '203.0.113.99',
      }),
    });
    await user.click(screen.getByTestId('auto-refresh-switch'));
    await vi.advanceTimersByTimeAsync(1100);
    await waitFor(() => {
      expect(screen.getByText('203.0.113.99')).toBeInTheDocument();
    });
    expect(screen.getByTestId('expanded-row')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('11. fetch error shows message and keeps old data', async () => {
    await renderPage();
    expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    await mockControl({ forceFail: true });
    const input = screen.getByRole('textbox', { name: '門市編號' });
    await userEvent.clear(input);
    await userEvent.type(input, 'zz-qa-store-b');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
  });

  it('12. renders 500 rows without lag', async () => {
    const bulk = buildManyRecords(500);
    await mockControl({ reset: true, records: bulk });
    const start = performance.now();
    render(
      <ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(10);
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(8000);
  });

  it('15. maps live feed fields: counts, numbers, raw payload in expand', async () => {
    await mockControl({ reset: true, record: realFeedRecord });
    const user = userEvent.setup();
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="s030570" />);
    await waitFor(() => {
      expect(screen.getByText('s030570')).toBeInTheDocument();
    });
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    const expanded = screen.getByTestId('expanded-row');
    expect(within(expanded).getByText('#7805')).toBeInTheDocument();
    expect(within(expanded).getByTestId('message-summary-body').textContent).toContain('1794');
    expect(within(expanded).getByText('訊息摘要')).toBeInTheDocument();
  });

  it('14. optional store: empty omits storeId and shows all stores; filled sends storeId', async () => {
    await mockControl({
      record: buildSampleRecord({
        id: 'rec-store-b',
        storeNumber: 'zz-qa-store-b',
        sourceIp: '203.0.113.55',
        entry: 'POS',
        rejectedSends: [],
      }),
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} />);
    await waitFor(() => {
      expect(screen.getByText('zz-qa-store-b')).toBeInTheDocument();
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    });
    const withoutStore = await readLastFeedRequest();
    expect(withoutStore.hasStoreId).toBe(false);
    expect(withoutStore.storeId).toBeNull();

    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: '門市編號' });
    await user.type(input, 'zz-qa-store-a');
    await waitFor(() => {
      expect(screen.queryByText('zz-qa-store-b')).toBeNull();
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    });
    const withStore = await readLastFeedRequest();
    expect(withStore.hasStoreId).toBe(true);
    expect(withStore.storeId).toBe('zz-qa-store-a');
  });

  it('13. disabled status shows 已停用 and no records', async () => {
    await mockControl({ mode: 'disabled' });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      expect(screen.getByTestId('disabled-banner')).toHaveTextContent('已停用');
    });
    expect(screen.queryByText('203.0.113.10')).toBeNull();
  });
});
