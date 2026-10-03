#!/usr/bin/env node
/**
 * Fake milksha-cloud for Playwright / local firestore mode (gateway ?gateway=127.0.0.1:PORT).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { validatePosReceiverBody } from './pos-validate.mjs';
import { extractRawJsonField } from './json-raw.mjs';
import {
  validateDevCommandBody,
  validateBoxHeartbeatBody,
  validateBoxUploadBody,
  httpStatusForApiErrorCode,
} from './dev-command-validation.mjs';
import { FAKE_CLOUD_POS_SIGN_SECRET } from './sign-secret.mjs';
import { taipeiBusinessDate, isCurrentBusinessDate } from './taipei-business-date.mjs';

const SIGN_SECRET = FAKE_CLOUD_POS_SIGN_SECRET;
const FAKE_DEV_ACCESS_CODE = 'fake-milksha-controller-access-code';

const PORT = Number(process.env.FAKE_CLOUD_PORT || 8787);
const PROJECT = 'milksha-qms-dev';
const REGION = 'asia-east1';

/** @type {Map<string, object>} */
const docs = new Map();
/** @type {Map<string, object[]>} */
const logs = new Map();

let posReceiverEntryAEnabled =
  process.env.POS_RECEIVER_A === undefined || process.env.POS_RECEIVER_A !== '0';
const POS_MAX_AGE_MS = Number(process.env.POS_RECEIVER_MAX_AGE_MS || 10 * 60 * 1000);

function encodeFields(obj) {
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return { integerValue: String(v) };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (typeof v === 'object') {
      const fields = {};
      for (const [k, val] of Object.entries(v)) fields[k] = enc(val);
      return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
  }
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = enc(v);
  return { fields };
}

function decodeValue(w) {
  if (!w || typeof w !== 'object') return null;
  if ('stringValue' in w) return w.stringValue;
  if ('booleanValue' in w) return w.booleanValue;
  if ('integerValue' in w) return parseInt(w.integerValue, 10);
  if ('nullValue' in w) return null;
  if (w.arrayValue?.values) return w.arrayValue.values.map(decodeValue);
  if (w.mapValue?.fields) {
    const o = {};
    for (const [k, v] of Object.entries(w.mapValue.fields)) o[k] = decodeValue(v);
    return o;
  }
  return null;
}

function decodeFields(fields) {
  const o = {};
  if (!fields) return o;
  for (const [k, v] of Object.entries(fields)) o[k] = decodeValue(v);
  return o;
}

function boardKey(storeId) {
  return `stores/${storeId}/board/today_board`;
}

function deviceKey(storeId, deviceId) {
  return `stores/${storeId}/devices/${deviceId}`;
}

function seedE2eDevice() {
  docs.set(deviceKey('s120030', 'stb-01'), {
    online: false,
    lastSeen: '',
    appVersion: '',
    boardSeq: 0,
    pendingUploads: 0,
    simulatedOffline: false,
    pendingCommand: null,
  });
}

/** @param {object} board */
function materializeTodayBoard(board) {
  if (!board || typeof board !== 'object') {
    return board;
  }
  if (isCurrentBusinessDate(board.businessDate)) {
    return board;
  }
  const cleared = {
    storeId: board.storeId,
    businessDate: taipeiBusinessDate(),
    seq: board.seq || 0,
    updatedAt: new Date().toISOString(),
    source: 'system',
    tickets: [],
    clearedAt: new Date().toISOString(),
  };
  docs.set(boardKey(board.storeId), cleared);
  return cleared;
}

function nextSeq(storeId) {
  const cur = docs.get(boardKey(storeId));
  return (cur?.seq ? Number(cur.seq) : 0) + 1;
}

function numberToTickets(nc) {
  const now = new Date().toISOString();
  return (nc || []).map((row) => ({
    no: row.number,
    status: row.source_type?.includes('_OK') ? 'ready' : 'preparing',
    updatedAt: now,
    source_type: row.source_type || 'From_Store_Preparing',
  }));
}

function md5Hex(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

function verifyPosSignature(body) {
  const canon = `${body.merchant_id}|${body.account}|${body.timeStmp}|${body.serviceSpecialData_Json_Md5Hash}`;
  const expected = crypto.createHmac('sha256', SIGN_SECRET).update(canon, 'utf8').digest('base64');
  return body.signature === expected;
}

function receiveLogKey(storeId, id) {
  return `stores/${storeId}/receive_logs/${id}`;
}

function commandLogKey(storeId, id) {
  return `stores/${storeId}/commands/${id}`;
}

function storeHasOnlineBox(storeId) {
  const prefix = `stores/${storeId}/devices/`;
  const now = Date.now();
  for (const [k, v] of docs.entries()) {
    if (!k.startsWith(prefix)) continue;
    if (v.online && v.lastSeen) {
      const age = now - Date.parse(v.lastSeen);
      if (age < 120000) return true;
    }
  }
  return false;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Expose-Headers': 'Date',
  };
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    Date: new Date().toUTCString(),
    ...corsHeaders(),
  });
  res.end(JSON.stringify(body));
}

