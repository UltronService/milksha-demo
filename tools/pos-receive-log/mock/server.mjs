import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.POS_RECEIVE_LOG_MOCK_PORT || 3921);

let mode = 'ok';
let extraRecords = [];
let failNext = false;
let forceFail = false;
let lastFeedRequest = { search: '', hasStoreId: false, storeId: null };

export function setMockMode(next) {
  mode = next;
}

export function pushMockRecord(record) {
  extraRecords.push(record);
}

export function setFailNextFetch(shouldFail) {
  failNext = shouldFail;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

import { defaultRecords } from './seed-data.mjs';

const baseRecords = defaultRecords();

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return 200;
  }
  return Math.min(n, 1000);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/__mock/control') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw || '{}');
      if (body.reset) {
        extraRecords = [];
        failNext = false;
        forceFail = false;
        if (body.mode) {
          mode = body.mode;
        } else {
          mode = 'ok';
        }
      }
      if (body.mode && !body.reset) {
        mode = body.mode;
      }
      if (body.failNext) {
        failNext = true;
      }
      if (body.forceFail) {
        forceFail = true;
      }
      if (body.record) {
        extraRecords.push(body.record);
      }
      if (Array.isArray(body.records)) {
        extraRecords.push(...body.records);
      }
    } catch {
      // ignore
    }
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/__mock/last-request') {
    return json(res, 200, lastFeedRequest);
  }

  if (req.method === 'GET' && url.pathname === '/') {
    lastFeedRequest = {
      search: url.search,
      hasStoreId: url.searchParams.has('storeId'),
      storeId: url.searchParams.get('storeId'),
    };
    if (forceFail || failNext) {
      failNext = false;
      return json(res, 500, { error: 'mock failure' });
    }
    if (mode === 'disabled' || mode === '已停用') {
      return json(res, 200, { status: '已停用' });
    }
    const storeId = url.searchParams.get('storeId') || '';
    const limit = parseLimit(url.searchParams.get('limit'));
    const all = [...baseRecords, ...extraRecords].filter((r) => {
      const id = r.storeNumber || r.storeId || '';
      if (storeId && id !== storeId) {
        return false;
      }
      return true;
    });
    all.sort((a, b) => b.receivedAtMs - a.receivedAtMs);
    return json(res, 200, { status: 'ok', records: all.slice(0, limit) });
  }

  json(res, 404, { error: 'not found' });
});

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  server.listen(PORT, '127.0.0.1', () => {
    process.stdout.write(`pos-receive-log mock on http://127.0.0.1:${PORT}\n`);
  });
}

export { server, PORT };
