/**
 * Pickup ring / overlay telemetry for E2E (no Firebase SDK).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  root.__rcvTelemetry = root.__rcvTelemetry || { ringCount: 0, ringEvents: [] };

  let sharedAudioContext = null;
  let audioContextCreateCount = 0;
  let gestureUnlockHooked = false;
  /** @type {Set<string>} */
  let lastReadyIdSet = new Set();

  const ringQueue =
    QMS.Receiver.createReadyRingQueue &&
    QMS.Receiver.createReadyRingQueue({
      overlayDurationMs: QMS.Receiver.READY_RING_OVERLAY_MS || 2500,
      setTimeout: root.setTimeout.bind(root),
      clearTimeout: root.clearTimeout.bind(root),
      onPlay: function (_id, number, onChimeEnded) {
        recordRingTelemetry(number);
        showRingOverlayForQueue(number);
        playWebChime(onChimeEnded);
      },
      onHideOverlay: function () {
        hideRingOverlay();
      },
    });

  function ensureOverlay() {
    let ov = root.document.getElementById('rcv-ring-ov');
    if (ov) {
      return ov;
    }
    ov = root.document.createElement('div');
    ov.id = 'rcv-ring-ov';
    ov.setAttribute('aria-hidden', 'true');
    ov.style.cssText =
      'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45)';
    ov.innerHTML =
      '<div id="rcv-ring-box" style="background:#fff;padding:24px 48px;border-radius:12px;font-size:120px;font-weight:900"></div>';
    root.document.body.appendChild(ov);
    return ov;
  }

  function getSharedAudioContext() {
    if (sharedAudioContext) {
      return sharedAudioContext;
    }
    const Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) {
      return null;
    }
    sharedAudioContext = new Ctx();
    audioContextCreateCount += 1;
    return sharedAudioContext;
  }

  const CHIME_DURATION_S = 0.15;

  function hookGestureUnlock() {
    if (gestureUnlockHooked || !root.document) {
      return;
    }
    gestureUnlockHooked = true;
    const unlock = function () {
      try {
        const ctx = getSharedAudioContext();
        if (ctx && typeof ctx.resume === 'function') {
          ctx.resume().catch(function () {
            /* ignore */
          });
        }
      } catch (e) {
        /* ignore */
      }
      if (ringQueue) {
        ringQueue.unlockAudioFromGesture();
      }
    };
    const opts = { passive: true };
    root.document.addEventListener('pointerdown', unlock, opts);
    root.document.addEventListener('keydown', unlock, opts);
    root.document.addEventListener('touchstart', unlock, opts);
  }

  function playWebChime(onEnded) {
    const done = typeof onEnded === 'function' ? onEnded : function () {};
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) {
        done();
        return;
      }
      const resumePromise =
        ctx.state === 'suspended' && typeof ctx.resume === 'function' ? ctx.resume() : null;
      const run = function () {
        if (ctx.state === 'suspended') {
          if (ringQueue) {
            ringQueue.notifyAudioBlocked();
          }
          hookGestureUnlock();
          return;
        }
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.08;
        o.onended = function () {
          done();
        };
        o.start();
        o.stop(ctx.currentTime + CHIME_DURATION_S);
      };
      if (resumePromise && typeof resumePromise.then === 'function') {
        resumePromise
          .then(run)
          .catch(function () {
            if (ringQueue) {
              ringQueue.notifyAudioBlocked();
            }
            hookGestureUnlock();
          });
        return;
      }
      run();
    } catch (e) {
      if (ringQueue) {
        ringQueue.notifyAudioBlocked();
      }
      hookGestureUnlock();
      done();
    }
  }

  function showRingOverlayForQueue(number) {
    const ov = ensureOverlay();
    const box = root.document.getElementById('rcv-ring-box');
    if (box) {
      box.textContent = number;
    }
    ov.style.opacity = '1';
  }

  function hideRingOverlay() {
    const ov = root.document.getElementById('rcv-ring-ov');
    if (ov) {
      ov.style.opacity = '0';
    }
  }

  function recordRingTelemetry(number) {
    root.__rcvTelemetry.ringCount += 1;
    root.__rcvTelemetry.ringEvents.push({ at: Date.now(), number: number });
  }

  /**
   * @param {string} number
   */
  function playReadyRing(number) {
    const id = 'legacy:' + String(number);
    if (ringQueue) {
      lastReadyIdSet.add(id);
      ringQueue.syncReadyQueue(lastReadyIdSet);
      ringQueue.enqueueReadyIds([id]);
      return;
    }
    recordRingTelemetry(number);
    showRingOverlayForQueue(number);
    playWebChime();
  }

  function syncReadyQueue(readySet) {
    if (readySet instanceof Set) {
      lastReadyIdSet = new Set(readySet);
    } else if (readySet && typeof readySet.forEach === 'function') {
      lastReadyIdSet = new Set(readySet);
    } else {
      lastReadyIdSet = new Set();
    }
    if (ringQueue) {
      ringQueue.syncReadyQueue(lastReadyIdSet);
    }
  }

  function enqueueReadyIds(ids) {
    if (ringQueue) {
      ringQueue.enqueueReadyIds(ids);
    }
  }

  QMS.Receiver.RingHost = {
    playReadyRing: playReadyRing,
    syncReadyQueue: syncReadyQueue,
    enqueueReadyIds: enqueueReadyIds,
    resetTelemetry: function () {
      root.__rcvTelemetry.ringCount = 0;
      root.__rcvTelemetry.ringEvents = [];
    },
    getAudioContextCreateCount: function () {
      return audioContextCreateCount;
    },
    getQueueIdsForTests: function () {
      return ringQueue ? ringQueue.getQueueIds() : [];
    },
    _resetAudioContextForTests: function () {
      sharedAudioContext = null;
      audioContextCreateCount = 0;
      gestureUnlockHooked = false;
      lastReadyIdSet = new Set();
      if (ringQueue) {
        ringQueue.resetForTests();
      }
    },
    _getRingQueueForTests: function () {
      return ringQueue;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
