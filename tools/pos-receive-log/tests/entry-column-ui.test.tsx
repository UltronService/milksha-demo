import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReceiveLogPage } from '../src/receive-log-page';
import { SAMPLE_MS_A } from '../mock/fixtures';
import { mockApiBase, mockControl } from './setup';

const STORE_ID = 'entry-ui-qa-store';

async function renderSingleSourceRecord(record: Record<string, unknown>): Promise<string> {
  await mockControl({ reset: true, records: [record] });
  render(
    <ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber={STORE_ID} refreshIntervalMs={500} />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('entry-cell')).toBeInTheDocument();
  });
  return screen.getByTestId('entry-cell').textContent ?? '';
}

afterEach(async () => {
  cleanup();
  await mockControl({ reset: true, mode: 'ok' });
});

describe('入口 column UI (exact on-screen text)', () => {
  it('1) posReceiver shows POS', async () => {
    const text = await renderSingleSourceRecord({
      id: 'entry-pos',
      storeId: STORE_ID,
      source: 'posReceiver',
      receivedAtMs: SAMPLE_MS_A,
      disposition: 'accepted',
    });
    expect(text).toBe('POS');
  });

  it('2) devCommand_push_numbers shows 控制端', async () => {
    const text = await renderSingleSourceRecord({
      id: 'UCi1UHnreiRGYRM4cl5v',
      storeId: STORE_ID,
      deviceId: 'web-qa55-one-1792681272848',
      source: 'devCommand_push_numbers',
      receivedAtMs: SAMPLE_MS_A,
      disposition: 'rejected',
    });
    expect(text).toBe('控制端');
  });

  it('3) source containing controller shows 控制端', async () => {
    const text = await renderSingleSourceRecord({
      id: 'entry-legacy-controller',
      storeId: STORE_ID,
      source: 'legacyFooControllerBar',
      receivedAtMs: SAMPLE_MS_A,
      disposition: 'accepted',
    });
    expect(text).toBe('控制端');
  });

  it('4) unrecognised source shows 未知', async () => {
    const text = await renderSingleSourceRecord({
      id: 'entry-unknown-source',
      storeId: STORE_ID,
      source: 'mysteryGateway',
      receivedAtMs: SAMPLE_MS_A,
      disposition: 'accepted',
    });
    expect(text).toBe('未知');
  });

  it('5) empty source shows 未知', async () => {
    const text = await renderSingleSourceRecord({
      id: 'entry-empty-source',
      storeId: STORE_ID,
      source: '',
      receivedAtMs: SAMPLE_MS_A,
      disposition: 'accepted',
    });
    expect(text).toBe('未知');
  });
});
