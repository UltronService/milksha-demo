/**
 * POS receive log UI: masked IP and delay display (box seen report log page).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Tools = QMS.Tools || {};

  /**
   * @param {string} ip
   * @returns {string}
   */
  function maskIpv4ForDisplay(ip) {
    if (!ip || typeof ip !== 'string') {
      return '';
    }
    const trimmed = ip.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 4) {
      return '';
    }
    for (let i = 0; i < 4; i += 1) {
      const p = parts[i];
      if (!/^\d{1,3}$/.test(p)) {
        return '';
      }
      const n = Number(p);
      if (n < 0 || n > 255) {
        return '';
      }
    }
    return parts[0] + '.' + parts[1] + '.*.*';
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
    maskIpv4ForDisplay: maskIpv4ForDisplay,
    formatReceiveDelaySecondsFromMs: formatReceiveDelaySecondsFromMs,
    formatReceiveDelayCell: formatReceiveDelayCell,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
