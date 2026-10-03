/**
 * In-memory chime dedupe: each item id rings at most once per business day.
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

    function syncBusinessDate() {
      const bd = getBusinessDate();
      if (trackedBusinessDate !== bd) {
        trackedBusinessDate = bd;
        chimedIds = new Set();
      }
    }

    function onBusinessDateRoll() {
      trackedBusinessDate = getBusinessDate();
      chimedIds = new Set();
    }

    /**
     * @param {Set<string>} prevReady
     * @param {Set<string>} nextReady
     * @param {{ silent?: boolean, suppressRing?: boolean }} [opts]
     * @returns {string[]}
     */
    function pickRingIds(prevReady, nextReady, opts) {
      syncBusinessDate();
      if (isFirstBatch) {
        isFirstBatch = false;
        return [];
      }
      if (opts && (opts.silent || opts.suppressRing)) {
        return [];
      }
      const newly = newlyReadyIds(prevReady, nextReady);
      const ringIds = [];
      for (let i = 0; i < newly.length; i += 1) {
        const id = newly[i];
        if (!chimedIds.has(id)) {
          ringIds.push(id);
          chimedIds.add(id);
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
