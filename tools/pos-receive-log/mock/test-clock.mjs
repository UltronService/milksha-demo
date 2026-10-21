/** Single source for vitest Date mock + fixture timestamps (never use Date.now in tests). */

export const FIXED_TEST_NOW_MS = Date.parse('2026-10-21T12:00:00.000Z');

/** 2026-10-21 11:58:03.215 Taipei */
export const SAMPLE_MS_A = Date.parse('2026-10-21T03:58:03.215Z');

/** Live feed JSON (receive-log test 15); inside default 1-day range of FIXED_TEST_NOW_MS. */
export const LIVE_FEED_RECORD_MS = Date.parse('2026-10-21T04:42:07.805Z');