/** @param {string} code @param {string} message */
function apiError(code, message) {
  return { code, message };
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function readBody(req) {
  return readRawBody(req).then((t) => (t ? JSON.parse(t) : {}));
}

function requireAuth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      body: apiError('invalid_token', 'login expired, please sign in again'),
    };
  }
  const token = h.slice(7).trim();
  if (token === 'expired-test-token') {
    return {
      ok: false,
      status: 401,
      body: apiError('invalid_token', 'login expired, please sign in again'),
    };
  }
  if (token === 'forbidden-test-token') {
    return {
      ok: false,
      status: 403,
      body: apiError('forbidden', 'no permission for this store'),
    };
  }
  return { ok: true };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (url.pathname === '/health') {
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/test/reset' && req.method === 'POST') {
      docs.clear();
      logs.clear();
      posReceiverEntryAEnabled = true;
      seedE2eDevice();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/test/seed-board' && req.method === 'POST') {
      const body = await readBody(req);
      const storeId = body.storeId || 's120030';
      docs.set(boardKey(storeId), {
        storeId,
        businessDate: body.businessDate || '2020-01-01',
        seq: Number(body.seq) || 1,
        updatedAt: new Date().toISOString(),
        source: 'A',
        tickets: Array.isArray(body.tickets) ? body.tickets : [],
        clearedAt: null,
      });
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/test/posReceiverA' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.enabled === 'boolean') {
        posReceiverEntryAEnabled = body.enabled;
      }
      return json(res, 200, { ok: true, enabled: posReceiverEntryAEnabled });
    }

    const fnPrefix = `/fn/${PROJECT}/${REGION}/`;
    if (req.method === 'POST' && url.pathname === `${fnPrefix}devLogin`) {
      const body = await readBody(req);
      if (String(body.accessCode || '') !== FAKE_DEV_ACCESS_CODE) {
        return json(res, 401, {
          code: 'invalid_access_code',
          message: 'wrong access code for fake cloud',
        });
      }
      return json(res, 200, { customToken: `fake-${body.storeId}-${body.role}` });
    }

    if (req.method === 'POST' && url.pathname === '/identity/v1/accounts:signInWithCustomToken') {
      return json(res, 200, {
        idToken: 'fake-id-token',
        refreshToken: 'fake-refresh',
        expiresIn: '3600',
      });
    }

    if (req.method === 'POST' && url.pathname.startsWith(fnPrefix)) {
      const name = url.pathname.slice(fnPrefix.length);
      const rawText = await readRawBody(req);
      const body = rawText ? JSON.parse(rawText) : {};
      const storeId = body.storeId || body.account || 's120030';

      if (name === 'posReceiver' || name === 'posReceiver/') {
        const rawInner = extractRawJsonField(rawText, 'serviceSpecialData_Json');
        const v = validatePosReceiverBody(body, {
          entryAEnabled: posReceiverEntryAEnabled,
          maxAgeMs: POS_MAX_AGE_MS,
          serviceSpecialDataJsonRaw: rawInner,
        });
        if (!v.ok) {
          return json(res, 200, { isSuccess: false, information: v.information });
        }
        if (!verifyPosSignature(body)) {
          return json(res, 200, { isSuccess: false, information: '簽章錯誤' });
        }
        const online = storeHasOnlineBox(storeId);
        const info = online ? '資料顯示成功' : '目標叫號機尚未連線';
        let seq = null;
        if (online) {
          const nc = body.serviceSpecialData_Json?.data?.number_content || [];
          const tickets = numberToTickets(nc);
          seq = nextSeq(storeId);
          const board = {
            storeId,
            businessDate: taipeiBusinessDate(),
            seq: seq,
            updatedAt: new Date().toISOString(),
            source: 'A',
            tickets,
            clearedAt: tickets.length ? null : new Date().toISOString(),
          };
          docs.set(boardKey(storeId), board);
        }
        docs.set(receiveLogKey(storeId, `r-${Date.now()}`), {
          at: new Date().toISOString(),
          kind: 'posReceiver',
          isSuccess: online,
          information: info,
          seq: seq,
        });
        return json(res, 200, { isSuccess: online, information: info, seq: seq });
      }

      const auth = requireAuth(req);
      if (!auth.ok) return json(res, auth.status, auth.body);

      if (name === 'boxHeartbeat') {
        const hv = validateBoxHeartbeatBody(body);
        if (!hv.ok) {
          return json(res, httpStatusForApiErrorCode(hv.code), apiError(hv.code, hv.message));
        }
        const hb = hv.body;
        const dk = deviceKey(hb.storeId, hb.deviceId);
        if (!docs.has(dk)) {
          return json(res, 404, apiError('device_not_found', 'device not found'));
        }
        const prev = docs.get(dk) || {};
        docs.set(dk, {
          ...prev,
          lastSeen: new Date().toISOString(),
          online: !hb.simulatedOffline,
          appVersion: hb.appVersion || '',
          boardSeq: hb.boardSeq || 0,
          pendingUploads: hb.pendingUploads || 0,
          simulatedOffline: Boolean(hb.simulatedOffline),
          lastAckCommandId: hb.ackCommandId || prev.lastAckCommandId || '',
          pendingCommand: prev.pendingCommand || null,
        });
        return json(res, 200, { ok: true });
      }

      if (name === 'boxUpload' || name === 'boxUpload/') {
        const uv = validateBoxUploadBody(body);
        if (!uv.ok) {
          return json(res, httpStatusForApiErrorCode(uv.code), apiError(uv.code, uv.message));
        }
        return json(res, 501, apiError('not_implemented', 'boxUpload is not implemented in fake-cloud.'));
      }

      if (name === 'devCommand') {
        const cv = validateDevCommandBody(body);
        if (!cv.ok) {
          return json(res, httpStatusForApiErrorCode(cv.code), apiError(cv.code, cv.message));
        }
        const cmdBody = cv.body;
        const dk = deviceKey(cmdBody.storeId, cmdBody.deviceId);
        if (!docs.has(dk)) {
          return json(res, 404, apiError('device_not_found', 'device not found'));
        }
        const prev = docs.get(dk) || {};
        const cmd = {
          id: `cmd-${Date.now()}`,
          type: cmdBody.type,
          params: cmdBody.params || {},
          issuedAt: new Date().toISOString(),
        };
        if (cmdBody.type === 'clear_now') {
          docs.set(boardKey(cmdBody.storeId), {
            storeId: cmdBody.storeId,
            businessDate: taipeiBusinessDate(),
            seq: nextSeq(cmdBody.storeId),
            updatedAt: new Date().toISOString(),
            source: 'system',
            tickets: [],
            clearedAt: new Date().toISOString(),
          });
        }
        docs.set(dk, { ...prev, pendingCommand: cmd });
        docs.set(commandLogKey(cmdBody.storeId, cmd.id), {
          at: new Date().toISOString(),
          type: cmdBody.type,
          deviceId: cmdBody.deviceId,
          commandId: cmd.id,
        });
        return json(res, 200, { ok: true, commandId: cmd.id });
      }

      return json(res, 404, apiError('not_found', 'Cloud function not found.'));
    }

    const docPrefix = `/v1/projects/${PROJECT}/databases/(default)/documents/`;
    if (req.method === 'GET' && url.pathname.startsWith(docPrefix)) {
      const docAuth = requireAuth(req);
      if (!docAuth.ok) return json(res, docAuth.status, docAuth.body);
      const rel = decodeURIComponent(url.pathname.slice(docPrefix.length)).replace(/\/$/, '');
      let data = docs.get(rel);
      if (data) {
        if (rel.endsWith('/board/today_board')) {
          data = materializeTodayBoard(data);
        }
        return json(res, 200, {
          name: `projects/${PROJECT}/databases/(default)/documents/${rel}`,
          fields: encodeFields(data).fields,
          updateTime: data.updatedAt || data.lastSeen || new Date().toISOString(),
        });
      }
      const prefix = rel + '/';
      const items = [];
      for (const [k, v] of docs.entries()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (rest.includes('/')) continue;
        items.push({
          name: `projects/${PROJECT}/databases/(default)/documents/${k}`,
          fields: encodeFields(v).fields,
          updateTime: v.updatedAt || v.lastSeen || new Date().toISOString(),
        });
      }
      if (items.length === 0) {
        res.writeHead(404, corsHeaders());
        return res.end();
      }
      return json(res, 200, { documents: items });
    }

    res.writeHead(404);
    res.end('not found');
  } catch (e) {
    json(res, 500, apiError('internal_error', 'An internal error occurred.'));
  }
});

seedE2eDevice();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake-cloud listening on http://127.0.0.1:${PORT}`);
});
