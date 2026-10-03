/**
 * In-memory chime dedupe: each ready item id rings at most once per business day.
 * Cleared on business-date roll (03:00 Taipei). First apply after load never rings.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  /**
   * @param {{ getBusinessDate: () => string, newlyReadyIds: (prev: Set<string>, next: Set<string>) => string[] }} options
   */
  function createBoardChimePolicy(options) {
    const getBusinessDate = options.getBusinessDate;
    const newlyReadyIds = options.newlyReadyIds;
    let chimedIds = new Set();
    let trackedBusinessDate = getBusinessDate();
    let isFirstBatch = true;

    function clearChimedForNewBusinessDay() {
      chimedIds = new Set();
      trackedBusinessDate = getBusinessDate();
    }

    function syncBusinessDate() {
      const bd = getBusinessDate();
      if (!bd) {
        return;
      }
      if (trackedBusinessDate !== bd) {
        clearChimedForNewBusinessDay();
      }
    }

    function onBusinessDateRoll() {
      clearChimedForNewBusinessDay();
    }

    /**
     * @param {Set<string>} prevReady
     * @param {Set<string>} nextReady
     * @param {{ silent?: boolean, suppressRing?: boolean }} [opts]
     * @returns {string[]}
     */
    function numberFromItemId(id) {
      const parts = String(id).split(':');
      return parts.length > 1 ? parts[parts.length - 1] : parts[0];
    }

    function chimeDedupeKey(id) {
      const bd = getBusinessDate();
      return bd + '#' + numberFromItemId(id);
    }

    function pickRingIds(prevReady, nextReady, opts) {
      if (!getBusinessDate()) {
        return [];
      }
      syncBusinessDate();
      if (isFirstBatch) {
        if (!(opts && opts.preserveFirstBatchFlag)) {
          isFirstBatch = false;
        }
        nextReady.forEach(function (id) {
          chimedIds.add(chimeDedupeKey(id));
        });
        return [];
      }
      if (opts && (opts.silent || opts.suppressRing)) {
        return [];
      }
      const newly = newlyReadyIds(prevReady, nextReady);
      const ringIds = [];
      for (let i = 0; i < newly.length; i += 1) {
        const id = newly[i];
        const key = chimeDedupeKey(id);
        if (!chimedIds.has(key)) {
          ringIds.push(id);
          chimedIds.add(key);
        }
      }
      return ringIds;
    }

    return {
      pickRingIds: pickRingIds,
      onBusinessDateRoll: onBusinessDateRoll,
      syncBusinessDate: syncBusinessDate,
    };
  }

  QMS.Receiver.createBoardChimePolicy = createBoardChimePolicy;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
