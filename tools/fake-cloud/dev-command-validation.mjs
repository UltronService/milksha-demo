export const DEVICE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
export const MAX_JSON_BYTES = 1024;

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
  return Buffer.byteLength(String(text), 'utf8');
}

function hasOnlyKeys(obj, allowed) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return false;
  }
  return true;
}

export function validateDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!DEVICE_ID_RE.test(id)) {
    return { ok: false, code: 'invalid_device_id', message: 'invalid device id' };
  }
  return { ok: true, deviceId: id };
}

function normalizeParams(type, params) {
  const allowed = COMMAND_PARAM_KEYS[type];
  if (!allowed) {
    return { ok: false, code: 'invalid_type', message: 'invalid command type' };
  }
  const raw = params === undefined || params === null ? {} : params;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'invalid_params', message: 'invalid params' };
  }
  if (!hasOnlyKeys(raw, allowed)) {
    return { ok: false, code: 'invalid_params', message: 'invalid params' };
  }
  const out = {};
  for (const key of allowed) {
    if (raw[key] === undefined) continue;
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, code: 'invalid_params', message: 'invalid params' };
    }
    out[key] = n;
  }
  if (allowed.length === 0 && Object.keys(raw).length > 0) {
    return { ok: false, code: 'invalid_params', message: 'invalid params' };
  }
  return { ok: true, params: out };
}

export function buildDevCommandRequest(input) {
  const dev = validateDeviceId(input.deviceId);
  if (!dev.ok) return dev;
  const type = String(input.type || '').trim();
  if (!COMMAND_PARAM_KEYS[type]) {
    return { ok: false, code: 'invalid_type', message: 'invalid command type' };
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
    return { ok: false, code: 'invalid_store', message: 'invalid store' };
  }
  const json = JSON.stringify(body);
  if (utf8ByteLength(json) > MAX_JSON_BYTES) {
    return { ok: false, code: 'invalid_body', message: 'request too large' };
  }
  return { ok: true, body };
}

export function validateDevCommandBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'invalid_body', message: 'invalid body' };
  }
  if (!hasOnlyKeys(body, ['storeId', 'deviceId', 'type', 'params'])) {
    return { ok: false, code: 'invalid_body', message: 'invalid body' };
  }
  return buildDevCommandRequest(body);
}

export function buildBoxHeartbeatRequest(input) {
  const dev = validateDeviceId(input.deviceId);
  if (!dev.ok) return dev;
  if (!hasOnlyKeys(input, HEARTBEAT_KEYS)) {
    return { ok: false, code: 'invalid_body', message: 'invalid body' };
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
    return { ok: false, code: 'invalid_store', message: 'invalid store' };
  }
  if (!Number.isFinite(body.boardSeq) || body.boardSeq < 0) {
    return { ok: false, code: 'invalid_body', message: 'invalid boardSeq' };
  }
  if (!Number.isFinite(body.pendingUploads) || body.pendingUploads < 0) {
    return { ok: false, code: 'invalid_body', message: 'invalid pendingUploads' };
  }
  const json = JSON.stringify(body);
  if (utf8ByteLength(json) > MAX_JSON_BYTES) {
    return { ok: false, code: 'invalid_body', message: 'request too large' };
  }
  return { ok: true, body };
}

export function validateBoxHeartbeatBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'invalid_body', message: 'invalid body' };
  }
  return buildBoxHeartbeatRequest(body);
}
