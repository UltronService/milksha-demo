#!/usr/bin/env node
/**
 * Self-QA against deployed milksha-qms-dev (no fake-cloud).
 * Requires: MILKSHA_FIREBASE_API_KEY
 * Optional: MILKSHA_QA_STORE (default zz-qa-agent), MILKSHA_QA_DEVICE (default stb-01)
 */
const PROJECT = 'milksha-qms-dev';
const REGION = 'asia-east1';
const FN_BASE = `https://${REGION}-${PROJECT}.cloudfunctions.net/`;
const STORE = String(process.env.MILKSHA_QA_STORE || 'zz-qa-agent').trim();
const DEVICE = String(process.env.MILKSHA_QA_DEVICE || 'stb-01').trim();
const API_KEY = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();

function percentile(sorted, p) {
  if (!sorted.length) {
    return 0;
  }
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function devLogin(role, deviceId) {
  const res = await fetch(`${FN_BASE}devLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: STORE, role, deviceId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`devLogin ${role} ${res.status} ${JSON.stringify(json)}`);
  }
  return json.customToken;
}

async function signIn(customToken) {
  if (!API_KEY) {
    throw new Error('MILKSHA_FIREBASE_API_KEY is required for signInWithCustomToken');
  }
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`signIn ${res.status} ${JSON.stringify(json)}`);
  }
  return json.idToken;
}

async function boxHeartbeat(idToken) {
  const res = await fetch(`${FN_BASE}boxHeartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      storeId: STORE,
      deviceId: DEVICE,
      appVersion: 'prod-qa-script',
      boardSeq: 0,
      pendingUploads: 0,
      simulatedOffline: false,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`boxHeartbeat ${res.status} ${JSON.stringify(json)}`);
  }
}

async function devCommand(idToken, body) {
  const t0 = Date.now();
  const res = await fetch(`${FN_BASE}devCommand`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  const ms = Date.now() - t0;
  return { status: res.status, json, ms };
}

async function readBoard(idToken) {
  const path = `stores/${STORE}/board/today_board`;
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`readBoard ${res.status} ${JSON.stringify(json)}`);
  }
  const fields = json.fields || {};
  const tickets = fields.tickets?.arrayValue?.values || [];
  const nums = tickets
    .map((v) => v.mapValue?.fields?.no?.stringValue)
    .filter(Boolean);
  const seq = fields.seq?.integerValue ? Number(fields.seq.integerValue) : 0;
  return { nums, seq };
}

async function main() {
  console.log(JSON.stringify({ store: STORE, device: DEVICE, fnBase: FN_BASE }, null, 2));

  const deviceToken = await signIn(await devLogin('device', DEVICE));
  await boxHeartbeat(deviceToken);

  const ctrlToken = await signIn(await devLogin('controller', 'controller-web'));

  const sendLatencies = [];
  const readLatencies = [];
  const RUNS = 10;
  const testNo = `9${String(Date.now()).slice(-3)}`;

  for (let i = 0; i < RUNS; i += 1) {
    const no = String(Number(testNo) + i);
    const send = await devCommand(ctrlToken, {
      storeId: STORE,
      deviceId: DEVICE,
      type: 'push_numbers',
      params: { ready: [no], preparing: [] },
    });
    if (send.status !== 200) {
      console.error('devCommand failed', send);
      process.exit(1);
    }
    sendLatencies.push(send.ms);

    const tRead = Date.now();
    let found = false;
    for (let poll = 0; poll < 30; poll += 1) {
      const board = await readBoard(ctrlToken);
      if (board.nums.includes(no)) {
        readLatencies.push(Date.now() - tRead);
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!found) {
      console.error('board did not show number', no);
      process.exit(1);
    }
  }

  sendLatencies.sort((a, b) => a - b);
  readLatencies.sort((a, b) => a - b);
  const summary = {
    sendMs: {
      p50: percentile(sendLatencies, 50),
      max: sendLatencies[sendLatencies.length - 1],
      samples: sendLatencies,
    },
    boardReadableMs: {
      p50: percentile(readLatencies, 50),
      max: readLatencies[readLatencies.length - 1],
      samples: readLatencies,
    },
  };
  console.log(JSON.stringify(summary, null, 2));

  const clear = await devCommand(ctrlToken, {
    storeId: STORE,
    deviceId: DEVICE,
    type: 'clear_now',
    params: {},
  });
  if (clear.status !== 200) {
    console.error('clear_now failed', clear);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
