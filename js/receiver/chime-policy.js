/**
 * In-memory chime policy: ring only when an id newly enters the ready set.
 * First apply after load never rings. Ready occupancy tracked for memory bounds.
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
    let readyOccupancy = new Set();
    let isFirstBatch = true;

    function syncReadyOccupancy(nextReady) {
      readyOccupancy = new Set(nextReady);
    }

    function onBusinessDateRoll() {
      /* chime no longer keyed by business date */
    }

    function onBoardCleared() {
      isFirstBatch = false;
      readyOccupancy = new Set();
    }

    function getReadyOccupancyCount() {
      return readyOccupancy.size;
    }

    /**
     * @param {Set<string>} prevReady
     * @param {Set<string>} nextReady
     * @param {{ silent?: boolean, suppressRing?: boolean, preserveFirstBatchFlag?: boolean }} [opts]
     * @returns {string[]}
     */
    function pickRingIds(prevReady, nextReady, opts) {
      if (!getBusinessDate()) {
        return [];
      }
      if (isFirstBatch) {
        if (!(opts && opts.preserveFirstBatchFlag)) {
          isFirstBatch = false;
        }
        syncReadyOccupancy(nextReady);
        return [];
      }
      syncReadyOccupancy(nextReady);
      if (opts && (opts.silent || opts.suppressRing)) {
        return [];
      }
      return newlyReadyIds(prevReady, nextReady);
    }

    return {
      pickRingIds: pickRingIds,
      onBusinessDateRoll: onBusinessDateRoll,
      onBoardCleared: onBoardCleared,
      getReadyOccupancyCount: getReadyOccupancyCount,
      syncBusinessDate: function () {},
    };
  }

  QMS.Receiver.createBoardChimePolicy = createBoardChimePolicy;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
