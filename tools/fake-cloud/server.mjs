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
const KNOWN_LITERAL_STORE_IDS = new Set(['s120030', 'c030020', 'a17']);
const STORE_ID_ZZ_QA_RE = /^zz-qa-[a-z0-9-]+$/;
const STORE_ID_ZZ_DENY_RE = /^zz-deny-[a-z0-9-]+$/;
const STORE_ID_LETTER_SIX_DIGITS_RE = /^[a-z][0-9]{6}$/;
const STORE_REGISTRY_MAX = Number(process.env.FAKE_STORE_REGISTRY_MAX || 200);

function isValidStoreIdFormat(storeId) {
  const id = String(storeId || '').trim();
  if (!id) {
    return false;
  }
  if (KNOWN_LITERAL_STORE_IDS.has(id)) {
    return true;
  }
  if (STORE_ID_ZZ_QA_RE.test(id)) {
    return true;
  }
  if (STORE_ID_ZZ_DENY_RE.test(id)) {
    return true;
  }
  if (STORE_ID_LETTER_SIX_DIGITS_RE.test(id)) {
    return true;
  }
  return false;
}

/** @type {Map<string, { storeId: string, name: string, registeredAt: number|null, test: boolean }>} */
const storeRegistry = new Map();

function isStoreRegistered(storeId) {
  return storeRegistry.has(String(storeId || '').trim());
}

function registerStore(storeId, opts) {
  const id = String(storeId || '').trim();
  if (!isValidStoreIdFormat(id)) {
    return { ok: false, code: 'store_id_invalid', message: 'invalid store id format' };
  }
  if (id.indexOf('zz-deny-') === 0) {
    return { ok: false, code: 'store_not_allowed', message: 'store denied' };
  }
  if (storeRegistry.has(id)) {
    const existing = storeRegistry.get(id);
    if (opts && opts.name && String(opts.name).trim()) {
      existing.name = String(opts.name).trim();
      storeRegistry.set(id, existing);
    }
    return { ok: true, store: existing };
  }
  if (storeRegistry.size >= STORE_REGISTRY_MAX) {
    return { ok: false, code: 'dev_store_registry_full', message: 'registry full' };
  }
  const test = id.indexOf('zz-qa-') === 0;
  const entry = {
    storeId: id,
    name: (opts && opts.name) || id,
    registeredAt: Date.now(),
    test,
  };
  storeRegistry.set(id, entry);
  return { ok: true, store: entry };
}

function seedRegisteredStores() {
  ['s120030', 'c030020', 'zz-qa-store-a', 'zz-qa-store-b'].forEach(function (id) {
    registerStore(id, { name: id });
  });
}

function isAllowedDevLoginStore(storeId) {
  return isStoreRegistered(storeId);
}
let devLoginRequestCount = 0;
let listStoresRequestCount = 0;
/** @type {Map<string, { storeId: string, firstPairedAtMs: number }>} */
const boardAutoPairByDevice = new Map();
let boardAutoPairRequestCount = 0;
let boardAutoPairInitialCount = 0;
let boardAutoPairReadCount = 0;
/** @type {object[]} */
const boardAutoPairBodiesLog = [];
const BOARD_AUTO_PAIR_FIRST_WINDOW_MS = 10 * 60 * 1000;
/** @type {() => number} */
let boardAutoPairNowMs = () => Date.now();
/** @type {{ at: number, name: string, detail?: string }[]} */
const authBootEvents = [];
let lastBoardAutoPairCustomToken = '';

const PORT = Number(process.env.FAKE_CLOUD_PORT || 8787);
const PROJECT = 'milksha-qms-dev';
const REGION = 'asia-east1';

/** @type {Map<string, object>} */
const docs = new Map();
/** @type {Map<string, object[]>} */
const logs = new Map();

let posReceiverEntryAEnabled =
  process.env.POS_RECEIVER_A === undefined || process.env.POS_RECEIVER_A !== '0';
/** When false, boxHeartbeat ack does not clear pendingCommand (production-like 7-day retention). */
let pendingCommandClearOnAck = true;
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

function devicePendingControlKey(storeId, deviceId) {
  return `${deviceKey(storeId, deviceId)}/control/pending`;
}

