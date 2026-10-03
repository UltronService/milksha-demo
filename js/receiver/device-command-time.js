/**
 * Parse pendingCommand issuedAt/createdAt and boot-time reload guard.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  /**
   * @param {*} value
   * @returns {number|null} epoch ms or null when missing/unparseable
   */
  function parseCommandTimeValue(value) {
    if (value == null) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) {
        return null;
      }
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      }
      const parsed = Date.parse(s);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'object') {
      if (value.timestampValue != null) {
        const parsed = Date.parse(String(value.timestampValue));
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (value.integerValue != null) {
        const n = Number(value.integerValue);
        return Number.isFinite(n) ? n : null;
      }
      const secRaw = value.seconds != null ? value.seconds : value._seconds;
      if (secRaw != null) {
        const sec = Number(secRaw);
        if (!Number.isFinite(sec)) {
          return null;
        }
        const nanoRaw = value.nanos != null ? value.nanos : value._nanoseconds;
        const nanos = nanoRaw != null ? Number(nanoRaw) : 0;
        const extraMs = Number.isFinite(nanos) ? Math.floor(nanos / 1e6) : 0;
        return sec * 1000 + extraMs;
      }
    }
    return null;
  }

  /**
   * Prefer issuedAtMs, then issuedAt, then createdAt.
   * @param {object|null} cmd
   * @returns {number|null}
   */
  function commandServerTimeMs(cmd) {
    if (!cmd || typeof cmd !== 'object') {
      return null;
    }
    const issuedMs = parseCommandTimeValue(cmd.issuedAtMs);
    if (issuedMs != null) {
      return issuedMs;
    }
    const issued = parseCommandTimeValue(cmd.issuedAt);
    if (issued != null) {
      return issued;
    }
    return parseCommandTimeValue(cmd.createdAt);
  }

  /**
   * @param {number} epochMs
   * @returns {number|null}
   */
  function floorUtcToSecondMs(epochMs) {
    if (!Number.isFinite(epochMs)) {
      return null;
    }
    return Math.floor(epochMs / 1000) * 1000;
  }

  /**
   * @param {object|null} cmd
   * @param {number} bootServerTimeMs boot HTTP Date (ms)
   * @returns {boolean}
   */
  function shouldSkipReloadRebootByBootServerTime(cmd, bootServerTimeMs) {
    const type = cmd && cmd.type ? String(cmd.type) : '';
    if (type !== 'reload' && type !== 'reboot') {
      return false;
    }
    const bootMs = Number(bootServerTimeMs);
    if (!Number.isFinite(bootMs) || bootMs <= 0) {
      return false;
    }
    const cmdMs = commandServerTimeMs(cmd);
    if (cmdMs == null) {
      return false;
    }
    return cmdMs < bootMs;
  }

  QMS.Receiver.parseCommandTimeValue = parseCommandTimeValue;
  QMS.Receiver.commandServerTimeMs = commandServerTimeMs;
  QMS.Receiver.floorUtcCommandTimeToSecondMs = floorUtcToSecondMs;
  QMS.Receiver.shouldSkipReloadRebootByBootServerTime = shouldSkipReloadRebootByBootServerTime;
})(typeof globalThis !== 'undefined' ? globalThis : this);
