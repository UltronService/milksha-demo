/**
 * Clock offset from boxHeartbeat.serverNowMs (cloud time is truth).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  const DEFAULT_RESYNC_MS = 10 * 60 * 1000;

  /**
   * @param {{ resyncIntervalMs?: number, now?: () => number }} [opts]
   */
  function createBoxSeenClock(opts) {
    const resyncIntervalMs =
      opts && Number.isFinite(opts.resyncIntervalMs) && opts.resyncIntervalMs > 0
        ? opts.resyncIntervalMs
        : DEFAULT_RESYNC_MS;
    const nowFn = opts && opts.now ? opts.now : function () {
      return Date.now();
    };

    let clockSynced = false;
    let clockOffsetMs = null;
    let lastSyncAtMs = 0;

    function clearSync() {
      clockSynced = false;
      clockOffsetMs = null;
    }

    function needsResync() {
      if (!lastSyncAtMs) {
        return true;
      }
      return nowFn() - lastSyncAtMs >= resyncIntervalMs;
    }

    /**
     * @param {{ serverNowMs?: number }} resp
     */
    function noteHeartbeat(resp) {
      const serverNow = resp && Number(resp.serverNowMs);
      if (!Number.isFinite(serverNow)) {
        clearSync();
        return;
      }
      const local = nowFn();
      clockSynced = true;
      clockOffsetMs = local - serverNow;
      lastSyncAtMs = local;
    }

    function getState() {
      return {
        clockSynced: clockSynced,
        clockOffsetMs: clockSynced ? clockOffsetMs : null,
      };
    }

    /**
     * @param {number} localMs
     * @returns {number | null}
     */
    function toCorrectedLocalMs(localMs) {
      if (!clockSynced || clockOffsetMs == null) {
        return null;
      }
      const n = Number(localMs);
      if (!Number.isFinite(n)) {
        return null;
      }
      return n - clockOffsetMs;
    }

    return {
      noteHeartbeat: noteHeartbeat,
      getState: getState,
      toCorrectedLocalMs: toCorrectedLocalMs,
      needsResync: needsResync,
    };
  }

  QMS.Board.createBoxSeenClock = createBoxSeenClock;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