function seedE2eDevice() {
  const emptyDevice = {
    online: false,
    lastSeen: '',
    appVersion: '',
    boardSeq: 0,
    pendingUploads: 0,
    simulatedOffline: false,
    pendingCommand: null,
  };
  docs.set(deviceKey('s120030', 'stb-01'), { ...emptyDevice });
  docs.set(deviceKey('c030020', 'stb-01'), { ...emptyDevice });
  docs.set(deviceKey('zz-qa-store-a', 'stb-01'), { ...emptyDevice });
  docs.set(deviceKey('zz-qa-store-b', 'stb-01'), { ...emptyDevice });
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

function pushEntryToRow(entry, zone) {
  const defaultReady = 'From_Store_OK';
  const defaultPrep = 'From_Store_Preparing';
  if (typeof entry === 'string' || typeof entry === 'number') {
    const no = String(entry).trim();
    if (!no) return null;
    return {
      no,
      status: zone === 'ready' ? 'ready' : 'preparing',
      source_type: zone === 'ready' ? defaultReady : defaultPrep,
    };
  }
  if (!entry || typeof entry !== 'object') return null;
  const no = entry.no != null ? String(entry.no).trim() : '';
  let sourceType = entry.sourceType != null ? String(entry.sourceType).trim() : '';
  if (!sourceType && entry.source_type != null) {
    sourceType = String(entry.source_type).trim();
  }
  if (!no || !sourceType) return null;
  return {
    no,
    status: zone === 'ready' ? 'ready' : 'preparing',
    source_type: sourceType,
  };
}

function pushParamsToTickets(params) {
  const now = new Date().toISOString();
  const tickets = [];
  const ready = params && Array.isArray(params.ready) ? params.ready : [];
  const preparing = params && Array.isArray(params.preparing) ? params.preparing : [];
  for (const entry of ready) {
    const row = pushEntryToRow(entry, 'ready');
    if (row) tickets.push({ ...row, updatedAt: now });
  }
  for (const entry of preparing) {
    const row = pushEntryToRow(entry, 'preparing');
    if (row) tickets.push({ ...row, updatedAt: now });
  }
  return tickets;
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

function storeAllowsPosBoardWrite(storeId) {
  const prefix = `stores/${storeId}/devices/`;
  const now = Date.now();
  for (const [k, v] of docs.entries()) {
    if (!k.startsWith(prefix)) continue;
    if (!v.lastSeen) continue;
    const age = now - Date.parse(v.lastSeen);
    if (age >= 120000) continue;
    if (v.online === true) return true;
    if (v.simulatedOffline === true) return true;
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

function httpDateHeader() {
  const fixed = process.env.FAKE_CLOUD_HTTP_DATE;
  if (fixed && String(fixed).trim()) {
    return String(fixed).trim();
  }
  return new Date().toUTCString();
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    Date: httpDateHeader(),
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

/** @param {string} token */
function storeIdForAuthToken(token) {
  const t = String(token || '').trim();
  if (!t || t === 'expired-test-token' || t === 'forbidden-test-token') {
    return '';
  }
  if (t === 'fake-id-token' || t === 'e2e-fake-id-token') {
    return '';
  }
  const roleSuffixes = ['controller-web', 'controller', 'device'];
  for (let i = 0; i < roleSuffixes.length; i += 1) {
    const role = roleSuffixes[i];
    const suffix = '-' + role;
    if (t.startsWith('fake-') && t.endsWith(suffix)) {
      return t.slice('fake-'.length, t.length - suffix.length);
    }
  }
  return 's120030';
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
      const resetBody = req.method === 'POST' ? await readBody(req) : {};
      docs.clear();
      logs.clear();
      posReceiverEntryAEnabled = true;
      pendingCommandClearOnAck = true;
      devLoginRequestCount = 0;
      listStoresRequestCount = 0;
      boardAutoPairByDevice.clear();
      boardAutoPairRequestCount = 0;
      boardAutoPairInitialCount = 0;
      boardAutoPairReadCount = 0;
      boardAutoPairBodiesLog.length = 0;
      boardAutoPairNowMs = () => Date.now();
      authBootEvents.length = 0;
      lastBoardAutoPairCustomToken = '';
      storeRegistry.clear();
      seedRegisteredStores();
      if (resetBody.seedDevice !== false) {
        seedE2eDevice();
      }
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/test/registerStore' && req.method === 'POST') {
      const body = await readBody(req);
      const reg = registerStore(body.storeId || '', { name: body.name });
      if (!reg.ok) {
        return json(res, 403, apiError(reg.code, reg.message));
      }
      return json(res, 200, { ok: true, store: reg.store });
    }
    if (url.pathname === '/test/devLoginCount' && req.method === 'GET') {
      return json(res, 200, { count: devLoginRequestCount });
    }
    if (url.pathname === '/test/boardAutoPairCount' && req.method === 'GET') {
      return json(res, 200, { count: boardAutoPairRequestCount });
    }
    if (url.pathname === '/test/boardAutoPairInitialCount' && req.method === 'GET') {
      return json(res, 200, { count: boardAutoPairInitialCount });
    }
    if (url.pathname === '/test/boardAutoPairReadCount' && req.method === 'GET') {
      return json(res, 200, { count: boardAutoPairReadCount });
    }
    if (url.pathname === '/test/boardAutoPairBodies' && req.method === 'GET') {
      return json(res, 200, { bodies: boardAutoPairBodiesLog.slice() });
    }
    if (url.pathname === '/test/boardAutoPairNow' && req.method === 'POST') {
      const body = await readBody(req);
      if (body && Number.isFinite(Number(body.nowMs))) {
        const fixed = Number(body.nowMs);
        boardAutoPairNowMs = () => fixed;
      }
      return json(res, 200, { ok: true, nowMs: boardAutoPairNowMs() });
    }
    if (url.pathname === '/test/authBootOrder' && req.method === 'GET') {
      return json(res, 200, {
        events: authBootEvents.slice(),
        devLoginCount: devLoginRequestCount,
        lastBoardAutoPairCustomToken: lastBoardAutoPairCustomToken,
      });
    }
    if (url.pathname === '/test/listStoresCount' && req.method === 'GET') {
      return json(res, 200, { count: listStoresRequestCount });
    }
    if (url.pathname === '/test/devicePendingCommand' && req.method === 'POST') {
      const body = await readBody(req);
      const store = body.storeId || 's120030';
      const device = body.deviceId || 'stb-01';
      const dk = deviceKey(store, device);
      if (!docs.has(dk)) {
        seedE2eDevice();
      }
      const issuedAt =
        typeof body.issuedAt === 'string' && body.issuedAt.trim()
          ? body.issuedAt.trim()
          : new Date().toISOString();
      const cmd = {
        id: body.id || `cmd-test-${Date.now()}`,
        type: body.type || 'reload',
        params: body.params && typeof body.params === 'object' ? body.params : {},
        issuedAt,
      };
      if (body.issuedAtMs != null && Number.isFinite(Number(body.issuedAtMs))) {
        cmd.issuedAtMs = Number(body.issuedAtMs);
      }
      const prev = docs.get(dk) || {};
      docs.set(dk, { ...prev, pendingCommand: cmd });
      return json(res, 200, { ok: true, commandId: cmd.id });
    }
    if (url.pathname === '/test/pendingCommandMode' && req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.clearOnAck === 'boolean') {
        pendingCommandClearOnAck = body.clearOnAck;
      }
      return json(res, 200, { ok: true, clearOnAck: pendingCommandClearOnAck });
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
      devLoginRequestCount += 1;
      authBootEvents.push({ at: Date.now(), name: 'devLogin' });
      const body = await readBody(req);
      const sid = String(body.storeId || '').trim();
      if (!isValidStoreIdFormat(sid)) {
        return json(res, 403, apiError('store_id_invalid', 'invalid store id format'));
      }
      if (sid.indexOf('zz-deny-') === 0) {
        return json(res, 403, apiError('store_not_allowed', 'store denied'));
      }
      const role = String(body.role || '').trim();
      if (role === 'controller' && !isStoreRegistered(sid)) {
        return json(res, 403, apiError('store_not_allowed', 'store not registered'));
      }
      if (role === 'controller' && !isAllowedDevLoginStore(sid)) {
        return json(res, 403, apiError('store_not_allowed', 'store not allowed for controller dev login'));
      }
      if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        try {
          const { mintCustomToken } = await import('../emulator-qa/admin.mjs');
          const token = await mintCustomToken({
            storeId: sid,
            role: role || 'device',
            deviceId: body.deviceId || 'stb-01',
          });
          return json(res, 200, { customToken: token });
        } catch (e) {
          return json(res, 500, { code: 'dev_login_mint_failed', message: String(e.message || e) });
        }
      }
      return json(res, 200, { customToken: `fake-${sid}-${role || 'device'}` });
    }

    if (req.method === 'POST' && url.pathname === '/identity/v1/accounts:signInWithCustomToken') {
      const body = await readBody(req);
      const customToken = String(body.token || '').trim();
      const authEmu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
      if (authEmu && customToken && !customToken.startsWith('fake-')) {
        try {
          const target =
            'http://' +
            authEmu.replace(/\/$/, '') +
            '/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken' +
            (url.search || '?key=fake-api-key-for-emulator');
          const proxyRes = await fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const proxyJson = await proxyRes.json();
          return json(res, proxyRes.status, proxyJson);
        } catch (e) {
          return json(res, 502, { code: 'auth_emulator_proxy_failed', message: String(e.message || e) });
        }
      }
      const idToken =
        customToken && customToken.startsWith('fake-') ? customToken : 'fake-id-token';
      authBootEvents.push({
        at: Date.now(),
        name: 'signInWithCustomToken',
        detail:
          lastBoardAutoPairCustomToken && customToken === lastBoardAutoPairCustomToken
            ? 'pair_token'
            : 'other_token',
      });
      return json(res, 200, {
        idToken,
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
        const allowWrite = storeAllowsPosBoardWrite(storeId);
        const info = online ? '資料顯示成功' : '找不到機台';
        let seq = null;
        if (allowWrite) {
          const nc = body.serviceSpecialData_Json?.data?.number_content || [];
          const tickets = numberToTickets(nc);
          seq = nextSeq(storeId);
          docs.set(boardKey(storeId), {
            storeId,
            businessDate: taipeiBusinessDate(),
            seq: seq,
            updatedAt: new Date().toISOString(),
            source: 'A',
            tickets,
            clearedAt: tickets.length ? null : new Date().toISOString(),
          });
        }
        docs.set(receiveLogKey(storeId, `r-${Date.now()}`), {
          at: new Date().toISOString(),
          kind: 'posReceiver',
          isSuccess: allowWrite,
          information: info,
          seq: seq,
        });
        return json(res, 200, {
          isSuccess: allowWrite,
          information: info,
          seq: seq,
          boxOnline: online,
        });
      }

      if (name === 'boardAutoPair' || name === 'boardAutoPair/') {
        authBootEvents.push({ at: Date.now(), name: 'boardAutoPair' });
        boardAutoPairRequestCount += 1;
        boardAutoPairBodiesLog.push({ ...body });
        const deviceId = String(body.deviceId || body.machineId || '').trim();
        if (!deviceId) {
          return json(res, 400, apiError('invalid_body', 'deviceId required'));
        }
        if (deviceId.length > 128) {
          return json(res, 400, apiError('invalid_body', 'deviceId too long'));
        }
        if (body.clientIp != null || body.ip != null || body.externalIp != null) {
          return json(res, 400, apiError('invalid_body', 'ip fields not accepted'));
        }

        const now = boardAutoPairNowMs();
        const readStoreId = String(body.storeId || '').trim();
        const hasReadPath = Boolean(readStoreId) && !body.brand && !body.storeNumber && !body.brandId;

        async function mintPairToken(storeId) {
          if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
            try {
              const { mintCustomToken } = await import('../emulator-qa/admin.mjs');
              return await mintCustomToken({
                storeId,
                role: 'device',
                deviceId,
              });
            } catch (e) {
              return null;
            }
          }
          return `fake-${storeId}-device`;
        }

        function pairNotFound() {
          return json(res, 200, { ok: false, information: '找不到目標叫號機' });
        }

        function resolveStoreIdFromInitial(brand, storeNumber) {
          const sn = String(storeNumber || '').trim();
          if (!sn) {
            return null;
          }
          if (
            isValidStoreIdFormat(sn) &&
            (STORE_ID_ZZ_QA_RE.test(sn) ||
              STORE_ID_LETTER_SIX_DIGITS_RE.test(sn) ||
              KNOWN_LITERAL_STORE_IDS.has(sn))
          ) {
            return sn;
          }
          const b = String(brand || body.brandId || '').trim();
          if (b === 'zz-qa') {
            return 'zz-qa-' + sn.toLowerCase();
          }
          if ((b === 'Milksha' || b === 'milksha') && STORE_ID_LETTER_SIX_DIGITS_RE.test(sn)) {
            return sn;
          }
          return null;
        }

        if (hasReadPath) {
          boardAutoPairReadCount += 1;
          if (!isValidStoreIdFormat(readStoreId)) {
            return pairNotFound();
          }
          const entry = boardAutoPairByDevice.get(deviceId);
          if (!entry || entry.storeId !== readStoreId) {
            return pairNotFound();
          }
          if (!isStoreRegistered(readStoreId)) {
            return pairNotFound();
          }
          const storeEntry = storeRegistry.get(readStoreId);
          let isFirstBind = false;
          if (now - entry.firstPairedAtMs < BOARD_AUTO_PAIR_FIRST_WINDOW_MS) {
            isFirstBind = true;
          }
          const customToken = await mintPairToken(readStoreId);
          if (!customToken) {
            return json(res, 500, apiError('internal_error', 'token mint failed'));
          }
          lastBoardAutoPairCustomToken = customToken;
          return json(res, 200, {
            ok: true,
            storeId: readStoreId,
            storeName: storeEntry && storeEntry.name ? storeEntry.name : readStoreId,
            storeNumber: readStoreId,
            isFirstBind,
            customToken,
          });
        }

        boardAutoPairInitialCount += 1;
        const brand = String(body.brand || body.brandId || '').trim();
        const storeNumber = String(body.storeNumber || body.storeId || '').trim();
        if (!brand || !storeNumber) {
          return json(res, 400, apiError('invalid_body', 'brand and storeNumber required'));
        }
        const resolvedStoreId = resolveStoreIdFromInitial(brand, storeNumber);
        if (!resolvedStoreId || !isValidStoreIdFormat(resolvedStoreId)) {
          return pairNotFound();
        }
        if (!isStoreRegistered(resolvedStoreId)) {
          return pairNotFound();
        }
        const storeEntry = storeRegistry.get(resolvedStoreId);
        if (!storeEntry) {
          return pairNotFound();
        }
        let entry = boardAutoPairByDevice.get(deviceId);
        let isFirstBind = false;
        if (!entry) {
          isFirstBind = true;
          entry = { storeId: resolvedStoreId, firstPairedAtMs: now };
          boardAutoPairByDevice.set(deviceId, entry);
        } else if (entry.storeId !== resolvedStoreId) {
          entry = { storeId: resolvedStoreId, firstPairedAtMs: now };
          boardAutoPairByDevice.set(deviceId, entry);
          isFirstBind = true;
        } else if (now - entry.firstPairedAtMs < BOARD_AUTO_PAIR_FIRST_WINDOW_MS) {
          isFirstBind = true;
        }
        const customToken = await mintPairToken(resolvedStoreId);
        if (!customToken) {
          return json(res, 500, apiError('internal_error', 'token mint failed'));
        }
        lastBoardAutoPairCustomToken = customToken;
        return json(res, 200, {
          ok: true,
          storeId: resolvedStoreId,
          storeName: storeEntry && storeEntry.name ? storeEntry.name : resolvedStoreId,
          storeNumber: resolvedStoreId,
          isFirstBind,
          customToken,
        });
      }

      const auth = requireAuth(req);
      if (!auth.ok) return json(res, auth.status, auth.body);

      if (name === 'listStores') {
        listStoresRequestCount += 1;
        const now = Date.now();
        const onlineWindowMs = 180 * 1000;
        const stores = [];
        for (const entry of storeRegistry.values()) {
          const devices = [];
          let storeOnline = false;
          let lastSeenAt = null;
          const prefix = `stores/${entry.storeId}/devices/`;
          for (const [k, v] of docs.entries()) {
            if (!k.startsWith(prefix)) {
              continue;
            }
            const deviceId = k.slice(prefix.length);
            const seen = v.lastSeen ? Date.parse(v.lastSeen) : 0;
            const online = Boolean(v.online) && seen && now - seen < onlineWindowMs;
            if (online) {
              storeOnline = true;
            }
            if (seen && (!lastSeenAt || seen > lastSeenAt)) {
              lastSeenAt = seen;
            }
            devices.push({
              deviceId,
              online,
              lastSeenAt: seen || null,
            });
          }
          stores.push({
            storeId: entry.storeId,
            name: entry.name,
            online: storeOnline,
            lastSeenAt,
            registeredAt: entry.registeredAt,
            test: entry.test,
            devices,
          });
        }
        stores.sort((a, b) => String(a.storeId).localeCompare(String(b.storeId)));
        return json(res, 200, {
          serverTime: now,
          onlineWindowSec: 180,
          stores,
        });
      }

      if (name === 'boxHeartbeat') {
        const hv = validateBoxHeartbeatBody(body);
        if (!hv.ok) {
          return json(res, httpStatusForApiErrorCode(hv.code), apiError(hv.code, hv.message));
        }
        const hb = hv.body;
        const reg = registerStore(hb.storeId);
        if (!reg.ok) {
          return json(res, 403, apiError(reg.code, reg.message));
        }
        const dk = deviceKey(hb.storeId, hb.deviceId);
        const prev = docs.get(dk) || {
          online: false,
          lastSeen: '',
          appVersion: '',
          boardSeq: 0,
          pendingUploads: 0,
          simulatedOffline: false,
          pendingCommand: null,
        };
        let nextPending = prev.pendingCommand || null;
        if (
          pendingCommandClearOnAck &&
          hb.ackCommandId &&
          nextPending &&
          nextPending.id === hb.ackCommandId
        ) {
          nextPending = null;
          docs.delete(devicePendingControlKey(hb.storeId, hb.deviceId));
        }
        docs.set(dk, {
          ...prev,
          lastSeen: new Date().toISOString(),
          online: !hb.simulatedOffline,
          appVersion: hb.appVersion || '',
          boardSeq: hb.boardSeq || 0,
          pendingUploads: hb.pendingUploads || 0,
          simulatedOffline: Boolean(hb.simulatedOffline),
          lastAckCommandId: hb.ackCommandId || prev.lastAckCommandId || '',
          pendingCommand: nextPending,
        });
        return json(res, 200, { ok: true, serverNowMs: Date.now() });
      }

      if (name === 'boxSeenReport' || name === 'boxSeenReport/') {
        const sid = String(body.storeId || '').trim();
        const reg = registerStore(sid);
        if (!reg.ok) {
          return json(res, 403, apiError(reg.code, reg.message));
        }
        if (!body.boxId || !Array.isArray(body.items)) {
          return json(res, 400, apiError('invalid_body', 'boxSeenReport payload invalid'));
        }
        const key = receiveLogKey(sid, `seen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        docs.set(key, {
          at: new Date().toISOString(),
          kind: 'boxSeenReport',
          payload: body,
          serverReceivedAtMs: Date.now(),
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
        const bearer = (req.headers.authorization || '').startsWith('Bearer ')
          ? (req.headers.authorization || '').slice(7).trim()
          : '';
        const authStoreId = storeIdForAuthToken(bearer);
        if (authStoreId && cmdBody.storeId !== authStoreId) {
          return json(res, 403, apiError('forbidden', 'store id does not match token store'));
        }
        if (!isValidStoreIdFormat(cmdBody.storeId)) {
          return json(res, 403, apiError('store_id_invalid', 'invalid store id format'));
        }
        if (!isStoreRegistered(cmdBody.storeId)) {
          return json(res, 403, apiError('store_not_allowed', 'store not registered'));
        }
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
        let boardSeq = Number(prev.boardSeq) || 0;
        if (cmdBody.type === 'clear_now') {
          boardSeq = nextSeq(cmdBody.storeId);
          docs.set(boardKey(cmdBody.storeId), {
            storeId: cmdBody.storeId,
            businessDate: taipeiBusinessDate(),
            seq: boardSeq,
            updatedAt: new Date().toISOString(),
            source: 'system',
            tickets: [],
            clearedAt: new Date().toISOString(),
          });
        } else if (cmdBody.type === 'push_numbers') {
          const tickets = pushParamsToTickets(cmdBody.params);
          boardSeq = nextSeq(cmdBody.storeId);
          docs.set(boardKey(cmdBody.storeId), {
            storeId: cmdBody.storeId,
            businessDate: taipeiBusinessDate(),
            seq: boardSeq,
            updatedAt: new Date().toISOString(),
            source: 'A',
            tickets,
            clearedAt: tickets.length ? null : new Date().toISOString(),
          });
        }
        const pendingWithSeq = { ...cmd, boardSeq };
        docs.set(dk, { ...prev, pendingCommand: pendingWithSeq, boardSeq });
        docs.set(devicePendingControlKey(cmdBody.storeId, cmdBody.deviceId), pendingWithSeq);
        docs.set(commandLogKey(cmdBody.storeId, cmd.id), {
          at: new Date().toISOString(),
          type: cmdBody.type,
          deviceId: cmdBody.deviceId,
          commandId: cmd.id,
        });
        return json(res, 200, { ok: true, commandId: cmd.id, boardSeq });
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

seedRegisteredStores();
seedE2eDevice();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake-cloud listening on http://127.0.0.1:${PORT}`);
});
