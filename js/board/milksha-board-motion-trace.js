/**
 * Test-only board motion trace (?motionTrace=1). No-op when disabled.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const SAMPLE_INTERVAL_MS = 50;
  const MAX_FRAMES_PER_SESSION = 480;
  const MAX_SESSIONS = 32;

  /**
   * @param {Window & typeof globalThis} win
   * @returns {boolean}
   */
  function readTraceEnabled(win) {
    if (win.__MILKSHA_MOTION_TRACE === 1 || win.__MILKSHA_MOTION_TRACE === true) {
      return true;
    }
    try {
      const params = new URLSearchParams(win.location && win.location.search ? win.location.search : '');
      return params.get('motionTrace') === '1';
    } catch (_err) {
      return false;
    }
  }

  if (!readTraceEnabled(root)) {
    QMS.MilkshaBoardMotionTrace = {
      isEnabled: function () {
        return false;
      },
    };
    return;
  }

  /** @type {Array<object>} */
  let sessions = [];
  /** @type {Set<object>} */
  const activeSessions = new Set();
  let sampleTimerId = 0;

  function getAnimDurations() {
    const cfgMod = QMS.MilkshaBoardAnimConfig;
    if (cfgMod && cfgMod.getConfig) {
      return cfgMod.getConfig();
    }
    return { opacityInMs: 300, pageDurationMs: 500, columnMoveMs: 300 };
  }

  /**
   * @param {string} motionType
   * @returns {number}
   */
  function motionDurationMs(motionType) {
    const cfg = getAnimDurations();
    if (motionType === 'page-turn') {
      return cfg.pageDurationMs;
    }
    if (motionType === 'column-move') {
      return cfg.columnMoveMs;
    }
    return cfg.opacityInMs;
  }

  /**
   * @returns {{ left: number, top: number, scale: number }}
   */
  function boardCanvasMetrics() {
    const doc = root.document;
    const canvas = doc && doc.getElementById ? doc.getElementById('milksha-board-canvas') : null;
    const cRect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    let scale = 1;
    if (canvas && canvas.style && canvas.style.transform) {
      const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
      if (m) {
        scale = Number.parseFloat(m[1]) || 1;
      }
    }
    return { left: cRect.left, top: cRect.top, scale: scale };
  }

  /**
   * @param {DOMRect} r
   * @param {{ left: number, top: number, scale: number }} canvas
   * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number }}
   */
  function rectToBoard(r, canvas) {
    const s = canvas.scale || 1;
    return {
      left: (r.left - canvas.left) / s,
      top: (r.top - canvas.top) / s,
      right: (r.right - canvas.left) / s,
      bottom: (r.bottom - canvas.top) / s,
      width: r.width / s,
      height: r.height / s,
    };
  }

  /**
   * @param {string | null | undefined} transform
   * @returns {{ scale: number, tx: number, ty: number }}
   */
  function parseTransform(transform) {
    if (!transform || transform === 'none') {
      return { scale: 1, tx: 0, ty: 0 };
    }
    const m = transform.match(/matrix\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(',').map(function (part) {
        return Number.parseFloat(part.trim());
      });
      if (p.length >= 6) {
        return { scale: p[0], tx: p[4], ty: p[5] };
      }
    }
    return { scale: 1, tx: 0, ty: 0 };
  }

  /**
   * @param {Element} chip
   * @returns {number}
   */
  function parseOpacity(chip) {
    if (!chip || !root.getComputedStyle) {
      return 1;
    }
    const raw = root.getComputedStyle(chip).opacity;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 1;
  }

  /**
   * @param {Element} chip
   * @returns {'in-cell' | 'fading-out' | 'float-layer' | 'exit-clone'}
   */
  function chipRole(chip) {
    if (chip.getAttribute('data-column-move-exit-clone') === '1') {
      return 'exit-clone';
    }
    if (chip.classList.contains('milksha-board-chip--layer-float')) {
      if (parseOpacity(chip) < 0.99) {
        return 'fading-out';
      }
      return 'float-layer';
    }
    return 'in-cell';
  }

  /**
   * @returns {Record<string, { cream: object | null, title: object | null }>}
   */
  function captureZoneLayoutRects() {
    const doc = root.document;
    const out = { prep: { cream: null, title: null }, ready: { cream: null, title: null } };
    if (!doc || typeof doc.querySelector !== 'function') {
      return out;
    }
    const canvas = boardCanvasMetrics();
    const zones = [
      { key: 'prep', sel: '.milksha-zone.milksha-prep' },
      { key: 'ready', sel: '.milksha-zone.milksha-ready' },
    ];
    for (let zi = 0; zi < zones.length; zi += 1) {
      const z = zones[zi];
      const zoneEl = doc.querySelector(z.sel);
      if (!zoneEl) {
        continue;
      }
      const creamEl = zoneEl.querySelector('.milksha-cream');
      const titleEl = zoneEl.querySelector('.milksha-ztitle');
      if (creamEl && creamEl.getBoundingClientRect) {
        out[z.key].cream = rectToBoard(creamEl.getBoundingClientRect(), canvas);
      }
      if (titleEl && titleEl.getBoundingClientRect) {
        out[z.key].title = rectToBoard(titleEl.getBoundingClientRect(), canvas);
      }
    }
    return out;
  }

  /**
   * @param {number} t
   * @returns {Array<object>}
   */
  function captureChipSnapshots(t) {
    const doc = root.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return [];
    }
    const canvas = boardCanvasMetrics();
    const chips = doc.querySelectorAll('.milksha-board-chip[data-item-id]');
    const out = [];
    for (let i = 0; i < chips.length; i += 1) {
      const chip = chips[i];
      const itemId = chip.getAttribute('data-item-id') || '';
      const numEl = chip.querySelector('.milksha-num');
      const number = numEl && numEl.textContent ? numEl.textContent.trim() : '';
      const zoneEl = chip.closest('.milksha-zone');
      let zone = 'unknown';
      if (zoneEl) {
        if (zoneEl.classList.contains('milksha-prep') || zoneEl.classList.contains('prep')) {
          zone = 'prep';
        } else if (zoneEl.classList.contains('milksha-ready') || zoneEl.classList.contains('ready')) {
          zone = 'ready';
        }
      }
      let slot = -1;
      const cell = chip.closest('.milksha-num-cell');
      if (cell && cell.parentNode) {
        const cells = cell.parentNode.querySelectorAll('.milksha-num-cell');
        for (let ci = 0; ci < cells.length; ci += 1) {
          if (cells[ci] === cell) {
            slot = ci;
            break;
          }
        }
      }
      const cs = root.getComputedStyle(chip);
      const tf = parseTransform(cs.transform);
      const r = chip.getBoundingClientRect();
      out.push({
        number,
        itemId,
        zone,
        slot,
        opacity: parseOpacity(chip),
        scale: tf.scale,
        tx: tf.tx,
        ty: tf.ty,
        role: chipRole(chip),
        rect: rectToBoard(r, canvas),
      });
    }
    return out;
  }

  /**
   * @param {object} session
   * @param {number} t
   */
  function pushFrame(session, t) {
    const frame = {
      t: t,
      chips: captureChipSnapshots(t),
      zoneRects: captureZoneLayoutRects(),
    };
    session.frames.push(frame);
    while (session.frames.length > MAX_FRAMES_PER_SESSION) {
      session.frames.shift();
    }
  }

  function sampleActiveSessions() {
    if (activeSessions.size === 0) {
      return;
    }
    const t = root.performance && root.performance.now ? root.performance.now() : Date.now();
    activeSessions.forEach(function (session) {
      pushFrame(session, t);
    });
  }

  function ensureSampleLoop() {
    if (sampleTimerId !== 0 || activeSessions.size === 0) {
      return;
    }
    sampleTimerId = root.setInterval(sampleActiveSessions, SAMPLE_INTERVAL_MS);
  }

  function stopSampleLoopIfIdle() {
    if (activeSessions.size > 0 || sampleTimerId === 0) {
      return;
    }
    root.clearInterval(sampleTimerId);
    sampleTimerId = 0;
  }

  /**
   * @param {object} session
   * @returns {{ valid: boolean, reason?: string }}
   */
  function validateSession(session) {
    if (!session || !Array.isArray(session.frames) || session.frames.length === 0) {
      return { valid: false, reason: 'zero_frames' };
    }
    return { valid: true };
  }

  /**
   * @param {string} motionType
   * @param {Element | null} zoneEl
   * @param {Promise<unknown>} endPromise
   * @returns {Promise<void>}
   */
  function trackZoneAnimation(motionType, zoneEl, endPromise) {
    while (sessions.length >= MAX_SESSIONS) {
      sessions.shift();
    }
    const session = {
      motionType: motionType,
      zoneKey: zoneEl && zoneEl.classList && zoneEl.classList.contains('milksha-ready') ? 'ready' : 'prep',
      startedAt: root.performance && root.performance.now ? root.performance.now() : Date.now(),
      endedAt: undefined,
      frames: [],
    };
    sessions.push(session);
    activeSessions.add(session);
    pushFrame(session, session.startedAt);
    ensureSampleLoop();

    const minEndAt = session.startedAt + motionDurationMs(motionType);

    return Promise.resolve(endPromise)
      .then(function () {
        const now = root.performance && root.performance.now ? root.performance.now() : Date.now();
        const waitMs = Math.max(0, minEndAt - now);
        if (waitMs <= 0) {
          return undefined;
        }
        return new Promise(function (resolve) {
          root.setTimeout(resolve, waitMs);
        });
      })
      .finally(function () {
        const endT = root.performance && root.performance.now ? root.performance.now() : Date.now();
        pushFrame(session, endT);
        session.endedAt = endT;
        activeSessions.delete(session);
        stopSampleLoopIfIdle();
      });
  }

  /**
   * @param {'prep' | 'ready'} zoneKey
   * @param {Array<{ id: string }>} prevItems
   * @param {Array<{ id: string }>} nextItems
   * @param {{ clearAll?: boolean, pageTurn?: boolean, prevPage?: number }} opts
   * @param {number} page
   * @param {number} pageSize
   * @param {Function} layoutPageGrid
   * @returns {string}
   */
  function inferZoneMotionType(zoneKey, prevItems, nextItems, opts, page, pageSize, layoutPageGrid) {
    if (opts.clearAll) {
      return 'clear-board';
    }
    if (opts.pageTurn) {
      return 'page-turn';
    }
    const anim = QMS.MilkshaBoardAnim;
    if (anim && anim.diffVisibleSlots && layoutPageGrid) {
      const diff = anim.diffVisibleSlots(
        prevItems || [],
        nextItems || [],
        opts.prevPage || 0,
        page,
        pageSize,
        layoutPageGrid,
      );
      if (anim.detectColumnMovePlan) {
        const plan = anim.detectColumnMovePlan(
          prevItems || [],
          nextItems || [],
          page,
          pageSize,
          layoutPageGrid,
          diff,
        );
        if (plan) {
          return 'column-move';
        }
      }
      if (zoneKey === 'ready' && diff.removed.length > 0) {
        const prevLen = (prevItems || []).length;
        const nextLen = (nextItems || []).length;
        if (nextLen > 0 && prevLen > nextLen && (diff.moved.length > 0 || nextLen >= 2)) {
          return 'backfill';
        }
        return 'pickup-disappear';
      }
      if (zoneKey === 'prep' && diff.added.length > 0) {
        return 'new-order-fade-in';
      }
      if (zoneKey === 'ready' && diff.added.length > 0) {
        return 'new-order-fade-in';
      }
      if (diff.moved.length > 0) {
        return 'backfill';
      }
    }
    return 'board-update';
  }

  function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  /**
   * @param {object} violation
   * @returns {object}
   */
  function enrichFailure(violation) {
    return violation;
  }

  /**
   * @param {Array<object>} frames
   * @param {{ motionType?: string }} options
   */
  function analyzeFrames(frames, options) {
    const motionType = options && options.motionType ? options.motionType : '';
    const outsideCream = [];
    const coversTitle = [];
    const overlap = [];
    const diagonalMotion = [];
    const failures = [];

    /** @type {Map<string, { tx: number, ty: number }>} */
    const lastTranslateByKey = new Map();

    for (let fi = 0; fi < frames.length; fi += 1) {
      const frame = frames[fi];
      const chips = frame.chips || [];
      const zoneRects = frame.zoneRects || {};
      for (let ci = 0; ci < chips.length; ci += 1) {
        const chip = chips[ci];
        if (!chip.rect) {
          continue;
        }
        const zone = chip.zone === 'ready' ? 'ready' : 'prep';
        const cream = zoneRects[zone] && zoneRects[zone].cream ? zoneRects[zone].cream : null;
        const title = zoneRects[zone] && zoneRects[zone].title ? zoneRects[zone].title : null;
        const r = chip.rect;
        if (cream) {
          const inside =
            r.left >= cream.left &&
            r.top >= cream.top &&
            r.right <= cream.right &&
            r.bottom <= cream.bottom;
          if (!inside) {
            const entry = enrichFailure({
              rule: 'outsideCream',
              frame: fi,
              t: frame.t,
              number: chip.number,
              itemId: chip.itemId,
              zone: chip.zone,
              role: chip.role,
              px: {
                left: r.left - cream.left,
                top: r.top - cream.top,
                right: cream.right - r.right,
                bottom: cream.bottom - r.bottom,
              },
            });
            outsideCream.push(entry);
            failures.push(entry);
          }
        }
        if (title) {
          if (rectsOverlap(r, title)) {
            const entry = enrichFailure({
              rule: 'coversTitle',
              frame: fi,
              t: frame.t,
              number: chip.number,
              itemId: chip.itemId,
              zone: chip.zone,
              role: chip.role,
            });
            coversTitle.push(entry);
            failures.push(entry);
          }
        }
        const trackKey = chip.itemId || chip.number || String(ci);
        const tx = Number.isFinite(chip.tx) ? chip.tx : 0;
        const ty = Number.isFinite(chip.ty) ? chip.ty : 0;
        const prev = lastTranslateByKey.get(trackKey);
        if (prev) {
          const dx = tx - prev.tx;
          const dy = ty - prev.ty;
          if (dx !== 0 && dy !== 0) {
            const entry = enrichFailure({
              rule: 'diagonalMotion',
              frame: fi,
              t: frame.t,
              number: chip.number,
              itemId: chip.itemId,
              zone: chip.zone,
              role: chip.role,
              dx,
              dy,
            });
            diagonalMotion.push(entry);
            failures.push(entry);
          }
        }
        lastTranslateByKey.set(trackKey, { tx: tx, ty: ty });
      }
      for (let a = 0; a < chips.length; a += 1) {
        for (let b = a + 1; b < chips.length; b += 1) {
          if (chips[a].zone !== chips[b].zone) {
            continue;
          }
          if (!chips[a].rect || !chips[b].rect) {
            continue;
          }
          if (rectsOverlap(chips[a].rect, chips[b].rect)) {
            const entry = enrichFailure({
              rule: 'overlap',
              frame: fi,
              t: frame.t,
              a: chips[a].number,
              b: chips[b].number,
              zone: chips[a].zone,
              roleA: chips[a].role,
              roleB: chips[b].role,
            });
            overlap.push(entry);
            failures.push(entry);
          }
        }
      }
    }

    const detailFailures =
      motionType === 'column-move' || motionType === 'backfill'
        ? failures.map(function (f) {
            return f;
          })
        : failures;

    return {
      outsideCream,
      coversTitle,
      overlap,
      diagonalMotion,
      failures: detailFailures,
      failed: failures.length > 0,
    };
  }

  function analyzeSession(session) {
    const validity = validateSession(session);
    if (!validity.valid) {
      return {
        valid: false,
        reason: validity.reason,
        outsideCream: [],
        coversTitle: [],
        overlap: [],
        diagonalMotion: [],
        failures: [{ rule: 'invalidSession', reason: validity.reason }],
        failed: true,
      };
    }
    const analysis = analyzeFrames(session.frames || [], { motionType: session.motionType });
    analysis.valid = true;
    return analysis;
  }

  function analyzeAllSessions() {
    return sessions.map(function (session) {
      return {
        motionType: session.motionType,
        frameCount: session.frames.length,
        validation: validateSession(session),
        analysis: analyzeSession(session),
      };
    });
  }

  root.__milkshaMotionTrace = {
    get: function () {
      return sessions.slice();
    },
    clear: function () {
      sessions = [];
      activeSessions.clear();
      stopSampleLoopIfIdle();
    },
    validateSession: validateSession,
    analyzeFrames: analyzeFrames,
    analyzeSession: analyzeSession,
    analyzeAll: analyzeAllSessions,
    getConfig: function () {
      return {
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        maxFramesPerSession: MAX_FRAMES_PER_SESSION,
        maxSessions: MAX_SESSIONS,
      };
    },
  };

  QMS.MilkshaBoardMotionTrace = {
    isEnabled: function () {
      return true;
    },
    trackZoneAnimation: trackZoneAnimation,
    inferZoneMotionType: inferZoneMotionType,
    analyzeFrames: analyzeFrames,
    validateSession: validateSession,
    captureChipSnapshotsForTest: captureChipSnapshots,
  };
})(typeof window !== 'undefined' ? window : globalThis);
