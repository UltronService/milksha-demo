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
  /** Match receiver-demo/index.html 6975672 layout media query. */
  const RING_LAYOUT_VW_MIN = 1900;
  const RING_LAYOUT_VW_MAX = 1940;
  let ringResizeHooked = false;

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

  function is6975672LayoutActive() {
    const docEl = root.document.documentElement;
    return Boolean(docEl && docEl.getAttribute('data-rcv-ring-6975672') === '1');
  }

  function syncRing6975672LayoutFlag() {
    const docEl = root.document.documentElement;
    if (!docEl) {
      return;
    }
    const vw = Number(root.innerWidth || docEl.clientWidth || 0);
    const numEl = root.document.getElementById('rcv-ring-num');
    if (vw >= RING_LAYOUT_VW_MIN && vw <= RING_LAYOUT_VW_MAX) {
      docEl.setAttribute('data-rcv-ring-6975672', '1');
    } else {
      docEl.removeAttribute('data-rcv-ring-6975672');
      if (numEl) {
        numEl.style.fontSize = '';
      }
    }
  }

  function measureRingInnerContentWidth(box) {
    const cs = root.getComputedStyle(box);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const borL = parseFloat(cs.borderLeftWidth) || 0;
    const borR = parseFloat(cs.borderRightWidth) || 0;
    return box.clientWidth - padL - padR - borL - borR;
  }

  function measureRingTextWidth(numEl) {
    const range = root.document.createRange();
    range.selectNodeContents(numEl);
    return range.getBoundingClientRect().width;
  }

  /** One measure + one adjust at 1920 layout; 280px unless text overflows inner padding. */
  function shrinkFitRingNumber() {
    const numEl = root.document.getElementById('rcv-ring-num');
    const box = root.document.getElementById('rcv-ring-box');
    if (!numEl || !box) {
      return;
    }
    if (!is6975672LayoutActive()) {
      numEl.style.fontSize = '';
      return;
    }
    numEl.style.fontSize = '';
    const maxPx = parseFloat(root.getComputedStyle(numEl).fontSize) || 0;
    if (!Number.isFinite(maxPx) || maxPx <= 0) {
      return;
    }
    const innerW = measureRingInnerContentWidth(box);
    const textW = measureRingTextWidth(numEl);
    if (innerW <= 0 || textW <= innerW + 1) {
      return;
    }
    const fitPx = Math.max(8, maxPx * (innerW / textW) * 0.998);
    numEl.style.fontSize = String(fitPx) + 'px';
  }

  function installRingResizeHook() {
    if (ringResizeHooked) {
      return;
    }
    if (typeof root.addEventListener !== 'function') {
      return;
    }
    ringResizeHooked = true;
    let resizeTimer = null;
    root.addEventListener('resize', function () {
      if (resizeTimer) {
        root.clearTimeout(resizeTimer);
      }
      resizeTimer = root.setTimeout(function () {
        resizeTimer = null;
        const ov = root.document.getElementById('rcv-ring-ov');
        if (!ov || parseFloat(ov.style.opacity || '0') <= 0) {
          return;
        }
        syncRing6975672LayoutFlag();
        shrinkFitRingNumber();
      }, 120);
    });
  }

  function showRingOverlayForQueue(number) {
    const ov = ensureOverlay();
    installRingResizeHook();
    const numEl = root.document.getElementById('rcv-ring-num');
    if (numEl) {
      numEl.textContent = number;
    }
    syncRing6975672LayoutFlag();
    shrinkFitRingNumber();
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
    const numEl = root.document.getElementById('rcv-ring-num');
    if (numEl) {
      numEl.style.fontSize = '';
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
