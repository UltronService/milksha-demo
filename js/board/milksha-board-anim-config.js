/**
 * Board animation timing + ready-zone scale pulse (board-only).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const DEFAULTS = {
    opacityInMs: 300,
    columnMoveMs: 300,
    pageDurationMs: 500,
    readyScale: 1.3,
    readyScaleInMs: 300,
    readyScaleHoldMs: 3000,
    readyScaleOutMs: 300,
  };

  const BOUNDS = {
    opacityInMs: { min: 50, max: 2000 },
    columnMoveMs: { min: 50, max: 2000 },
    pageDurationMs: { min: 100, max: 3000 },
    readyScale: { min: 1, max: 1.5 },
    readyScaleInMs: { min: 50, max: 2000 },
    readyScaleHoldMs: { min: 0, max: 10000 },
    readyScaleOutMs: { min: 50, max: 2000 },
  };

  const URL_KEYS = {
    animOpacityIn: 'opacityInMs',
    animColumnMove: 'columnMoveMs',
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

  /**
   * Ready pulse always uses configured readyScale (URL `animScale` overrides).
   * @returns {{ requested: number, effective: number }}
   */
  function getEffectiveReadyScale() {
    const cfg = getConfig();
    return { requested: cfg.readyScale, effective: cfg.readyScale };
  }

  QMS.MilkshaBoardAnimConfig = {
    DEFAULTS: DEFAULTS,
    BOUNDS: BOUNDS,
    URL_PARAM_NAMES: URL_KEYS,
    getConfig: getConfig,
    getEffectiveReadyScale: getEffectiveReadyScale,
  };
})(typeof window !== 'undefined' ? window : globalThis);
