#!/usr/bin/env node
/**
 * Repro / smoke: milksha-qms-dev store a17 — devLogin → push_numbers (2001) → clear_now.
 * Writes only to a17. Requires MILKSHA_FIREBASE_API_KEY (Pages 公開金鑰或 dev 金鑰).
 *
 * Usage:
 *   MILKSHA_FIREBASE_API_KEY='…' node scripts/repro-a17-push-dev.mjs
 *   MILKSHA_QA_STORE=a17 MILKSHA_QA_DEVICE=stb-01 node scripts/repro-a17-push-dev.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'milksha-qms-dev';
const REGION = 'asia-east1';
const FN_BASE = `https://${REGION}-${PROJECT}.cloudfunctions.net/`;
const STORE = String(process.env.MILKSHA_QA_STORE || 'a17').trim();
const DEVICE = String(process.env.MILKSHA_QA_DEVICE || 'stb-01').trim();
const API_KEY = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
const ART = join(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'a17-push-repro');

if (STORE !== 'a17') {
  console.error('Refusing to run: MILKSHA_QA_STORE must be a17 for this repro.');
  process.exit(2);
}

async function devLogin(role, deviceId) {
  const res = await fetch(`${FN_BASE}devLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: STORE, role, deviceId }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function signIn(customToken) {
  if (!API_KEY) {
    throw new Error('MILKSHA_FIREBASE_API_KEY is required');
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

async function devCommand(idToken, body) {
  const res = await fetch(`${FN_BASE}devCommand`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const report = { store: STORE, device: DEVICE, fnBase: FN_BASE, steps: [] };

  const dlDev = await devLogin('device', DEVICE);
  report.steps.push({ step: 'devLogin device', ...dlDev });
  const dlCtrl = await devLogin('controller', 'controller-web');
  report.steps.push({ step: 'devLogin controller', ...dlCtrl });
  if (!dlCtrl.json.customToken) {
    writeFileSync(join(ART, 'dev-cli-report.json'), JSON.stringify(report, null, 2));
    console.error('devLogin controller failed', dlCtrl);
    process.exit(1);
  }

  const ctrlToken = await signIn(dlCtrl.json.customToken);
  const pushBody = {
    storeId: STORE,
    deviceId: DEVICE,
    type: 'push_numbers',
    params: {
      ready: [{ no: '2001', sourceType: 'From_Store_OK' }],
      preparing: [],
    },
  };
  const push = await devCommand(ctrlToken, pushBody);
  report.steps.push({ step: 'push_numbers', body: pushBody, ...push });

  const clear = await devCommand(ctrlToken, {
    storeId: STORE,
    deviceId: DEVICE,
    type: 'clear_now',
    params: {},
  });
  report.steps.push({ step: 'clear_now', ...clear });

  writeFileSync(join(ART, 'dev-cli-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (push.status !== 200 || clear.status !== 200) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
