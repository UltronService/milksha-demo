/**
 * FIFO ready-ring queue: overlay + chime per item, sequential (no overlap), bounded.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  const DEFAULT_OVERLAY_MS = 2500;
  const DEFAULT_GAP_MS = 120;
  const MAX_QUEUE_LEN = 32;
  const STALE_QUEUE_MS = 8000;

  /**
   * @param {{
   *   overlayDurationMs?: number,
   *   gapBetweenItemsMs?: number,
   *   maxQueueLen?: number,
   *   staleQueueMs?: number,
   *   setTimeout?: (fn: () => void, ms: number) => unknown,
   *   clearTimeout?: (id: unknown) => void,
   *   onPlay: (id: string, number: string, onChimeEnded: () => void) => void,
   *   onHideOverlay?: () => void,
   * }} options
   */
  function createReadyRingQueue(options) {
    const overlayMs = options.overlayDurationMs || DEFAULT_OVERLAY_MS;
    const gapMs = options.gapBetweenItemsMs || DEFAULT_GAP_MS;
    const maxQueueLen = options.maxQueueLen || MAX_QUEUE_LEN;
    const staleQueueMs = options.staleQueueMs || STALE_QUEUE_MS;
    const setTimeoutFn = options.setTimeout || root.setTimeout.bind(root);
    const clearTimeoutFn = options.clearTimeout || root.clearTimeout.bind(root);
    const onPlay = options.onPlay;
    const onHideOverlay = options.onHideOverlay || function () {};

    /** @type {Array<{ id: string, number: string, enqueuedAt: number }>} */
    let queue = [];
    const queuedIds = new Set();
    /** @type {Set<string>} */
    let currentReadySet = new Set();
    let draining = false;
    let drainTimer = null;
    let audioBlocked = false;

    function idToNumber(id) {
      const parts = String(id).split(':');
      return parts.length > 1 ? parts[parts.length - 1] : parts[0];
    }

    function rebuildQueuedIds() {
      queuedIds.clear();
      for (let i = 0; i < queue.length; i += 1) {
        queuedIds.add(queue[i].id);
      }
    }

    function dropStaleFromQueue() {
      const now = Date.now();
      const next = [];
      for (let i = 0; i < queue.length; i += 1) {
        if (now - queue[i].enqueuedAt <= staleQueueMs) {
          next.push(queue[i]);
        }
      }
      queue = next;
      rebuildQueuedIds();
    }

    function pruneQueue() {
      dropStaleFromQueue();
      const playingId = draining && queue.length > 0 ? queue[0].id : null;
      const next = [];
      for (let i = 0; i < queue.length; i += 1) {
        if (currentReadySet.has(queue[i].id)) {
          next.push(queue[i]);
        }
      }
      queue = next;
      rebuildQueuedIds();
      if (draining && playingId && !queuedIds.has(playingId)) {
        clearDrainTimer();
        draining = false;
        scheduleDrain();
      }
    }

    function clearDrainTimer() {
      if (drainTimer != null) {
        clearTimeoutFn(drainTimer);
        drainTimer = null;
      }
    }

    function finishDrain() {
      clearDrainTimer();
      draining = false;
      onHideOverlay();
    }

    function shiftHeadIfMatches(item) {
      if (queue.length > 0 && queue[0].id === item.id) {
        queue.shift();
        queuedIds.delete(item.id);
      }
    }

    function playHead() {
      pruneQueue();
      if (queue.length === 0) {
        finishDrain();
        return;
      }
      const item = queue[0];
      const startedAt = Date.now();
      let advanced = false;

      function scheduleAdvanceAfterChime() {
        if (advanced) {
          return;
        }
        advanced = true;
        clearDrainTimer();
        const elapsed = Date.now() - startedAt;
        const dwellRemain = Math.max(0, overlayMs - elapsed);
        drainTimer = setTimeoutFn(function () {
          drainTimer = null;
          shiftHeadIfMatches(item);
          if (queue.length === 0) {
            finishDrain();
            return;
          }
          drainTimer = setTimeoutFn(function () {
            drainTimer = null;
            playHead();
          }, gapMs);
        }, dwellRemain + gapMs);
      }

      try {
        onPlay(item.id, item.number, scheduleAdvanceAfterChime);
      } catch (e) {
        scheduleAdvanceAfterChime();
      }
      drainTimer = setTimeoutFn(function () {
        scheduleAdvanceAfterChime();
      }, overlayMs + gapMs + 800);
    }

    function scheduleDrain() {
      if (draining || audioBlocked) {
        return;
      }
      pruneQueue();
      if (queue.length === 0) {
        return;
      }
      draining = true;
      playHead();
    }

    function syncReadyQueue(readySet) {
      if (readySet instanceof Set) {
        currentReadySet = readySet;
      } else if (readySet && typeof readySet === 'object') {
        currentReadySet = new Set(Object.keys(readySet));
      } else {
        currentReadySet = new Set();
      }
      pruneQueue();
      if (!draining && !audioBlocked && queue.length > 0) {
        scheduleDrain();
      }
    }

    function enqueueReadyIds(ids) {
      const list = Array.isArray(ids) ? ids : [];
      const now = Date.now();
      for (let i = 0; i < list.length; i += 1) {
        const id = String(list[i]);
        if (queuedIds.has(id)) {
          continue;
        }
        if (!currentReadySet.has(id)) {
          continue;
        }
        queue.push({ id: id, number: idToNumber(id), enqueuedAt: now });
        queuedIds.add(id);
        while (queue.length > maxQueueLen) {
          const dropped = queue.shift();
          if (dropped) {
            queuedIds.delete(dropped.id);
          }
        }
      }
      scheduleDrain();
    }

    function notifyAudioBlocked() {
      audioBlocked = true;
      clearDrainTimer();
      draining = false;
      dropStaleFromQueue();
    }

    function unlockAudioFromGesture() {
      audioBlocked = false;
      dropStaleFromQueue();
      scheduleDrain();
    }

    function resetForTests() {
      clearDrainTimer();
      queue = [];
      queuedIds.clear();
      currentReadySet = new Set();
      draining = false;
      audioBlocked = false;
    }

    return {
      OVERLAY_DURATION_MS: overlayMs,
      syncReadyQueue: syncReadyQueue,
      enqueueReadyIds: enqueueReadyIds,
      notifyAudioBlocked: notifyAudioBlocked,
      unlockAudioFromGesture: unlockAudioFromGesture,
      getQueueIds: function () {
        return queue.map(function (item) {
          return item.id;
        });
      },
      isDraining: function () {
        return draining;
      },
      resetForTests: resetForTests,
    };
  }

  QMS.Receiver.READY_RING_OVERLAY_MS = DEFAULT_OVERLAY_MS;
  QMS.Receiver.createReadyRingQueue = createReadyRingQueue;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
