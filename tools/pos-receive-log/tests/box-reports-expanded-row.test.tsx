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

describe('Expanded row box reports', () => {
  it('shows box report subtable columns when feed includes matching boxReports', async () => {
    await mockControl({
      reset: true,
      record: {
        ...buildSampleRecord({
          id: 'rec-box-1',
          receivedAtMs: SAMPLE_MS_A + 60_000,
        }),
        boxReports: [
          {
            intakeLogId: 'rec-box-1',
            boxId: 'stb-77',
            ip: '203.0.113.77',
            delayMs: 1250,
            clockSynced: true,
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    const section = screen.getByTestId('box-reports-section');
    expect(within(section).getByText('盒子回報')).toBeInTheDocument();
    expect(screen.getByText('stb-77')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.77')).toBeInTheDocument();
    expect(screen.getByText('1.250')).toBeInTheDocument();
    expect(screen.getByText('已校正')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '盒子代號' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '晚幾秒' })).toBeInTheDocument();
  });

  it('shows 未回報 when record has no box reports', async () => {
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'rec-empty-box',
        receivedAtMs: SAMPLE_MS_A + 120_000,
        boxReports: [],
      }),
    });
    const user = userEvent.setup();
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    expect(screen.getByTestId('box-reports-empty')).toHaveTextContent('未回報');
  });

  it('formats negative delay with 兩邊時鐘不同 per box-seen format', async () => {
    await mockControl({
      reset: true,
      record: {
        ...buildSampleRecord({
          id: 'rec-skew',
          receivedAtMs: SAMPLE_MS_A + 90_000,
        }),
        boxReports: [
          {
            intakeLogId: 'rec-skew',
            boxId: 'box-skew',
            ip: '203.69.10.20',
            delayMs: -120,
            clockSynced: false,
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber="zz-qa-store-a" />);
    await waitFor(() => {
      expect(screen.getAllByText('zz-qa-store-a').length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: /expand/i })[0]);
    expect(screen.getByText('-0.120 兩邊時鐘不同')).toBeInTheDocument();
    expect(screen.getByText('未校正')).toBeInTheDocument();
  });
});
