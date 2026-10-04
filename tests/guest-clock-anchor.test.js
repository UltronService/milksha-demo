'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

function guestClockDate(state, perfNow) {
  if (state.anchorCloudMs != null && state.anchorPerfMs != null) {
    return new Date(state.anchorCloudMs + (perfNow - state.anchorPerfMs));
  }
  return new Date();
}

test('cloud-anchored clock uses performance elapsed not Date.now', function () {
  const headerMs = Date.parse('Fri, 03 Oct 2026 14:00:00 GMT');
  const state = { anchorCloudMs: headerMs, anchorPerfMs: 1000 };
  const at500 = guestClockDate(state, 1500);
  const RealDate = Date;
  const fixed = RealDate.parse('1970-01-01T00:00:00.000Z');
  function MockDate(...args) {
    if (args.length === 0) {
      return new RealDate(fixed + 56 * 365.25 * 24 * 3600 * 1000);
    }
    return new RealDate(...args);
  }
  MockDate.now = function () {
    return fixed + 56 * 365.25 * 24 * 3600 * 1000;
  };
  const prev = global.Date;
  global.Date = MockDate;
  try {
    const at500AfterSkew = guestClockDate(state, 1500);
    assert.equal(at500AfterSkew.getTime(), at500.getTime());
    assert.notEqual(at500AfterSkew.getTime(), MockDate.now());
  } finally {
    global.Date = prev;
  }
});
