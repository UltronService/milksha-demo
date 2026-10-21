import { describe, expect, it } from 'vitest';
import { LIVE_FEED_RECORD_MS } from '../mock/test-clock.mjs';
import { normalizeApiRecord } from '../src/normalize-api-record';
import realFixture from './fixtures/pos-intake-log-feed-record.json';

describe('normalizeApiRecord (posIntakeLogFeed)', () => {
  it('maps milksha-cloud feed fields to UI model', () => {
    const row = normalizeApiRecord(realFixture);
    expect(row.storeNumber).toBe('s030570');
    expect(row.sourceIp).toBe('2a04:4e41:8:a1c::e1c5:8a1c');
    expect(row.entry).toBe('POS');
    expect(row.zones.ready.count).toBe(3);
    expect(row.zones.preparing.count).toBe(20);
    expect(row.zones.ready.numbers.map((n) => n.number)).toEqual(['#7805', '4D5EB', '4D5ED']);
    expect(row.result).toBe('success');
    expect(row.rawPayload).toContain('1794');
    expect(row.rawPayload).toContain('<REDACTED>');
    expect(row.rawPayload).not.toContain('requestSignature":"deadbeef');
    expect(row.receivedAtMs).toBe(LIVE_FEED_RECORD_MS);
  });

  it('maps zero counts without treating as empty', () => {
    const row = normalizeApiRecord({
      ...realFixture,
      readyCount: 0,
      preparingCount: 0,
      readyNumbers: [],
      preparingNumbers: [],
    });
    expect(row.zones.ready.count).toBe(0);
    expect(row.zones.preparing.count).toBe(0);
  });
});
