/**
 * POS send-time (sentAtMs) vs cloud receive-time skew policy (10s inclusive).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const POS_SENT_AT_MAX_SKEW_MS = 10000;

  /**
   * @param {number} deviceSentAtMs
   * @param {number} cloudNowMs
   * @returns {boolean}
   */
  function isWithinPosSentAtSkew(deviceSentAtMs, cloudNowMs) {
    const deviceMs = Math.floor(Number(deviceSentAtMs));
    const cloudMs = Math.floor(Number(cloudNowMs));
    if (!Number.isFinite(deviceMs) || !Number.isFinite(cloudMs)) {
      return false;
    }
    return Math.abs(cloudMs - deviceMs) <= POS_SENT_AT_MAX_SKEW_MS;
  }

  /**
   * @param {unknown} sentAtMs device top-level sentAtMs
   * @param {number} cloudNowMs
   * @returns {{ posSentAtMs: number | null, posSentAtIgnored: boolean }}
   */
  function evaluatePosSentAtClock(sentAtMs, cloudNowMs) {
    if (sentAtMs === undefined || sentAtMs === null) {
      return { posSentAtMs: null, posSentAtIgnored: false };
    }
    const deviceMs = Math.floor(Number(sentAtMs));
    if (!Number.isFinite(deviceMs) || deviceMs < 0) {
      return { posSentAtMs: null, posSentAtIgnored: false };
    }
    if (isWithinPosSentAtSkew(deviceMs, cloudNowMs)) {
      return { posSentAtMs: deviceMs, posSentAtIgnored: false };
    }
    return { posSentAtMs: null, posSentAtIgnored: true };
  }

  /**
   * Test hook: fixed cloud "now" for local POC / Playwright (not used in production STB).
   * @returns {number}
   */
  function readCloudNowMs() {
    const testNow = root.__MILKSHA_TEST_CLOUD_NOW_MS;
    if (typeof testNow === 'number' && Number.isFinite(testNow)) {
      return Math.floor(testNow);
    }
    return Date.now();
  }

  QMS.Transport.PosSentAtClock = {
    POS_SENT_AT_MAX_SKEW_MS: POS_SENT_AT_MAX_SKEW_MS,
    isWithinPosSentAtSkew: isWithinPosSentAtSkew,
    evaluatePosSentAtClock: evaluatePosSentAtClock,
    readCloudNowMs: readCloudNowMs,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
