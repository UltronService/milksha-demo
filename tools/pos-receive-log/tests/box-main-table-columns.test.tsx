import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ReceiveLogPage } from '../src/receive-log-page';
import { buildSampleRecord, SAMPLE_MS_A } from '../mock/fixtures';
import { mockApiBase, mockControl } from './setup';

afterEach(async () => {
  cleanup();
  await mockControl({ reset: true, mode: 'ok' });
});

function columnHeaderTexts(): string[] {
  return screen.getAllByRole('columnheader').map((el) => el.textContent?.replace(/\s/g, '') ?? '');
}

function dataRowsWithBoxCells() {
  return screen.getAllByRole('row').filter((r) => within(r).queryAllByTestId('box-count-cell').length > 0);
}

function boxCountOrderInTable(): string[] {
  return dataRowsWithBoxCells().map(
    (r) => within(r).getByTestId('box-count-cell').textContent ?? '',
  );
}

function notReportedCountOrderInTable(): string[] {
  return dataRowsWithBoxCells().map(
    (r) => within(r).getByTestId('not-reported-count-cell').textContent ?? '',
  );
}

async function clickColumnSort(user: ReturnType<typeof userEvent.setup>, name: RegExp, clicks = 1) {
  const header = screen.getByRole('columnheader', { name });
  for (let i = 0; i < clicks; i += 1) {
    await user.click(header);
  }
}

async function seedSortFixtureRows() {
  await mockControl({
    reset: true,
    records: [
      buildSampleRecord({
        id: 'sort-zero',
        receivedAtMs: SAMPLE_MS_A + 500_000,
        storeNumber: 'sort-store',
        sourceIp: '10.0.0.1',
        boxReports: [],
        boxReportsFeedShape: 'array',
      }),
      buildSampleRecord({
        id: 'sort-two',
        receivedAtMs: SAMPLE_MS_A + 501_000,
        storeNumber: 'sort-store',
        sourceIp: '10.0.0.2',
        boxReports: [
          {
            boxId: 'b1',
            ip: '10.0.0.2',
            status: 'reported',
            delaySec: 1,
            clockSynced: true,
            clockOffsetMs: 0,
          },
          {
            boxId: 'b2',
            ip: '10.0.0.3',
            status: 'not_reported',
            delaySec: null,
            clockSynced: null,
            clockOffsetMs: null,
          },
        ],
        boxReportsFeedShape: 'array',
      }),
      {
        id: 'sort-dash',
        receivedAtMs: SAMPLE_MS_A + 502_000,
        storeNumber: 'sort-store',
        entry: 'POS',
        sourceIp: '10.0.0.9',
        zones: buildSampleRecord().zones,
        result: 'success',
        rejectedSends: [],
        rawPayload: '{}',
        rawPayloadTruncated: false,
      },
    ],
  });
}

