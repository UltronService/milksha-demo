'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatWaitingPairLine,
  QA_WAITING_STORE,
  PAIR_RETRY_MIN_MS,
  CLOUD_WAITING_PAIR_BODY,
  CLOUD_INVALID_STORE_FORMAT_BODY,
} = require('./helpers/waiting-pair-contract.js');
const { loadWaitingPairModule } = require('./helpers/load-waiting-pair-module.js');

test('item 2: display store id trims ends only and preserves URL casing', function () {
  const WP = loadWaitingPairModule();
  assert.equal(WP.normalizeUrlStoreForDisplay('  S999998  '), 'S999998');
  assert.equal(WP.normalizeUrlStoreForDisplay('\ts999998\n'), 's999998');
});

test('item 2: formatWaitingPairLine uses ideographic space before 等待配對中', function () {
  const WP = loadWaitingPairModule();
  const expected = formatWaitingPairLine('S999998');
  assert.equal(WP.formatWaitingPairLine('S999998'), expected);
  assert.match(expected, /店編號 S999998\u3000等待配對中/);
});

test('item 10: PAIR_RETRY_INTERVAL_MS is at least 10 seconds', function () {
  const WP = loadWaitingPairModule();
  assert.ok(WP.PAIR_RETRY_INTERVAL_MS >= PAIR_RETRY_MIN_MS);
  assert.equal(WP.PAIR_RETRY_INTERVAL_MS, PAIR_RETRY_MIN_MS);
});

test('item 13: stopRetry clears scheduled retry timer id', function () {
  const WP = loadWaitingPairModule();
  const state = WP.createRetryScheduler({
    setTimeout: (fn, ms) => {
      assert.equal(ms, PAIR_RETRY_MIN_MS);
      return 42;
    },
    clearTimeout: (id) => {
      assert.equal(id, 42);
    },
  });
  state.scheduleRetry(() => {});
  assert.equal(state.getActiveTimerCount(), 1);
  state.stopRetry();
  assert.equal(state.getActiveTimerCount(), 0);
});

test('item 7: escapeStoreForOverlay uses text semantics (no HTML tags in output)', function () {
  const WP = loadWaitingPairModule();
  const raw = '<b>s999998</b>';
  const out = WP.escapeStoreForOverlay(raw);
  assert.equal(out, raw);
  assert.doesNotMatch(out, /<b>/);
});

test('item 17: classifyBoardAutoPairResponse maps cloud waiting_pair code', function () {
  const WP = loadWaitingPairModule();
  assert.equal(WP.classifyBoardAutoPairResponse(CLOUD_WAITING_PAIR_BODY), 'waiting');
});

test('item 17: classifyBoardAutoPairResponse maps invalid_store_format to invalid_format', function () {
  const WP = loadWaitingPairModule();
  assert.equal(WP.classifyBoardAutoPairResponse(CLOUD_INVALID_STORE_FORMAT_BODY), 'invalid_format');
});

test('item 17: classifyBoardAutoPairResponse maps success', function () {
  const WP = loadWaitingPairModule();
  assert.equal(
    WP.classifyBoardAutoPairResponse({
      ok: true,
      storeId: QA_WAITING_STORE,
      storeName: 'QA',
      storeNumber: QA_WAITING_STORE,
      customToken: 'tok',
    }),
    'success',
  );
});

test('item 22: simulateHourOfRetries does not accumulate timers (mock)', function () {
  const WP = loadWaitingPairModule();
  let active = 0;
  let peak = 0;
  const result = WP.simulateHourOfRetries({
    retryIntervalMs: PAIR_RETRY_MIN_MS,
    durationMs: 60 * 60 * 1000,
    setTimeout: (_fn, _ms) => {
      active += 1;
      peak = Math.max(peak, active);
      return active;
    },
    clearTimeout: () => {
      active -= 1;
    },
  });
  assert.equal(result.attempts, 360);
  assert.equal(peak, 1);
  assert.ok(result.heapDeltaMb <= 5);
});
