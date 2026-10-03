/**
 * devCommand / boxHeartbeat validation (mirrors milksha-cloud dev-command-validation).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const DEVICE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
  const MAX_JSON_BYTES = 1024;
  const MAX_PARAMS_BYTES = 1024;
  const MAX_TIMING_MS = 60000;

  const COMMAND_PARAM_KEYS = {
    simulate_offline: ['durationMs'],
    slow: ['delayMs'],
    restore: [],
    reload: [],
    reboot: [],
    clear_now: [],
  };

  const HEARTBEAT_KEYS = [
    'storeId',
    'deviceId',
    'appVersion',
    'boardSeq',
    'pendingUploads',
    'simulatedOffline',
    'ackCommandId',
  ];

  function utf8ByteLength(text) {
    if (root.TextEncoder) {
      return new root.TextEncoder().encode(text).length;
    }
    return String(text).length;
  }

  function hasOnlyKeys(obj, allowed) {
    if (!obj || typeof obj !== 'object') {
      return false;
    }
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i += 1) {
      if (allowed.indexOf(keys[i]) < 0) {
        return false;
      }
    }
    return true;
  }

  function validateDeviceId(deviceId) {
    const id = String(deviceId || '').trim();
    if (!DEVICE_ID_RE.test(id)) {
      return { ok: false, code: 'invalid_device_id', message: '裝置編號格式不正確' };
    }
    return { ok: true, deviceId: id };
  }

  function invalidCommandParams(message) {
    return { ok: false, code: 'invalid_command_params', message: message || '指令參數不正確' };
  }

  /**
   * Controller UI: clamp timing fields to integer 0..60000 ms before send.
   * @param {unknown} raw
   * @returns {number}
   */
  function clampTimingMs(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return 0;
    }
    const rounded = Math.round(n);
    if (rounded < 0) {
      return 0;
    }
    if (rounded > MAX_TIMING_MS) {
      return MAX_TIMING_MS;
    }
    return rounded;
  }

  function parseTimingMs(value) {
    if (value === undefined || value === null || value === '') {
      return { ok: true, omitted: true };
    }
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return invalidCommandParams('延遲／持續時間必須為 0 至 60000 的整數（毫秒）');
    }
    if (n < 0 || n > MAX_TIMING_MS) {
      return invalidCommandParams('延遲／持續時間必須為 0 至 60000 的整數（毫秒）');
    }
    return { ok: true, value: n };
  }

  function normalizeParams(type, params) {
    const allowed = COMMAND_PARAM_KEYS[type];
    if (!allowed) {
      return invalidCommandParams('不支援的指令類型');
    }
    const raw = params === undefined || params === null ? {} : params;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return invalidCommandParams('指令參數格式錯誤');
    }
    if (!hasOnlyKeys(raw, allowed)) {
      return invalidCommandParams('指令參數含有不允許的欄位');
    }
    const out = {};
    for (let i = 0; i < allowed.length; i += 1) {
      const key = allowed[i];
      if (raw[key] === undefined) {
        continue;
      }
      if (key === 'durationMs' || key === 'delayMs') {
        const parsed = parseTimingMs(raw[key]);
        if (!parsed.ok) {
          return parsed;
        }
        if (!parsed.omitted) {
          out[key] = parsed.value;
        }
        continue;
      }
      const n = Number(raw[key]);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return invalidCommandParams('指令參數必須為非負整數');
      }
      out[key] = n;
    }
    if (allowed.length === 0 && Object.keys(raw).length > 0) {
      return invalidCommandParams('此指令不可帶參數');
    }
    const paramsJson = JSON.stringify(out);
    if (utf8ByteLength(paramsJson) > MAX_PARAMS_BYTES) {
      return invalidCommandParams('指令參數超過 1024 位元組上限');
    }
    return { ok: true, params: out };
  }

  function buildDevCommandRequest(input) {
    const dev = validateDeviceId(input.deviceId);
    if (!dev.ok) {
      return dev;
    }
    const type = String(input.type || '').trim();
    if (!COMMAND_PARAM_KEYS[type]) {
      return invalidCommandParams('不支援的指令類型');
    }
    const norm = normalizeParams(type, input.params);
    if (!norm.ok) {
      return norm;
    }
    const body = {
      storeId: String(input.storeId || '').trim(),
      deviceId: dev.deviceId,
      type: type,
      params: norm.params,
    };
    if (!body.storeId) {
      return invalidCommandParams('門市代碼不可為空');
    }
    const extra = Object.keys(input || {}).filter(function (k) {
      return ['storeId', 'deviceId', 'type', 'params'].indexOf(k) < 0;
    });
    if (extra.length > 0) {
      return invalidCommandParams('請求含有不允許的欄位');
    }
    const json = JSON.stringify(body);
    if (utf8ByteLength(json) > MAX_JSON_BYTES) {
      return invalidCommandParams('請求內容過大');
    }
    return { ok: true, body: body };
  }

  function validateDevCommandBody(body) {
    if (!body || typeof body !== 'object') {
      return invalidCommandParams('請求格式錯誤');
    }
    if (!hasOnlyKeys(body, ['storeId', 'deviceId', 'type', 'params'])) {
      return invalidCommandParams('請求含有不允許的欄位');
    }
    return buildDevCommandRequest(body);
  }

  function buildBoxHeartbeatRequest(input) {
    const dev = validateDeviceId(input.deviceId);
    if (!dev.ok) {
      return dev;
    }
    if (!hasOnlyKeys(input, HEARTBEAT_KEYS)) {
      return { ok: false, code: 'invalid_body', message: '請求含有不允許的欄位' };
    }
    const body = {
      storeId: String(input.storeId || '').trim(),
      deviceId: dev.deviceId,
      appVersion: String(input.appVersion || ''),
      boardSeq: Number(input.boardSeq) || 0,
      pendingUploads: Number(input.pendingUploads) || 0,
      simulatedOffline: Boolean(input.simulatedOffline),
    };
    if (input.ackCommandId !== undefined && input.ackCommandId !== null && input.ackCommandId !== '') {
      body.ackCommandId = String(input.ackCommandId);
    }
    if (!body.storeId) {
      return { ok: false, code: 'invalid_store', message: '門市代碼不可為空' };
    }
    if (!Number.isFinite(body.boardSeq) || body.boardSeq < 0) {
      return { ok: false, code: 'invalid_body', message: 'boardSeq 必須為非負數' };
    }
    if (!Number.isFinite(body.pendingUploads) || body.pendingUploads < 0) {
      return { ok: false, code: 'invalid_body', message: 'pendingUploads 必須為非負數' };
    }
    const json = JSON.stringify(body);
    if (utf8ByteLength(json) > MAX_JSON_BYTES) {
      return { ok: false, code: 'invalid_body', message: '請求內容過大' };
    }
    return { ok: true, body: body };
  }

  function validateBoxHeartbeatBody(body) {
    if (!body || typeof body !== 'object') {
      return { ok: false, code: 'invalid_body', message: '請求格式錯誤' };
    }
    return buildBoxHeartbeatRequest(body);
  }

  function formatHttpError(err) {
    const status = err && err.status ? err.status : 0;
    const res = err && err.response ? err.response : null;
    if (status === 401) {
      return 'login expired, please sign in again';
    }
    if (status === 404) {
      return 'device not found';
    }
    if (status === 400 && res && res.message) {
      return String(res.message);
    }
    if (status === 500) {
      return 'internal_error';
    }
    if (res && res.message) {
      return String(res.message);
    }
    return err && err.message ? String(err.message) : 'request failed';
  }

  QMS.Transport.DevCommandValidation = {
    DEVICE_ID_RE: DEVICE_ID_RE,
    MAX_JSON_BYTES: MAX_JSON_BYTES,
    MAX_PARAMS_BYTES: MAX_PARAMS_BYTES,
    MAX_TIMING_MS: MAX_TIMING_MS,
    COMMAND_PARAM_KEYS: COMMAND_PARAM_KEYS,
    clampTimingMs: clampTimingMs,
    validateDeviceId: validateDeviceId,
    buildDevCommandRequest: buildDevCommandRequest,
    validateDevCommandBody: validateDevCommandBody,
    buildBoxHeartbeatRequest: buildBoxHeartbeatRequest,
    validateBoxHeartbeatBody: validateBoxHeartbeatBody,
    formatHttpError: formatHttpError,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