describe('Main table box report columns', () => {
  it('1. headers 盒子數 and 未回報台數 sit between 準備中 and 結果', async () => {
    await mockControl({ reset: true });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    });
    const headers = columnHeaderTexts();
    const prepIdx = headers.findIndex((h) => h.includes('準備中'));
    const boxIdx = headers.findIndex((h) => h.includes('盒子數'));
    const notIdx = headers.findIndex((h) => h.includes('未回報台數'));
    const resultIdx = headers.findIndex((h) => h.includes('結果'));
    expect(prepIdx).toBeGreaterThan(-1);
    expect(boxIdx).toBe(prepIdx + 1);
    expect(notIdx).toBe(boxIdx + 1);
    expect(resultIdx).toBe(notIdx + 1);
  });

  it('2. missing boxReports in feed shows dash without expanding', async () => {
    await mockControl({
      reset: true,
      record: {
        id: 'rec-missing-box',
        receivedAtMs: SAMPLE_MS_A + 200_000,
        storeNumber: 'zz-qa-store-a',
        entry: 'POS',
        sourceIp: '203.0.113.10',
        zones: buildSampleRecord().zones,
        result: 'success',
        rejectedSends: [],
        rawPayload: '{}',
        rawPayloadTruncated: false,
      },
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      const dashes = screen.getAllByTestId('box-count-cell').filter((el) => el.textContent === '—');
      expect(dashes.length).toBeGreaterThan(0);
    });
    const dashNot = screen
      .getAllByTestId('not-reported-count-cell')
      .filter((el) => el.textContent === '—');
    expect(dashNot.length).toBeGreaterThan(0);
  });

  it('3. empty boxReports array shows zeros', async () => {
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'rec-empty-box-main',
        receivedAtMs: SAMPLE_MS_A + 210_000,
        boxReports: [],
        boxReportsFeedShape: 'array',
      }),
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      const zeros = screen.getAllByTestId('box-count-cell').filter((el) => el.textContent === '0');
      expect(zeros.length).toBeGreaterThan(0);
    });
  });

  it('4. not reported count turns red when greater than zero', async () => {
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'rec-red-count',
        receivedAtMs: SAMPLE_MS_A + 220_000,
        storeNumber: 'only-store-red',
        boxReports: [
          {
            boxId: 'b1',
            ip: '10.0.0.1',
            status: 'not_reported',
            delaySec: null,
            clockSynced: null,
            clockOffsetMs: null,
          },
        ],
        boxReportsFeedShape: 'array',
      }),
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="only-store-red" />);
    await waitFor(() => {
      expect(screen.getByTestId('not-reported-count-cell')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('not-reported-count-cell')).toHaveAttribute('data-not-reported-alert', 'true');
  });

  it('5. multiple rows show independent counts', async () => {
    await mockControl({
      reset: true,
      records: [
        buildSampleRecord({
          id: 'rec-multi-a',
          receivedAtMs: SAMPLE_MS_A + 300_000,
          storeNumber: 'only-store-multi',
          boxReports: [
            {
              boxId: 'x',
              ip: '10.0.0.2',
              status: 'reported',
              delaySec: 1,
              clockSynced: true,
              clockOffsetMs: 0,
            },
            {
              boxId: 'y',
              ip: '10.0.0.3',
              status: 'not_reported',
              delaySec: null,
              clockSynced: null,
              clockOffsetMs: null,
            },
          ],
          boxReportsFeedShape: 'array',
        }),
        buildSampleRecord({
          id: 'rec-multi-b',
          receivedAtMs: SAMPLE_MS_A + 310_000,
          storeNumber: 'only-store-multi',
          boxReports: [],
          boxReportsFeedShape: 'array',
        }),
      ],
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="only-store-multi" />);
    await waitFor(() => {
      expect(screen.getAllByText('only-store-multi').length).toBe(2);
    });
    const dataRows = screen.getAllByRole('row').filter((r) => within(r).queryAllByTestId('box-count-cell').length > 0);
    const counts = dataRows.map((r) => ({
      box: within(r).getByTestId('box-count-cell').textContent,
      not: within(r).getByTestId('not-reported-count-cell').textContent,
    }));
    expect(counts).toContainEqual({ box: '2', not: '1' });
    expect(counts).toContainEqual({ box: '0', not: '0' });
  });

  it('10. null status in boxReports counts toward 未回報台數 on main table', async () => {
    await mockControl({
      reset: true,
      record: {
        id: 'rec-null-status',
        receivedAtMs: SAMPLE_MS_A + 450_000,
        storeNumber: 'only-null-status',
        entry: 'POS',
        sourceIp: '10.0.0.44',
        zones: buildSampleRecord().zones,
        result: 'success',
        rejectedSends: [],
        rawPayload: '{}',
        rawPayloadTruncated: false,
        boxReports: [
          {
            boxId: 'reported-one',
            ip: '10.0.0.50',
            status: 'reported',
            delay: 1,
            clockSynced: true,
          },
          {
            boxId: 'missing-status',
            ip: '10.0.0.51',
          },
        ],
      },
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="only-null-status" />);
    await waitFor(() => {
      expect(screen.getByTestId('box-count-cell')).toHaveTextContent('2');
    });
    expect(screen.getByTestId('not-reported-count-cell')).toHaveTextContent('1');
  });

  it('11. clicking 盒子數 sorts asc/desc with dash always last', async () => {
    const user = userEvent.setup();
    await seedSortFixtureRows();
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="sort-store" />);
    await waitFor(() => {
      expect(screen.getAllByText('sort-store').length).toBe(3);
    });
    await clickColumnSort(user, /盒子數/, 1);
    await waitFor(() => {
      expect(boxCountOrderInTable()).toEqual(['0', '2', '—']);
    });
    await clickColumnSort(user, /盒子數/, 1);
    await waitFor(() => {
      expect(boxCountOrderInTable()).toEqual(['2', '0', '—']);
    });
  });

  it('12. clicking 未回報台數 sorts asc/desc with dash always last', async () => {
    const user = userEvent.setup();
    await seedSortFixtureRows();
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="sort-store" />);
    await waitFor(() => {
      expect(screen.getAllByText('sort-store').length).toBe(3);
    });
    await clickColumnSort(user, /未回報台數/, 1);
    await waitFor(() => {
      expect(notReportedCountOrderInTable()).toEqual(['0', '1', '—']);
    });
    await clickColumnSort(user, /未回報台數/, 1);
    await waitFor(() => {
      expect(notReportedCountOrderInTable()).toEqual(['1', '0', '—']);
    });
  });

  it('6. both 盒子數 and 未回報台數 headers are sortable', async () => {
    await mockControl({ reset: true });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('columnheader', { name: /未回報台數/ })).toHaveClass(
      'ant-table-column-has-sorters',
    );
    expect(screen.getByRole('columnheader', { name: /盒子數/ })).toHaveClass(
      'ant-table-column-has-sorters',
    );
  });

  it('7. controller clientIp shows full IP in 來源 IP column', async () => {
    await mockControl({
      reset: true,
      record: {
        id: 'rec-ctrl-ip',
        receivedAtMs: SAMPLE_MS_A + 400_000,
        storeId: 'zz-qa-store-a',
        source: 'controllerReceiver',
        clientIp: '203.0.113.88',
        disposition: 'accepted',
        readyCount: 0,
        preparingCount: 0,
        readyNumbers: [],
        preparingNumbers: [],
        rawPayload: '{}',
      },
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      expect(screen.getByText('203.0.113.88')).toBeInTheDocument();
    });
  });

  it('9. default date filter hides out-of-range row box counts', async () => {
    await mockControl({
      reset: true,
      records: [
        buildSampleRecord({
          id: 'rec-in-range',
          receivedAtMs: SAMPLE_MS_A,
          storeNumber: 'only-store-filter',
          boxReports: [],
          boxReportsFeedShape: 'array',
        }),
        buildSampleRecord({
          id: 'rec-out-range',
          receivedAtMs: SAMPLE_MS_A - 7 * 24 * 60 * 60 * 1000,
          storeNumber: 'only-store-filter',
          boxReports: [
            {
              boxId: 'old',
              ip: '10.0.0.9',
              status: 'not_reported',
              delaySec: null,
              clockSynced: null,
              clockOffsetMs: null,
            },
          ],
          boxReportsFeedShape: 'array',
        }),
      ],
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="only-store-filter" />);
    await waitFor(() => {
      expect(screen.getAllByText('only-store-filter').length).toBe(1);
    });
    expect(screen.getByTestId('box-count-cell')).toHaveTextContent('0');
    expect(screen.getByTestId('not-reported-count-cell')).toHaveTextContent('0');
  });

  it('8. legacy record without IP shows dash in 來源 IP', async () => {
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'rec-no-ip',
        receivedAtMs: SAMPLE_MS_A + 410_000,
        storeNumber: 'only-store-no-ip',
        sourceIp: '',
        entry: 'controller',
      }),
    });
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="only-store-no-ip" />);
    await waitFor(() => {
      expect(screen.getAllByText('only-store-no-ip').length).toBe(1);
    });
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText('only-store-no-ip'));
    expect(row).toBeDefined();
    expect(within(row!).getByText('控制端')).toBeInTheDocument();
    expect(within(row!).getAllByText('—').length).toBeGreaterThan(0);
  });
});
