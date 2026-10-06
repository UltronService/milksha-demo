export const DEVICE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
export const MAX_JSON_BYTES = 1024;
export const MAX_PARAMS_BYTES = 1024;
export const MAX_TIMING_MS = 60000;

const COMMAND_PARAM_KEYS = {
  simulate_offline: ['durationMs'],
  slow: ['delayMs'],
  restore: [],
  reload: [],
  reboot: [],
  clear_now: [],
  push_numbers: ['ready', 'preparing'],
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
  return Buffer.byteLength(String(text), 'utf8');
}

function hasOnlyKeys(obj, allowed) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return false;
  }
  return true;
}

function invalidCommandParams(message) {
  return { ok: false, code: 'invalid_command_params', message: message || 'invalid command params' };
}

function invalidBody(message) {
  return { ok: false, code: 'invalid_body', message: message || 'invalid body' };
}

export function clampTimingMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > MAX_TIMING_MS) return MAX_TIMING_MS;
  return rounded;
}

function parseTimingMs(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, omitted: true };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return invalidCommandParams('timing must be integer 0..60000');
  }
  if (n < 0 || n > MAX_TIMING_MS) {
    return invalidCommandParams('timing must be integer 0..60000');
  }
  return { ok: true, value: n };
}

export function validateDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!DEVICE_ID_RE.test(id)) {
    return { ok: false, code: 'invalid_device_id', message: 'invalid device id' };
  }
  return { ok: true, deviceId: id };
}

function normalizeStringNumberList(value) {
  if (value === undefined || value === null) {
    return { ok: true, list: [] };
  }
  if (!Array.isArray(value)) {
    return invalidCommandParams('invalid params');
  }
  const list = [];
  for (const item of value) {
    const s = String(item == null ? '' : item).trim();
    if (!s || s.length > 32) {
      return invalidCommandParams('invalid params');
    }
    list.push(s);
  }
  return { ok: true, list };
}

function normalizeParams(type, params) {
  const allowed = COMMAND_PARAM_KEYS[type];
  if (!allowed) {
    return invalidCommandParams('invalid command type');
  }
  const raw = params === undefined || params === null ? {} : params;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return invalidCommandParams('invalid params');
  }
  if (!hasOnlyKeys(raw, allowed)) {
    return invalidCommandParams('invalid params');
  }
  const out = {};
  if (type === 'push_numbers') {
    const readyNorm = normalizeStringNumberList(raw.ready);
    if (!readyNorm.ok) return readyNorm;
    const prepNorm = normalizeStringNumberList(raw.preparing);
    if (!prepNorm.ok) return prepNorm;
    out.ready = readyNorm.list;
    out.preparing = prepNorm.list;
    const paramsJson = JSON.stringify(out);
    if (utf8ByteLength(paramsJson) > MAX_PARAMS_BYTES) {
      return invalidCommandParams('params too large');
    }
    return { ok: true, params: out };
  }
  for (const key of allowed) {
    if (raw[key] === undefined) continue;
    if (key === 'durationMs' || key === 'delayMs') {
      const parsed = parseTimingMs(raw[key]);
      if (!parsed.ok) return parsed;
      if (!parsed.omitted) out[key] = parsed.value;
      continue;
    }
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return invalidCommandParams('invalid params');
    }
    out[key] = n;
  }
  if (allowed.length === 0 && Object.keys(raw).length > 0) {
    return invalidCommandParams('invalid params');
  }
  const paramsJson = JSON.stringify(out);
  if (utf8ByteLength(paramsJson) > MAX_PARAMS_BYTES) {
    return invalidCommandParams('params too large');
  }
  return { ok: true, params: out };
}

export function buildDevCommandRequest(input) {
  const dev = validateDeviceId(input.deviceId);
  if (!dev.ok) return dev;
  const type = String(input.type || '').trim();
  if (!COMMAND_PARAM_KEYS[type]) {
    return invalidCommandParams('invalid command type');
  }
  const norm = normalizeParams(type, input.params);
  if (!norm.ok) return norm;
  const body = {
    storeId: String(input.storeId || '').trim(),
    deviceId: dev.deviceId,
    type,
    params: norm.params,
  };
  if (!body.storeId) {
    return invalidCommandParams('invalid store');
  }
  const json = JSON.stringify(body);
  if (utf8ByteLength(json) > MAX_JSON_BYTES) {
    return invalidCommandParams('request too large');
  }
  return { ok: true, body };
}

export function validateDevCommandBody(body) {
  if (!body || typeof body !== 'object') {
    return invalidCommandParams('invalid body');
  }
  if (!hasOnlyKeys(body, ['storeId', 'deviceId', 'type', 'params'])) {
    return invalidCommandParams('invalid body');
  }
  return buildDevCommandRequest(body);
}

export function httpStatusForApiErrorCode(code) {
  if (code === 'device_not_found' || code === 'not_found') return 404;
  if (code === 'internal_error') return 500;
  if (code === 'payload_too_large') return 413;
  if (code === 'invalid_device_id' || code === 'invalid_command_params' || code === 'invalid_body') {
    return 400;
  }
  return 500;
}

/** @deprecated use httpStatusForApiErrorCode */
export function httpStatusForDevCommandCode(code) {
  return httpStatusForApiErrorCode(code);
}

export function buildBoxHeartbeatRequest(input) {
  const dev = validateDeviceId(input.deviceId);
  if (!dev.ok) return dev;
  if (!hasOnlyKeys(input, HEARTBEAT_KEYS)) {
    return invalidBody('invalid body');
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
    return invalidBody('invalid store');
  }
  if (!Number.isFinite(body.boardSeq) || body.boardSeq < 0) {
    return invalidBody('invalid boardSeq');
  }
  if (!Number.isFinite(body.pendingUploads) || body.pendingUploads < 0) {
    return invalidBody('invalid pendingUploads');
  }
  const json = JSON.stringify(body);
  if (utf8ByteLength(json) > MAX_JSON_BYTES) {
    return invalidBody('request too large');
  }
  return { ok: true, body };
}

export function validateBoxHeartbeatBody(body) {
  if (!body || typeof body !== 'object') {
    return invalidBody('invalid body');
  }
  return buildBoxHeartbeatRequest(body);
}

const BOX_UPLOAD_KEYS = ['storeId', 'deviceId', 'posPayload', 'posRawBody'];

export function validateBoxUploadBody(body) {
  if (!body || typeof body !== 'object') {
    return invalidBody('invalid body');
  }
  if (!hasOnlyKeys(body, BOX_UPLOAD_KEYS)) {
    return invalidBody('invalid body');
  }
  if (!String(body.storeId || '').trim() || !String(body.deviceId || '').trim()) {
    return invalidBody('invalid body');
  }
  if (body.posPayload === undefined || body.posPayload === null) {
    return invalidBody('invalid body');
  }
  return { ok: true, body };
}
