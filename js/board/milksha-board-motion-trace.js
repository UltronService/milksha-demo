/**
 * Test-only board motion trace (?motionTrace=1). No-op when disabled.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

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

  /** @type {Array<{ motionType: string, zoneKey?: string, startedAt: number, endedAt?: number, frames: Array<object> }>} */
  let sessions = [];
  /** @type {Set<object>} */
  const activeSessions = new Set();
  let rafId = 0;

  /**
   * @param {Element | null | undefined} el
   * @returns {number}
   */
  function parseOpacity(el) {
    if (!el || !root.getComputedStyle) {
      return 1;
    }
    const raw = root.getComputedStyle(el).opacity;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 1;
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
    const canvas = doc.getElementById('milksha-board-canvas');
    const cRect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    let scale = 1;
    if (canvas && canvas.style && canvas.style.transform) {
      const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
      if (m) {
        scale = Number.parseFloat(m[1]) || 1;
      }
    }
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
      const r = chip.getBoundingClientRect();
      out.push({
        number,
        itemId,
        zone,
        slot,
        opacity: parseOpacity(chip),
        floating: chip.classList.contains('milksha-board-chip--layer-float'),
        rect: {
          left: (r.left - cRect.left) / scale,
          top: (r.top - cRect.top) / scale,
          right: (r.right - cRect.left) / scale,
          bottom: (r.bottom - cRect.top) / scale,
          width: r.width / scale,
          height: r.height / scale,
        },
      });
    }
    return out;
  }

  function tick() {
    rafId = 0;
    if (activeSessions.size === 0) {
      return;
    }
    const t = root.performance && root.performance.now ? root.performance.now() : Date.now();
    activeSessions.forEach(function (session) {
      session.frames.push({ t: t, chips: captureChipSnapshots(t) });
    });
    if (activeSessions.size > 0) {
      rafId = root.requestAnimationFrame(tick);
    }
  }

  function ensureRafLoop() {
    if (rafId !== 0 || activeSessions.size === 0) {
      return;
    }
    rafId = root.requestAnimationFrame(tick);
  }

  /**
   * @param {string} motionType
   * @param {Element | null} zoneEl
   * @param {Promise<unknown>} endPromise
   * @returns {Promise<void>}
   */
  function trackZoneAnimation(motionType, zoneEl, endPromise) {
    const session = {
      motionType: motionType,
      zoneKey: zoneEl && zoneEl.classList && zoneEl.classList.contains('milksha-ready') ? 'ready' : 'prep',
      startedAt: root.performance && root.performance.now ? root.performance.now() : Date.now(),
      frames: [],
    };
    sessions.push(session);
    activeSessions.add(session);
    session.frames.push({
      t: session.startedAt,
      chips: captureChipSnapshots(session.startedAt),
    });
    ensureRafLoop();
    return Promise.resolve(endPromise).finally(function () {
      const endT = root.performance && root.performance.now ? root.performance.now() : Date.now();
      session.endedAt = endT;
      session.frames.push({ t: endT, chips: captureChipSnapshots(endT) });
      activeSessions.delete(session);
      if (activeSessions.size === 0 && rafId !== 0 && root.cancelAnimationFrame) {
        root.cancelAnimationFrame(rafId);
        rafId = 0;
      }
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
   * @param {Array<{ t: number, chips: Array<{ number: string, itemId: string, zone: string, slot: number, rect: object, opacity: number }> }>} frames
   * @param {{ layout?: { creamRectForZone: (z: string) => object, TITLE_GUARD_MAX_Y?: number } | null }} options
   */
  function analyzeFrames(frames, options) {
    const layout = options && options.layout ? options.layout : null;
    const titleMaxY =
      layout && Number.isFinite(layout.TITLE_GUARD_MAX_Y) ? layout.TITLE_GUARD_MAX_Y : 330;
    const outsideCream = [];
    const coversTitle = [];
    const overlap = [];
    const diagonalMotion = [];

    /** @type {Map<string, { left: number, top: number }>} */
    const lastCenterByKey = new Map();

    for (let fi = 0; fi < frames.length; fi += 1) {
      const frame = frames[fi];
      const chips = frame.chips || [];
      for (let ci = 0; ci < chips.length; ci += 1) {
        const chip = chips[ci];
        if (!chip.rect) {
          continue;
        }
        const zone = chip.zone === 'ready' ? 'ready' : 'prep';
        if (layout && layout.creamRectForZone) {
          const cream = layout.creamRectForZone(zone);
          const r = chip.rect;
          const inside =
            r.left >= cream.left &&
            r.top >= cream.top &&
            r.right <= cream.left + cream.width &&
            r.bottom <= cream.top + cream.height;
          if (!inside) {
            outsideCream.push({ frame: fi, t: frame.t, number: chip.number, zone: chip.zone, rect: r });
          }
          if (r.top < titleMaxY) {
            coversTitle.push({ frame: fi, t: frame.t, number: chip.number, zone: chip.zone, rect: r });
          }
        }
        const cx = (chip.rect.left + chip.rect.right) / 2;
        const cy = (chip.rect.top + chip.rect.bottom) / 2;
        const trackKey = chip.itemId || chip.number || String(ci);
        const prev = lastCenterByKey.get(trackKey);
        if (prev) {
          const dx = cx - prev.left;
          const dy = cy - prev.top;
          if (dx !== 0 && dy !== 0) {
            diagonalMotion.push({
              frame: fi,
              t: frame.t,
              number: chip.number,
              itemId: chip.itemId,
              dx,
              dy,
            });
          }
        }
        lastCenterByKey.set(trackKey, { left: cx, top: cy });
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
            overlap.push({
              frame: fi,
              t: frame.t,
              a: chips[a].number,
              b: chips[b].number,
              zone: chips[a].zone,
            });
          }
        }
      }
    }

    return {
      outsideCream,
      coversTitle,
      overlap,
      diagonalMotion,
      failed:
        outsideCream.length > 0 ||
        coversTitle.length > 0 ||
        overlap.length > 0 ||
        diagonalMotion.length > 0,
    };
  }

  function analyzeSession(session) {
    const layout =
      QMS.Board && QMS.Board.LandscapeArtLayout ? QMS.Board.LandscapeArtLayout : null;
    return analyzeFrames(session.frames || [], { layout });
  }

  function analyzeAllSessions() {
    return sessions.map(function (session) {
      return {
        motionType: session.motionType,
        frameCount: session.frames.length,
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
      if (rafId !== 0 && root.cancelAnimationFrame) {
        root.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    analyzeFrames: analyzeFrames,
    analyzeSession: analyzeSession,
    analyzeAll: analyzeAllSessions,
  };

  QMS.MilkshaBoardMotionTrace = {
    isEnabled: function () {
      return true;
    },
    trackZoneAnimation: trackZoneAnimation,
    inferZoneMotionType: inferZoneMotionType,
    analyzeFrames: analyzeFrames,
  };
})(typeof window !== 'undefined' ? window : globalThis);
