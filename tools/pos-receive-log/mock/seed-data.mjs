export const SAMPLE_MS_A = Date.parse('2026-10-20T03:58:03.215Z');

export function defaultRecords() {
  return [
    {
      id: 'rec-a',
      receivedAtMs: SAMPLE_MS_A,
      storeNumber: 'zz-qa-store-a',
      entry: 'POS',
      sourceIp: '203.0.113.10',
      zones: {
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
      result: 'success',
      rejectedSends: [{ number: '3001', reason: '格式錯誤' }],
      rawPayload: '{"apiKey":"<REDACTED>","numbers":["1001"]}',
      rawPayloadTruncated: false,
    },
    {
      id: 'rec-b',
      receivedAtMs: SAMPLE_MS_A,
      storeNumber: 'zz-qa-store-a',
      entry: 'controller',
      sourceIp: '198.51.100.2',
      zones: {
        ready: { count: 0, numbers: [], notShown: [] },
        preparing: {
          count: 1,
          numbers: [{ number: '2002', sourceType: 'milksha_points' }],
          notShown: [],
        },
      },
      result: 'skipped',
      rejectedSends: [],
      rawPayload: '{"token":"<REDACTED>"}',
      rawPayloadTruncated: true,
    },
  ];
}
