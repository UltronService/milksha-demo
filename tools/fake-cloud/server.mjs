#!/usr/bin/env node
/**
 * Fake milksha-cloud for Playwright / local firestore mode (gateway ?gateway=127.0.0.1:PORT).
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { validatePosReceiverBody } from './pos-validate.mjs';
import { extractRawJsonField } from './json-raw.mjs';
import { FAKE_CLOUD_POS_SIGN_SECRET } from './sign-secret.mjs';

const SIGN_SECRET = FAKE_CLOUD_POS_SIGN_SECRET;

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

function taipeiDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
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
  };
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(body));
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
  return h.startsWith('Bearer ');
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
            businessDate: taipeiDate(),
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

      if (!requireAuth(req)) return json(res, 401, { error: 'auth' });

      if (name === 'boxHeartbeat') {
        const dk = deviceKey(storeId, body.deviceId || 'stb-01');
        const prev = docs.get(dk) || {};
        docs.set(dk, {
          ...prev,
          lastSeen: new Date().toISOString(),
          online: !body.simulatedOffline,
          appVersion: body.appVersion || '',
          boardSeq: body.boardSeq || 0,
          pendingUploads: body.pendingUploads || 0,
          simulatedOffline: Boolean(body.simulatedOffline),
          lastAckCommandId: body.ackCommandId || prev.lastAckCommandId || '',
          pendingCommand: prev.pendingCommand || null,
        });
        return json(res, 200, { ok: true });
      }

      if (name === 'devCommand') {
        const dk = deviceKey(storeId, body.deviceId || 'stb-01');
        const prev = docs.get(dk) || {};
        const cmd = {
          id: `cmd-${Date.now()}`,
          type: body.type,
          params: body.params || {},
          issuedAt: new Date().toISOString(),
        };
        if (body.type === 'clear_now') {
          docs.set(boardKey(storeId), {
            storeId,
            businessDate: taipeiDate(),
            seq: nextSeq(storeId),
            updatedAt: new Date().toISOString(),
            source: 'system',
            tickets: [],
            clearedAt: new Date().toISOString(),
          });
        }
        docs.set(dk, { ...prev, pendingCommand: cmd });
        docs.set(commandLogKey(storeId, cmd.id), {
          at: new Date().toISOString(),
          type: body.type,
          deviceId: body.deviceId,
          commandId: cmd.id,
        });
        return json(res, 200, { ok: true, commandId: cmd.id });
      }

      return json(res, 404, { error: 'unknown fn ' + name });
    }

    const docPrefix = `/v1/projects/${PROJECT}/databases/(default)/documents/`;
    if (req.method === 'GET' && url.pathname.startsWith(docPrefix)) {
      if (!requireAuth(req)) return json(res, 401, { error: 'auth' });
      const rel = decodeURIComponent(url.pathname.slice(docPrefix.length)).replace(/\/$/, '');
      const data = docs.get(rel);
      if (data) {
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
    json(res, 500, { error: String(e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake-cloud listening on http://127.0.0.1:${PORT}`);
});
