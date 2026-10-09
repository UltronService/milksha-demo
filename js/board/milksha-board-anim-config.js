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

  function clampNum(value, min, max, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value < min || value > max) {
      return fallback;
    }
    return value;
  }

  function parseUrlNumber(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') {
      return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  function parseUrlDurationMs(raw, fallbackMs) {
    const n = parseUrlNumber(raw, fallbackMs);
    if (!Number.isFinite(n)) {
      return fallbackMs;
    }
    if (n > 0 && n < 60) {
      return n * 1000;
    }
    return n;
  }

  function getSearchParams() {
    const win = root.window;
    if (!win || !win.location) {
      return null;
    }
    return new URLSearchParams(win.location.search || '');
  }

  function isAnimScaleUnsafe() {
    const params = getSearchParams();
    return params ? params.get('animScaleUnsafe') === '1' : false;
  }

  function getConfig() {
    const out = { ...DEFAULTS };
    const params = getSearchParams();
    if (!params) {
      return out;
    }
    Object.keys(URL_KEYS).forEach(function (param) {
      const key = URL_KEYS[param];
      const bounds = BOUNDS[key];
      const raw = params.get(param);
      if (raw === null) {
        return;
      }
      let parsed;
      if (key === 'readyScale') {
        parsed = parseUrlNumber(raw, DEFAULTS[key]);
      } else if (key.indexOf('Ms') >= 0) {
        parsed = parseUrlDurationMs(raw, DEFAULTS[key]);
      } else {
        parsed = parseUrlNumber(raw, DEFAULTS[key]);
      }
      out[key] = clampNum(parsed, bounds.min, bounds.max, DEFAULTS[key]);
    });
    return out;
  }

  function gridNeighbors(idx, cellCount) {
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
    if (row * 2 + 2 < cellCount) {
      out.push(idx + 2);
    }
    return out;
  }

  /**
   * Safe peak scale for one chip from cell edges + occupied neighbors only.
   * @param {Element} chip
   * @param {Element} numbersLayer
   * @returns {number}
   */
  function computeChipPulseScale(chip, numbersLayer) {
    if (!chip || !numbersLayer) {
      return DEFAULTS.readyScale;
    }
    const cell = chip.closest('.milksha-num-cell');
    if (!cell) {
      return DEFAULTS.readyScale;
    }
    const cells = numbersLayer.querySelectorAll('.milksha-num-cell');
    let idx = -1;
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] === cell) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return DEFAULTS.readyScale;
    }
    const cellR = cell.getBoundingClientRect();
    const chipR = chip.getBoundingClientRect();
    if (chipR.width <= 0 || chipR.height <= 0) {
      return 1;
    }
    const cx = chipR.left + chipR.width / 2;
    const cy = chipR.top + chipR.height / 2;
    const hw = chipR.width / 2;
    const hh = chipR.height / 2;
    let safe = DEFAULTS.readyScale;
    const marginL = cx - cellR.left;
    const marginR = cellR.right - cx;
    const marginT = cy - cellR.top;
    const marginB = cellR.bottom - cy;
    safe = Math.min(safe, 1 + Math.min(marginL, marginR) / hw, 1 + Math.min(marginT, marginB) / hh);

    const zone = numbersLayer.closest('.milksha-zone.ready');
    if (zone) {
      const zr = zone.getBoundingClientRect();
      safe = Math.min(
        safe,
        1 + Math.min(cx - zr.left, zr.right - cx) / hw,
        1 + Math.min(cy - zr.top, zr.bottom - cy) / hh,
      );
    }

    const neighbors = gridNeighbors(idx, cells.length);
    for (let ni = 0; ni < neighbors.length; ni += 1) {
      const nIdx = neighbors[ni];
      const nCell = cells[nIdx];
      const nChip = nCell ? nCell.querySelector('.milksha-board-chip') : null;
      if (!nChip) {
        continue;
      }
      const nR = nChip.getBoundingClientRect();
      const ncx = nR.left + nR.width / 2;
      const ncy = nR.top + nR.height / 2;
      const nhw = nR.width / 2;
      const nhh = nR.height / 2;
      const dx = Math.abs(ncx - cx);
      const dy = Math.abs(ncy - cy);
      const sumW = hw + nhw;
      const sumH = hh + nhh;
      if (dx >= dy && sumW > 0) {
        safe = Math.min(safe, dx / sumW);
      } else if (sumH > 0) {
        safe = Math.min(safe, dy / sumH);
      }
    }
    return Math.max(1, safe);
  }

  /** Layer-wide minimum (legacy / diagnostics). */
  function computeSafeReadyScale(numbersLayer) {
    if (!numbersLayer) {
      return DEFAULTS.readyScale;
    }
    const chips = numbersLayer.querySelectorAll('.milksha-board-chip');
    if (!chips.length) {
      return DEFAULTS.readyScale;
    }
    let min = DEFAULTS.readyScale;
    for (let i = 0; i < chips.length; i += 1) {
      min = Math.min(min, computeChipPulseScale(chips[i], numbersLayer));
    }
    return Math.max(1, min);
  }

  /**
   * @param {Element} numbersLayer
   * @param {Element | null | undefined} chipEl
   * @returns {{ requested: number, safeMax: number, effective: number, unsafeBypass: boolean }}
   */
  function getEffectiveReadyScale(numbersLayer, chipEl) {
    const cfg = getConfig();
    const unsafeBypass = isAnimScaleUnsafe();
    const safeMax = chipEl
      ? computeChipPulseScale(chipEl, numbersLayer)
      : computeSafeReadyScale(numbersLayer);
    const effective = unsafeBypass ? cfg.readyScale : Math.min(cfg.readyScale, safeMax);
    return { requested: cfg.readyScale, safeMax: safeMax, effective: effective, unsafeBypass: unsafeBypass };
  }

  QMS.MilkshaBoardAnimConfig = {
    DEFAULTS: DEFAULTS,
    BOUNDS: BOUNDS,
    URL_PARAM_NAMES: URL_KEYS,
    getConfig: getConfig,
    isAnimScaleUnsafe: isAnimScaleUnsafe,
    computeChipPulseScale: computeChipPulseScale,
    computeSafeReadyScale: computeSafeReadyScale,
    getEffectiveReadyScale: getEffectiveReadyScale,
  };
})(typeof window !== 'undefined' ? window : globalThis);
