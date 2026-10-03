/**
 * Chime on newly-ready ids only. First apply after load is silent; use silent/suppressRing on reconnect.
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
    let trackedBusinessDate = getBusinessDate();
    let isFirstBatch = true;

    function syncBusinessDate() {
      trackedBusinessDate = getBusinessDate();
    }

    function onBusinessDateRoll() {
      trackedBusinessDate = getBusinessDate();
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
      return newlyReadyIds(prevReady, nextReady);
    }

    return {
      pickRingIds: pickRingIds,
      onBusinessDateRoll: onBusinessDateRoll,
      syncBusinessDate: syncBusinessDate,
    };
  }

  QMS.Receiver.createBoardChimePolicy = createBoardChimePolicy;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
