/**
 * Board animation timing + ready-zone scale pulse (board-only).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const DEFAULTS = {
    opacityInMs: 300,
    columnMoveMs: 300,
    columnMoveEnterMs: 300,
    columnMoveTwoPhase: false,
    columnMovePhaseGapMs: 80,
    pageDurationMs: 500,
    readyScale: 1.3,
    readyScaleInMs: 300,
    readyScaleHoldMs: 3000,
    readyScaleOutMs: 300,
  };

  const BOUNDS = {
    opacityInMs: { min: 50, max: 2000 },
    columnMoveMs: { min: 50, max: 2000 },
    columnMoveEnterMs: { min: 50, max: 2000 },
    columnMoveTwoPhase: { min: 0, max: 1 },
    columnMovePhaseGapMs: { min: 0, max: 500 },
    pageDurationMs: { min: 100, max: 3000 },
    readyScale: { min: 1, max: 1.5 },
    readyScaleInMs: { min: 50, max: 2000 },
    readyScaleHoldMs: { min: 0, max: 10000 },
    readyScaleOutMs: { min: 50, max: 2000 },
  };

  const URL_KEYS = {
    animOpacityIn: 'opacityInMs',
    animColumnMove: 'columnMoveMs',
    animColumnEnter: 'columnMoveEnterMs',
    animColumnTwoPhase: 'columnMoveTwoPhase',
    animColumnPhaseGap: 'columnMovePhaseGapMs',
    animPage: 'pageDurationMs',
    animScale: 'readyScale',
    animIn: 'readyScaleInMs',
    animHold: 'readyScaleHoldMs',
    animOut: 'readyScaleOutMs',
  };

  /** @type {Partial<typeof DEFAULTS> | null} */
  let runtimeOverrides = null;

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

  function parseUrlBool(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') {
      return fallback;
    }
    const s = String(raw).toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') {
      return true;
    }
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') {
      return false;
    }
    return fallback;
  }

  function applyBounded(key, value, target) {
    const bounds = BOUNDS[key];
    if (!bounds) {
      return;
    }
    if (key === 'columnMoveTwoPhase') {
      target[key] = Boolean(value);
      return;
    }
    if (key === 'readyScale') {
      target[key] = clampNum(value, bounds.min, bounds.max, DEFAULTS[key]);
      return;
    }
    if (key.indexOf('Ms') >= 0) {
      target[key] = clampNum(value, bounds.min, bounds.max, DEFAULTS[key]);
      return;
    }
    target[key] = clampNum(value, bounds.min, bounds.max, DEFAULTS[key]);
  }

  function getConfig() {
    const out = { ...DEFAULTS };
    const params = getSearchParams();
    if (params) {
      Object.keys(URL_KEYS).forEach(function (param) {
        const key = URL_KEYS[param];
        const bounds = BOUNDS[key];
        const raw = params.get(param);
        if (raw === null) {
          return;
        }
        let parsed;
        if (key === 'columnMoveTwoPhase') {
          parsed = parseUrlBool(raw, DEFAULTS[key]);
          out[key] = parsed;
          return;
        }
        if (key === 'readyScale') {
          parsed = parseUrlNumber(raw, DEFAULTS[key]);
        } else if (key.indexOf('Ms') >= 0) {
          parsed = parseUrlDurationMs(raw, DEFAULTS[key]);
        } else {
          parsed = parseUrlNumber(raw, DEFAULTS[key]);
        }
        out[key] = clampNum(parsed, bounds.min, bounds.max, DEFAULTS[key]);
      });
    }
    if (runtimeOverrides && typeof runtimeOverrides === 'object') {
      Object.keys(runtimeOverrides).forEach(function (key) {
        if (!(key in DEFAULTS)) {
          return;
        }
        applyBounded(key, runtimeOverrides[key], out);
      });
    }
    return out;
  }

  /**
   * Demo panel / runtime tuning (merged over URL, before each syncZone read).
   * @param {Partial<typeof DEFAULTS> | null} partial
   */
  function setRuntimeOverrides(partial) {
    if (partial === null || partial === undefined) {
      runtimeOverrides = null;
      return;
    }
    runtimeOverrides = { ...partial };
  }

  function getRuntimeOverrides() {
    return runtimeOverrides ? { ...runtimeOverrides } : null;
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
    setRuntimeOverrides: setRuntimeOverrides,
    getRuntimeOverrides: getRuntimeOverrides,
    getEffectiveReadyScale: getEffectiveReadyScale,
  };
})(typeof window !== 'undefined' ? window : globalThis);
