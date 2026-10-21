import type { ReceiveLogRecord } from '../src/types';
import {
  FIXED_TEST_NOW_MS,
  LIVE_FEED_RECORD_MS,
  SAMPLE_MS_A,
} from './test-clock.mjs';

export { FIXED_TEST_NOW_MS, LIVE_FEED_RECORD_MS, SAMPLE_MS_A };

export const SAMPLE_MS_B = SAMPLE_MS_A;

export const SECRET_PLACEHOLDER = '<REDACTED>';

export function buildSampleRecord(overrides: Partial<ReceiveLogRecord> = {}): ReceiveLogRecord {
  const id = overrides.id ?? 'rec-zz-qa-1';
  return {
    id,
    receivedAtMs: overrides.receivedAtMs ?? SAMPLE_MS_A,
    posTimeStmpRaw: overrides.posTimeStmpRaw ?? null,
    posSentAtMs: overrides.posSentAtMs ?? null,
    storeNumber: overrides.storeNumber ?? 'zz-qa-store-a',
    entry: overrides.entry ?? 'POS',
    sourceIp: overrides.sourceIp ?? '203.0.113.10',
    zones: overrides.zones ?? {
      ready: {
        count: 2,
        numbers: [
          { number: '1001', sourceType: 'store' },
          { number: '1002', sourceType: 'uber_eats' },
        ],
        notShown: [{ number: '1099', reason: '版面已滿' }],
      },
      preparing: {
        count: 1,
        numbers: [{ number: '2001', sourceType: 'foodpanda' }],
        notShown: [],
      },
    },
    result: overrides.result ?? 'success',
    rejectedSends: overrides.rejectedSends ?? [{ number: '3001', reason: '格式錯誤' }],
    rawPayload:
      overrides.rawPayload ??
      `{"apiKey":"${SECRET_PLACEHOLDER}","numbers":["1001"]}`,
    rawPayloadTruncated: overrides.rawPayloadTruncated ?? false,
    boxReports: overrides.boxReports ?? [],
    ...overrides,
  };
}

export function buildManyRecords(count: number): ReceiveLogRecord[] {
  const rows: ReceiveLogRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(
      buildSampleRecord({
        id: `bulk-${i}`,
        receivedAtMs: SAMPLE_MS_A - i,
        storeNumber: 'zz-qa-store-a',
        rejectedSends: [],
        zones: {
          ready: { count: 1, numbers: [{ number: String(5000 + i), sourceType: 'store' }], notShown: [] },
          preparing: { count: 0, numbers: [], notShown: [] },
        },
        rawPayload: `{"n":${i},"secret":"${SECRET_PLACEHOLDER}"}`,
      }),
    );
  }
  return rows;
}
