/**
 * Controller send timestamp (sentAtMs) — testable helpers for POS + devCommand sends.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};

  const POS_SENT_AT_IGNORED_FIELD = 'posSentAtIgnored';
  const CLOCK_WARNING_TEXT = '裝置時鐘不準';
  const SENT_TIME_ANOMALY_TEXT = '時間異常';
  const MAX_CLOCK_SKEW_MS = 10000;

  /**
   * @param {() => number} [nowMs]
   * @returns {number}
   */
  function readSendTimestampMs(nowMs) {
    const raw = typeof nowMs === 'function' ? nowMs() : Date.now();
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) {
      return Date.now();
    }
    return n;
  }

  /**
   * @param {object} base posReceiver draft without sentAtMs
   * @param {number} sentAtMs
   * @returns {object}
   */
  function wrapPosReceiverRequest(base, sentAtMs) {
    const ms = Math.floor(Number(sentAtMs));
    if (!Number.isFinite(ms) || ms < 0) {
      throw new Error('invalid sentAtMs');
    }
    return Object.assign({}, base, { sentAtMs: ms });
  }

  /**
   * @param {{
   *   merchant_id: string,
   *   account: string,
   *   target: string,
   *   numberContent: Array<{ source_type: string, number: string }>,
   *   sentAtMs: number,
   * }} input
   */
  function buildPosReceiverDraft(input) {
    const base = {
      isEncrypt: false,
      serviceSpecialData_Json: {
        target: input.target,
        data: {
          number_content: input.numberContent || [],
          newsTicker_content: [],
          newsTickerSpeed: 0,
        },
      },
      merchant_id: input.merchant_id,
      account: input.account,
    };
    return wrapPosReceiverRequest(base, input.sentAtMs);
  }

  /**
   * @param {object|null|undefined} res
   * @returns {boolean}
   */
  function isPosSentAtIgnoredResponse(res) {
    if (!res || typeof res !== 'object') {
      return false;
    }
    return res[POS_SENT_AT_IGNORED_FIELD] === true;
  }

  /**
   * @param {object|null|undefined} res
   * @returns {string}
   */
  function controllerClockWarningMessage(res) {
    return isPosSentAtIgnoredResponse(res) ? CLOCK_WARNING_TEXT : '';
  }

  /**
   * @param {object|null|undefined} _res
   * @returns {boolean}
   */
  function shouldBlockSendOnClockWarning(_res) {
    return false;
  }

  /**
   * @param {number} deviceSentAtMs
   * @param {number} cloudNowMs
   * @returns {boolean}
   */
  function isClockSkewWithinTolerance(deviceSentAtMs, cloudNowMs) {
    const diff = Math.abs(Number(cloudNowMs) - Number(deviceSentAtMs));
    return diff <= MAX_CLOCK_SKEW_MS;
  }

  QMS.Controller.SendTiming = {
    POS_SENT_AT_IGNORED_FIELD: POS_SENT_AT_IGNORED_FIELD,
    CLOCK_WARNING_TEXT: CLOCK_WARNING_TEXT,
    SENT_TIME_ANOMALY_TEXT: SENT_TIME_ANOMALY_TEXT,
    MAX_CLOCK_SKEW_MS: MAX_CLOCK_SKEW_MS,
    readSendTimestampMs: readSendTimestampMs,
    wrapPosReceiverRequest: wrapPosReceiverRequest,
    buildPosReceiverDraft: buildPosReceiverDraft,
    isPosSentAtIgnoredResponse: isPosSentAtIgnoredResponse,
    controllerClockWarningMessage: controllerClockWarningMessage,
    shouldBlockSendOnClockWarning: shouldBlockSendOnClockWarning,
    isClockSkewWithinTolerance: isClockSkewWithinTolerance,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
