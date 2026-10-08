#!/usr/bin/env node
/**
 * Controller UI screenshot with real milksha-qms-dev listStores payload (read-only).
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  restartCloud,
  startSite,
  resetCloudState,
  installBundledCloudRouteShim,
  expandControllerZone,
} from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'artifacts', 'store-picker-self-qa', 'screenshots');
const ART = join(ROOT, 'artifacts', 'store-picker-self-qa');
const BASE = 'http://127.0.0.1:8877';

function loadApiKey() {
  const cfgPath = join(process.env.HOME || '', '.cursor/projects/workspace/uploads/milksha-web-config_188b.txt');
  try {
    const text = readFileSync(cfgPath, 'utf8');
    const m = text.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/m);
    if (m) {
      return m[1].trim();
    }
  } catch {
    /* ignore */
  }
  const fb = readFileSync(join(ROOT, 'config', 'firebase.js'), 'utf8');
  const m2 = fb.match(/apiKey:\s*'([^']+)'/);
  return m2 ? m2[1] : '';
}

async function fetchLiveListStores() {
  const apiKey = loadApiKey();
  const functionsBase = 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/';
  const loginRes = await fetch(`${functionsBase}devLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: 'c030020', role: 'controller', deviceId: 'controller-web' }),
  });
  const loginJson = await loginRes.json();
  const tokenRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: loginJson.customToken, returnSecureToken: true }),
    },
  );
  const tokenJson = await tokenRes.json();
  const idToken = tokenJson.idToken || tokenJson.id_token;
  const listRes = await fetch(`${functionsBase}listStores`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  });
  const listJson = await listRes.json();
  return listJson;
}

async function main() {
  const listJson = await fetchLiveListStores();
  writeFileSync(join(ART, 'live-listStores.json'), JSON.stringify(listJson, null, 2));
  const pickerNew = (listJson.stores || []).some((s) => s && s.storeId === 'zz-qa-picker-new');
  writeFileSync(
    join(ART, 'live-zz-qa-picker-new-check.json'),
    JSON.stringify({ found: pickerNew, storeIds: (listJson.stores || []).map((s) => s.storeId) }, null, 2),
  );

  await restartCloud();
  await startSite();
  await resetCloudState({ seedDevice: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await installBundledCloudRouteShim(page);
  await page.route('**/listStores', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(listJson),
    });
  });
  await page.goto(`${BASE}/controller/?mode=cloud&store=c030020`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 60000 });
  await expandControllerZone(page, 'sec-connect');
  await page.evaluate(() => window.__controller.refreshStoreListFromCloud());
  await page.waitForTimeout(1000);
  await page.locator('#fld-store').click();
  mkdirSync(SHOTS, { recursive: true });
  const out = join(SHOTS, 'live-cloud-store-picker.png');
  await page.screenshot({ path: out, fullPage: false });
  console.log(
    JSON.stringify(
      {
        ok: true,
        path: out,
        publicControllerUrl: 'https://ultronservice.github.io/milksha-demo/controller/?mode=cloud&store=c030020',
        note: 'listStores payload from live milksha-qms-dev (read-only c030020); UI served from this PR branch static site.',
        storeCount: listJson.stores?.length || 0,
        zzQaPickerNewOnLive: pickerNew,
      },
      null,
      2,
    ),
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
