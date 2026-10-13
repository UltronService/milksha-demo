'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('legacy parallel sample times miss late enter-from-above (regression)', () => {
  const {
    legacyParallelSampleTimesMs,
    triggerFirstSampleTimesMs,
    synthesizeEnterSampleAtMs,
    enterFromAboveWouldPass,
  } = require('../tests/e2e/board-column-move-poll-timing.mjs');

  /** Chip lands in slot already settled (CI log shape); parallel poll never sees translateY. */
  const instantSettleProfile = {
    animStartMs: 16,
    durationMs: 0,
    peakTranslateY: 0,
    settledTop: 265.29168701171875,
  };

  const legacyTimes = legacyParallelSampleTimesMs(28, 16);
  const legacySamples = legacyTimes.map((t) => synthesizeEnterSampleAtMs(t, instantSettleProfile));
  assert.equal(
    enterFromAboveWouldPass(legacySamples),
    false,
    'legacy parallel sees only post-settle frames when motion finishes before meaningful samples',
  );

  const motionProfile = {
    animStartMs: 16,
    durationMs: 320,
    peakTranslateY: -150,
    settledTop: 265.29168701171875,
  };
  const fixedTimes = triggerFirstSampleTimesMs(28, 16, motionProfile.animStartMs);
  const fixedSamples = fixedTimes.map((t) => synthesizeEnterSampleAtMs(t, motionProfile));
  assert.equal(
    enterFromAboveWouldPass(fixedSamples),
    true,
    'post-trigger sampling from column-move start should observe enter-from-above',
  );
});

test('enterFromAboveWouldPass rejects CI static samples JSON shape', () => {
  const { enterFromAboveWouldPass } = require('../tests/e2e/board-column-move-poll-timing.mjs');
  const staticSample = {
    opacity: '1',
    transform: 'none',
    top: 265.29168701171875,
    left: 1034.703125,
    float: false,
  };
  const ciLike = Array.from({ length: 28 }, () => ({ ...staticSample }));
  assert.equal(enterFromAboveWouldPass(ciLike), false);
});
