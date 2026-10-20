/**
 * POS receive log UI: masked IP and delay display (box seen report log page).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Tools = QMS.Tools || {};

  /**
   * Log page IP display (director: full IP for now; swap return line to mask later).
   * @param {string} ip
   * @returns {string}
   */
  function formatIpForDisplay(ip) {
    if (!ip || typeof ip !== 'string') {
      return '';
    }
    const trimmed = ip.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed;
  }

  /**
   * @param {number | null | undefined} delayMs
   * @returns {string}
   */
  function formatReceiveDelaySecondsFromMs(delayMs) {
    if (delayMs == null) {
      return '';
    }
    const n = Number(delayMs);
    if (!Number.isFinite(n)) {
      return '';
    }
    return (n / 1000).toFixed(3);
  }

  /**
   * @param {number | null | undefined} delayMs
   * @returns {string}
   */
  function formatReceiveDelayCell(delayMs) {
    const sec = formatReceiveDelaySecondsFromMs(delayMs);
    if (!sec) {
      return '';
    }
    const asNum = Number(sec);
    if (asNum < 0) {
      return sec + ' 兩邊時鐘不同';
    }
    return sec;
  }

  QMS.Tools.PosReceiveLogFormat = {
    formatIpForDisplay: formatIpForDisplay,
    formatReceiveDelaySecondsFromMs: formatReceiveDelaySecondsFromMs,
    formatReceiveDelayCell: formatReceiveDelayCell,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
