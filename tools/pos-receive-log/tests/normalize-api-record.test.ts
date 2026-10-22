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
    expect(row.messageSummary.bodyByteSize).toBe(1794);
    expect(row.rawPayload).toBe('');
    expect(row.messageSummary.disposition).toBe('accepted');
    expect(row.receivedAtMs).toBe(LIVE_FEED_RECORD_MS);
  });

  it('TDD-23: non-empty rawPayload from API is kept verbatim', () => {
    const row = normalizeApiRecord({
      ...realFixture,
      rawPayload: '{"keep":true}',
    });
    expect(row.rawPayload).toBe('{"keep":true}');
  });

  it('TDD-24: missing rawPayload still exposes message summary fields', () => {
    const row = normalizeApiRecord(realFixture);
    expect(row.messageSummary.bodyByteSize).toBe(1794);
    expect(row.messageSummary.httpStatus).toBe(200);
  });

  it('TDD-25: rawPayloadTruncated maps to boolean', () => {
    const row = normalizeApiRecord({ ...realFixture, rawPayloadTruncated: true });
    expect(row.rawPayloadTruncated).toBe(true);
  });

  it('records boxReports feed shape from raw API', () => {
    expect(normalizeApiRecord(realFixture).boxReportsFeedShape).toBe('missing');
    expect(
      normalizeApiRecord({ ...realFixture, boxReports: [] }).boxReportsFeedShape,
    ).toBe('array');
    expect(
      normalizeApiRecord({ ...realFixture, boxReports: 'bad' }).boxReportsFeedShape,
    ).toBe('invalid');
  });

  describe('mapSourceToEntry (入口 regression)', () => {
    it('1) posReceiver maps to entry POS', () => {
      const row = normalizeApiRecord({ ...realFixture, source: 'posReceiver' });
      expect(row.entry).toBe('POS');
    });

    it('2) devCommand_push_numbers (23:01:13 fixture) maps to entry controller', () => {
      const row = normalizeApiRecord({
        id: 'UCi1UHnreiRGYRM4cl5v',
        storeId: 'zz-qa-store-a',
        deviceId: 'web-qa55-one-1792681272848',
        source: 'devCommand_push_numbers',
        receivedAtMs: 1792681273101,
        disposition: 'rejected',
      });
      expect(row.entry).toBe('controller');
    });

    it('3) legacy source containing controller maps to entry controller', () => {
      const row = normalizeApiRecord({
        id: 'legacy-ctrl',
        storeId: 'zz-qa-store-a',
        source: 'fooControllerBar',
        receivedAtMs: LIVE_FEED_RECORD_MS,
        disposition: 'accepted',
      });
      expect(row.entry).toBe('controller');
    });

    it('4) unrecognised source maps to entry unknown', () => {
      const row = normalizeApiRecord({
        id: 'unk',
        storeId: 'zz-qa-store-a',
        source: 'mysteryGateway',
        receivedAtMs: LIVE_FEED_RECORD_MS,
        disposition: 'accepted',
      });
      expect(row.entry).toBe('unknown');
    });

    it('5) missing or empty source maps to entry unknown', () => {
      const missing = normalizeApiRecord({
        id: 'empty-src',
        storeId: 'zz-qa-store-a',
        receivedAtMs: LIVE_FEED_RECORD_MS,
        disposition: 'accepted',
      });
      expect(missing.entry).toBe('unknown');

      const empty = normalizeApiRecord({
        id: 'blank-src',
        storeId: 'zz-qa-store-a',
        source: '',
        receivedAtMs: LIVE_FEED_RECORD_MS,
        disposition: 'accepted',
      });
      expect(empty.entry).toBe('unknown');
    });
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
