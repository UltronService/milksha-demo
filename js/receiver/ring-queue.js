/**
 * FIFO ready-ring queue: overlay + chime per item, fixed dwell, no gap between items.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  const DEFAULT_OVERLAY_MS = 2500;

  /**
   * @param {{
   *   overlayDurationMs?: number,
   *   setTimeout?: (fn: () => void, ms: number) => unknown,
   *   clearTimeout?: (id: unknown) => void,
   *   onPlay: (id: string, number: string) => void,
   *   onHideOverlay?: () => void,
   * }} options
   */
  function createReadyRingQueue(options) {
    const overlayMs = options.overlayDurationMs || DEFAULT_OVERLAY_MS;
    const setTimeoutFn = options.setTimeout || root.setTimeout.bind(root);
    const clearTimeoutFn = options.clearTimeout || root.clearTimeout.bind(root);
    const onPlay = options.onPlay;
    const onHideOverlay = options.onHideOverlay || function () {};

    /** @type {Array<{ id: string, number: string }>} */
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

    function pruneQueue() {
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

    function playHead() {
      pruneQueue();
      if (queue.length === 0) {
        finishDrain();
        return;
      }
      const item = queue[0];
      try {
        onPlay(item.id, item.number);
      } catch (e) {
        /* ignore */
      }
      clearDrainTimer();
      drainTimer = setTimeoutFn(function () {
        drainTimer = null;
        if (queue.length > 0 && queue[0].id === item.id) {
          queue.shift();
          queuedIds.delete(item.id);
        }
        if (queue.length === 0) {
          finishDrain();
          return;
        }
        playHead();
      }, overlayMs);
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
      for (let i = 0; i < list.length; i += 1) {
        const id = String(list[i]);
        if (queuedIds.has(id)) {
          continue;
        }
        if (!currentReadySet.has(id)) {
          continue;
        }
        queue.push({ id: id, number: idToNumber(id) });
        queuedIds.add(id);
      }
      scheduleDrain();
    }

    function notifyAudioBlocked() {
      audioBlocked = true;
      clearDrainTimer();
      draining = false;
    }

    function unlockAudioFromGesture() {
      audioBlocked = false;
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
