import { describe, expect, it } from 'vitest';
import {
  FIXED_TEST_NOW_MS,
  LIVE_FEED_RECORD_MS,
  SAMPLE_MS_A,
} from '../mock/test-clock.mjs';
import realFeedRecord from './fixtures/pos-intake-log-feed-record.json';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function assertInReceiveLogDefaultRange(receivedAtMs: number): void {
  const rangeStart = FIXED_TEST_NOW_MS - ONE_DAY_MS;
  const rangeEnd = FIXED_TEST_NOW_MS + ONE_HOUR_MS;
  expect(receivedAtMs).toBeGreaterThanOrEqual(rangeStart);
  expect(receivedAtMs).toBeLessThanOrEqual(rangeEnd);
}

describe('test clock invariants', () => {
  it('vitest uses frozen now (not real wall clock)', () => {
    expect(Date.now()).toBe(FIXED_TEST_NOW_MS);
  });

  it('mock and live feed fixtures sit inside ReceiveLogPage 1-day default range', () => {
    assertInReceiveLogDefaultRange(SAMPLE_MS_A);
    assertInReceiveLogDefaultRange(LIVE_FEED_RECORD_MS);
    expect(realFeedRecord.receivedAtMs).toBe(LIVE_FEED_RECORD_MS);
  });
});
