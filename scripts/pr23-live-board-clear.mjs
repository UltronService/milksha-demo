#!/usr/bin/env node
/**
 * Live zz-qa-* board: send -> block cloud -> clear_now -> unblock -> empty board.
 * Env: MILKSHA_FIREBASE_API_KEY (required), MILKSHA_QA_STORE (default zz-qa-agent)
 */
import { chromium } from 'playwright';
import { startSite } from '../tests/e2e/harness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const ART = '/opt/cursor/artifacts/pr23-qa';
mkdirSync(ART, { recursive: true });

const STORE = process.env.MILKSHA_QA_STORE || 'zz-qa-agent';
const DEVICE = process.env.MILKSHA_QA_DEVICE || 'stb-01';
const API_KEY = process.env.MILKSHA_FIREBASE_API_KEY || '';
const BASE = process.env.MILKSHA_PAGES_BASE || 'http://127.0.0.1:8877';

async function devLogin(role, deviceId) {
  const res = await fetch(
    'https://asia-east1-milksha-qms-dev.cloudfunctions.net/devLogin',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: STORE, role, deviceId }),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error('devLogin ' + res.status);
  }
  return json.customToken;
}

async function signIn(token) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error('signIn ' + res.status);
  }
  return json.idToken;
}

async function devCommand(idToken, body) {
  const res = await fetch('https://asia-east1-milksha-qms-dev.cloudfunctions.net/devCommand', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + idToken,
    },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function main() {
  await startSite();
  if (!API_KEY) {
    const cfgPath =
      process.env.MILKSHA_WEB_CONFIG ||
      '/home/ubuntu/.cursor/projects/workspace/uploads/milksha-web-config_70dd.txt';
    const text = readFileSync(cfgPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/);
      if (m) {
        process.env.MILKSHA_FIREBASE_API_KEY = m[1].trim();
      }
    }
  }
  if (!process.env.MILKSHA_FIREBASE_API_KEY) {
    throw new Error('MILKSHA_FIREBASE_API_KEY required');
  }

  const ctrlToken = await signIn(await devLogin('controller', 'controller-web'));
  const apiKey = process.env.MILKSHA_FIREBASE_API_KEY;
  const boardUrl = `${BASE}/?store=${STORE}&device=${DEVICE}`;
  const ctrlUrl = `${BASE}/controller/?store=${STORE}`;

  const browser = await chromium.launch();
  const boardCtx = await browser.newContext();
  const ctrlCtx = await browser.newContext();
  const initApiKey = (key) => {
    window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
      apiKey: key,
      projectId: 'milksha-qms-dev',
      defaultCloudMode: true,
    });
    localStorage.setItem(
      'milksha:cloud-settings',
      JSON.stringify({
        projectId: 'milksha-qms-dev',
        apiKey: key,
        region: 'asia-east1',
        useEmulator: false,
        gateway: '',
      }),
    );
  };
  await boardCtx.addInitScript(initApiKey, apiKey);
  await ctrlCtx.addInitScript(initApiKey, apiKey);
  const board = await boardCtx.newPage();
  const controller = await ctrlCtx.newPage();
  await board.goto(boardUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await controller.goto(ctrlUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 90000 });
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });

  const testNo = '88' + String(Date.now()).slice(-2);
  const st = await devCommand(ctrlToken, {
    storeId: STORE,
    deviceId: DEVICE,
    type: 'push_numbers',
    params: { ready: [testNo], preparing: [] },
  });
  if (st !== 200) {
    throw new Error('push failed ' + st);
  }
  await board.waitForSelector(`.milksha-ready .milksha-num:has-text("${testNo}")`, {
    timeout: 45000,
  });

  await board.route('https://firestore.googleapis.com/**', (r) => r.abort('failed'));
  await board.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', (r) =>
    r.abort('failed'),
  );
  await board.waitForTimeout(3000);
  const clearSt = await devCommand(ctrlToken, {
    storeId: STORE,
    deviceId: DEVICE,
    type: 'clear_now',
    params: {},
  });
  if (clearSt !== 200) {
    throw new Error('clear failed ' + clearSt);
  }
  await board.unroute('https://firestore.googleapis.com/**');
  await board.unroute('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**');
  await board.evaluate(() => window.receiverCloud.scheduleCloudResync('live-qa'));
  await board.waitForFunction(
    () => document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    { timeout: 45000 },
  );
  await devCommand(ctrlToken, {
    storeId: STORE,
    deviceId: DEVICE,
    type: 'clear_now',
    params: {},
  });

  const out = {
    store: STORE,
    testNo,
    ok: true,
    at: new Date().toISOString(),
  };
  writeFileSync(join(ART, 'live-clear-sync.json'), JSON.stringify(out, null, 2));
  await board.screenshot({ path: join(ART, 'live-clear-empty.png') });
  await browser.close();
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
