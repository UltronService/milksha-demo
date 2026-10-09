/**
 * Board animation timing + ready-zone scale pulse (board-only).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const DEFAULTS = {
    opacityInMs: 300,
    pageDurationMs: 500,
    readyScale: 1.3,
    readyScaleInMs: 300,
    readyScaleHoldMs: 3000,
    readyScaleOutMs: 300,
  };

  const BOUNDS = {
    opacityInMs: { min: 50, max: 2000 },
    pageDurationMs: { min: 100, max: 3000 },
    readyScale: { min: 1, max: 1.5 },
    readyScaleInMs: { min: 50, max: 2000 },
    readyScaleHoldMs: { min: 0, max: 10000 },
    readyScaleOutMs: { min: 50, max: 2000 },
  };

  const URL_KEYS = {
    animOpacityIn: 'opacityInMs',
    animPage: 'pageDurationMs',
    animScale: 'readyScale',
    animIn: 'readyScaleInMs',
    animHold: 'readyScaleHoldMs',
    animOut: 'readyScaleOutMs',
  };

  /**
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @param {number} fallback
   */
  function clampNum(value, min, max, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value < min || value > max) {
      return fallback;
    }
    return value;
  }

  /**
   * @param {string | null | undefined} raw
   * @param {number} fallback
   */
  function parseUrlNumber(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') {
      return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * @returns {typeof DEFAULTS}
   */
  function getConfig() {
    const out = { ...DEFAULTS };
    const win = root.window;
    if (!win || !win.location || !win.location.search) {
      return out;
    }
    const params = new URLSearchParams(win.location.search);
    Object.keys(URL_KEYS).forEach(function (param) {
      const key = URL_KEYS[param];
      const bounds = BOUNDS[key];
      const raw = params.get(param);
      if (raw === null) {
        return;
      }
      const parsed = parseUrlNumber(raw, DEFAULTS[key]);
      out[key] = clampNum(parsed, bounds.min, bounds.max, DEFAULTS[key]);
    });
    return out;
  }

  /**
   * Max uniform scale so chip center-grow does not exceed cell or neighbor gap.
   * @param {Element} numbersLayer
   * @returns {number}
   */
  function computeSafeReadyScale(numbersLayer) {
    if (!numbersLayer || typeof numbersLayer.querySelectorAll !== 'function') {
      return DEFAULTS.readyScale;
    }
    const cells = numbersLayer.querySelectorAll('.milksha-num-cell');
    let safe = DEFAULTS.readyScale;
    const chips = [];
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const chip = cell.querySelector('.milksha-board-chip');
      if (!chip) {
        continue;
      }
      const cellR = cell.getBoundingClientRect();
      const chipR = chip.getBoundingClientRect();
      if (chipR.width <= 0 || chipR.height <= 0) {
        continue;
      }
      const cx = chipR.left + chipR.width / 2;
      const cy = chipR.top + chipR.height / 2;
      const marginL = cx - cellR.left;
      const marginR = cellR.right - cx;
      const marginT = cy - cellR.top;
      const marginB = cellR.bottom - cy;
      const hw = chipR.width / 2;
      const hh = chipR.height / 2;
      const sX = 1 + Math.min(marginL, marginR) / hw;
      const sY = 1 + Math.min(marginT, marginB) / hh;
      safe = Math.min(safe, sX, sY);
      chips.push({ idx: i, cx: cx, cy: cy, hw: hw, hh: hh });
    }
    function gridNeighbors(idx) {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const out = [];
      if (col > 0) {
        out.push(idx - 1);
      }
      if (col < 1) {
        out.push(idx + 1);
      }
      if (row > 0) {
        out.push(idx - 2);
      }
      if (row < 4) {
        out.push(idx + 2);
      }
      return out;
    }
    for (let a = 0; a < chips.length; a += 1) {
      const na = gridNeighbors(chips[a].idx);
      for (let ni = 0; ni < na.length; ni += 1) {
        const b = chips.find(function (c) {
          return c.idx === na[ni];
        });
        if (!b) {
          continue;
        }
        const dx = Math.abs(b.cx - chips[a].cx);
        const dy = Math.abs(b.cy - chips[a].cy);
        const sumW = chips[a].hw + b.hw;
        const sumH = chips[a].hh + b.hh;
        if (dx >= dy && sumW > 0) {
          safe = Math.min(safe, dx / sumW);
        } else if (sumH > 0) {
          safe = Math.min(safe, dy / sumH);
        }
      }
    }
    return Math.max(1, safe);
  }

  /**
   * @param {Element} numbersLayer
   * @returns {{ requested: number, safeMax: number, effective: number }}
   */
  function getEffectiveReadyScale(numbersLayer) {
    const cfg = getConfig();
    const safeMax = computeSafeReadyScale(numbersLayer);
    const effective = Math.min(cfg.readyScale, safeMax);
    return { requested: cfg.readyScale, safeMax: safeMax, effective: effective };
  }

  QMS.MilkshaBoardAnimConfig = {
    DEFAULTS: DEFAULTS,
    BOUNDS: BOUNDS,
    URL_PARAM_NAMES: URL_KEYS,
    getConfig: getConfig,
    computeSafeReadyScale: computeSafeReadyScale,
    getEffectiveReadyScale: getEffectiveReadyScale,
  };
})(typeof window !== 'undefined' ? window : globalThis);
