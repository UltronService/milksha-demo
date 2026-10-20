import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.POS_RECEIVE_LOG_MOCK_PORT || 3921);

let mode = 'ok';
let extraRecords = [];
let failNext = false;
let forceFail = false;

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

  if (req.method === 'GET' && url.pathname === '/pos-receive-logs') {
    if (forceFail || failNext) {
      failNext = false;
      return json(res, 500, { error: 'mock failure' });
    }
    if (mode === 'disabled') {
      return json(res, 200, { status: 'disabled' });
    }
    const storeNumber = url.searchParams.get('storeNumber') || '';
    const fromMs = Number(url.searchParams.get('fromMs') || 0);
    const toMs = Number(url.searchParams.get('toMs') || Number.MAX_SAFE_INTEGER);
    const all = [...baseRecords, ...extraRecords].filter((r) => {
      if (storeNumber && r.storeNumber !== storeNumber) {
        return false;
      }
      if (r.receivedAtMs < fromMs || r.receivedAtMs > toMs) {
        return false;
      }
      return true;
    });
    return json(res, 200, { status: 'ok', records: all });
  }

  json(res, 404, { error: 'not found' });
});

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  server.listen(PORT, '127.0.0.1', () => {
    process.stdout.write(`pos-receive-log mock on http://127.0.0.1:${PORT}\n`);
  });
}

export { server, PORT };
