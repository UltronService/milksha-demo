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

  function playWebChime() {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) {
        return;
      }
      const resumePromise =
        ctx.state === 'suspended' && typeof ctx.resume === 'function' ? ctx.resume() : null;
      const run = function () {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.08;
        o.start();
        o.stop(ctx.currentTime + 0.15);
      };
      if (resumePromise && typeof resumePromise.then === 'function') {
        resumePromise.then(run).catch(function () {
          /* autoplay blocked */
        });
        return;
      }
      run();
    } catch (e) {
      /* autoplay blocked */
    }
  }

  function showRingOverlay(number) {
    const ov = ensureOverlay();
    const box = root.document.getElementById('rcv-ring-box');
    if (box) {
      box.textContent = number;
    }
    ov.style.opacity = '1';
    root.setTimeout(function () {
      ov.style.opacity = '0';
    }, 800);
  }

  /**
   * @param {string} number
   */
  function playReadyRing(number) {
    root.__rcvTelemetry.ringCount += 1;
    root.__rcvTelemetry.ringEvents.push({ at: Date.now(), number: number });
    showRingOverlay(number);
    playWebChime();
  }

  QMS.Receiver.RingHost = {
    playReadyRing: playReadyRing,
    resetTelemetry: function () {
      root.__rcvTelemetry.ringCount = 0;
      root.__rcvTelemetry.ringEvents = [];
    },
    getAudioContextCreateCount: function () {
      return audioContextCreateCount;
    },
    _resetAudioContextForTests: function () {
      sharedAudioContext = null;
      audioContextCreateCount = 0;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
