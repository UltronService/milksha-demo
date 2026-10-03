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
  let audioResumeInFlight = null;
  /** @type {Set<string>} */
  let lastReadyIdSet = new Set();

  const RESUME_TIMEOUT_MS = 2500;
  const CHIME_DURATION_S = 0.15;

  const ringQueue =
    QMS.Receiver.createReadyRingQueue &&
    QMS.Receiver.createReadyRingQueue({
      overlayDurationMs: QMS.Receiver.READY_RING_OVERLAY_MS || 2500,
      gapBetweenItemsMs: 0,
      setTimeout: root.setTimeout.bind(root),
      clearTimeout: root.clearTimeout.bind(root),
      onPlay: function (_id, number, onChimeEnded) {
        playWebChime(number, onChimeEnded);
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
    ov.innerHTML =
      '<div id="rcv-ring-box">' +
      '<div class="rcv-ring-label" id="rcv-ring-label">請取餐</div>' +
      '<div class="rcv-ring-num" id="rcv-ring-num"></div>' +
      '</div>';
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

  function blockAutoplay() {
    hideRingOverlay();
    if (ringQueue) {
      ringQueue.notifyAudioBlocked();
    }
    hookGestureUnlock();
  }

  function runOscillator(ctx, number, onEnded) {
    const done = typeof onEnded === 'function' ? onEnded : function () {};
    if (ctx.state === 'suspended') {
      blockAutoplay();
      return;
    }
    recordRingTelemetry(number);
    showRingOverlayForQueue(number);
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
  }

  function awaitCtxResume(ctx) {
    if (ctx.state !== 'suspended' || typeof ctx.resume !== 'function') {
      return Promise.resolve();
    }
    if (audioResumeInFlight) {
      return audioResumeInFlight;
    }
    audioResumeInFlight = Promise.race([
      ctx.resume(),
      new Promise(function (resolve) {
        root.setTimeout(resolve, RESUME_TIMEOUT_MS);
      }),
    ]).finally(function () {
      audioResumeInFlight = null;
    });
    return audioResumeInFlight;
  }

  function playWebChime(number, onEnded) {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) {
        if (typeof onEnded === 'function') {
          onEnded();
        }
        return;
      }
      if (ctx.state !== 'suspended') {
        runOscillator(ctx, number, onEnded);
        return;
      }
      if (audioResumeInFlight) {
        blockAutoplay();
        return;
      }
      awaitCtxResume(ctx)
        .then(function () {
          runOscillator(ctx, number, onEnded);
        })
        .catch(function () {
          blockAutoplay();
        });
    } catch (e) {
      blockAutoplay();
    }
  }

  function hookGestureUnlock() {
    if (gestureUnlockHooked || !root.document) {
      return;
    }
    gestureUnlockHooked = true;
    const unlock = function () {
      try {
        const ctx = getSharedAudioContext();
        if (!ctx) {
          if (ringQueue) {
            ringQueue.unlockAudioFromGesture();
          }
          return;
        }
        awaitCtxResume(ctx)
          .then(function () {
            if (ctx.state === 'suspended') {
              return;
            }
            if (ringQueue) {
              ringQueue.unlockAudioFromGesture();
            }
          })
          .catch(function () {
            /* wait for next gesture */
          });
      } catch (e) {
        /* ignore */
      }
    };
    const opts = { passive: true };
    root.document.addEventListener('pointerdown', unlock, opts);
    root.document.addEventListener('keydown', unlock, opts);
    root.document.addEventListener('touchstart', unlock, opts);
  }

  function syncRing6975672LayoutFlag() {
    const docEl = root.document.documentElement;
    if (!docEl) {
      return;
    }
    const vw = Number(root.innerWidth || docEl.clientWidth || 0);
    if (vw >= 1900 && vw <= 1940) {
      docEl.setAttribute('data-rcv-ring-6975672', '1');
    } else {
      docEl.removeAttribute('data-rcv-ring-6975672');
    }
  }

  function showRingOverlayForQueue(number) {
    const ov = ensureOverlay();
    const numEl = root.document.getElementById('rcv-ring-num');
    if (numEl) {
      numEl.textContent = number;
    }
    syncRing6975672LayoutFlag();
    ov.style.opacity = '1';
  }

  function hideRingOverlay() {
    const ov = root.document.getElementById('rcv-ring-ov');
    if (ov) {
      ov.style.opacity = '0';
    }
    const docEl = root.document.documentElement;
    if (docEl) {
      docEl.removeAttribute('data-rcv-ring-6975672');
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
    playWebChime(number);
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
      audioResumeInFlight = null;
      lastReadyIdSet = new Set();
      if (ringQueue) {
        ringQueue.resetForTests();
      }
    },
    _getRingQueueForTests: function () {
      return ringQueue;
    },
    _setSharedAudioContextForTests: function (ctx) {
      sharedAudioContext = ctx;
    },
    showRingOverlayForTests: function (number) {
      showRingOverlayForQueue(String(number));
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
