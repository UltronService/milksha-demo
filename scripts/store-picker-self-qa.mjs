#!/usr/bin/env node
/**
 * Store picker self-QA: fake-cloud screenshots + optional live listStores read.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
  expandControllerZone,
} from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'store-picker-self-qa');
const SHOTS = join(ART, 'screenshots');
const BASE = `http://127.0.0.1:${PORT_SITE}`;

function loadPublicConfig() {
  const cfgPath = join(ROOT, 'config', 'firebase.js');
  const text = readFileSync(cfgPath, 'utf8');
  const m = text.match(/apiKey:\s*'([^']+)'/);
  const project = text.match(/projectId:\s*'([^']+)'/);
  return {
    apiKey: process.env.MILKSHA_FIREBASE_API_KEY || (m ? m[1] : ''),
    projectId: process.env.MILKSHA_PROJECT_ID || (project ? project[1] : 'milksha-qms-dev'),
    functionsBaseUrl:
      process.env.MILKSHA_FUNCTIONS_BASE || 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/',
  };
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const report = { at: new Date().toISOString(), head: '', items: [] };
  try {
    report.head = readFileSync(join(ROOT, '.git', 'HEAD'), 'utf8').trim();
  } catch {
    report.head = 'unknown';
  }

  await restartCloud();
  await startSite();
  const browser = await chromium.launch();

  const ctx = await isolatedCloudContext(browser);
  const board = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await board.goto(`${BASE}/?mode=cloud&store=zz-qa-store-a`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });

  const boardB = await ctx.newPage();
  await installBundledCloudRouteShim(boardB);
  await boardB.goto(`${BASE}/?mode=cloud&store=c030020`);
  await boardB.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });

  const controller = await ctx.newPage();
  await installBundledCloudRouteShim(controller);
  await controller.goto(`${BASE}/controller/?mode=cloud&store=c030020`);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
  await expandControllerZone(controller, 'sec-connect');
  await controller.evaluate(() => window.__controller.refreshStoreListFromCloud());
  await controller.waitForTimeout(500);
  const menuOpen = join(SHOTS, 'store-picker-online-offline.png');
  await controller.locator('#fld-store').click();
  await controller.screenshot({ path: menuOpen, fullPage: false });

  await controller.route('**/listStores', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"unauthorized"}' });
  });
  await controller.evaluate(() => window.__controller.refreshStoreListFromCloud());
  const errShot = join(SHOTS, 'store-list-error-hint.png');
  await controller.screenshot({ path: errShot, fullPage: false });

  report.items.push({
    name: 'fake-cloud menu screenshot',
    ok: true,
    path: menuOpen,
  });
  report.items.push({
    name: 'fake-cloud list error screenshot',
    ok: true,
    path: errShot,
  });

  const live = loadPublicConfig();
  const uploadCfg = join(process.env.HOME || '', '.cursor/projects/workspace/uploads/milksha-web-config_188b.txt');
  try {
    const envText = readFileSync(uploadCfg, 'utf8');
    for (const line of envText.split('\n')) {
      const m = line.match(/^MILKSHA_FIREBASE_API_KEY=(.+)$/);
      if (m) {
        live.apiKey = m[1].trim();
      }
    }
  } catch {
    /* ignore */
  }
  let liveList = { ok: false, note: 'skipped' };
  if (live.apiKey && !live.apiKey.includes('fake-api')) {
    try {
      const loginRes = await fetch(`${live.functionsBaseUrl}devLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: 'c030020', role: 'controller', deviceId: 'controller-web' }),
      });
      const loginJson = await loginRes.json();
      const tokenRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${live.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: loginJson.customToken, returnSecureToken: true }),
        },
      );
      const tokenJson = await tokenRes.json();
      const listRes = await fetch(`${live.functionsBaseUrl}listStores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenJson.idToken}`,
        },
      });
      const listJson = await listRes.json();
      liveList = { ok: listRes.ok, status: listRes.status, storeCount: listJson.stores?.length || 0 };
      writeFileSync(join(ART, 'live-listStores.json'), JSON.stringify(listJson, null, 2));
    } catch (e) {
      liveList = { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }
  report.items.push({ name: 'live listStores read-only', ...liveList });

  let liveUnregistered = { ok: false, note: 'skipped' };
  if (live.apiKey && !live.apiKey.includes('fake-api')) {
    try {
      const loginRes = await fetch(`${live.functionsBaseUrl}devLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: 'zz-deny-test',
          role: 'controller',
          deviceId: 'controller-web',
        }),
      });
      const loginJson = await loginRes.json();
      liveUnregistered = {
        ok: loginRes.status === 403 && loginJson.code === 'store_not_allowed',
        status: loginRes.status,
        code: loginJson.code,
      };
      writeFileSync(join(ART, 'live-unregistered-devlogin.json'), JSON.stringify(loginJson, null, 2));
    } catch (e) {
      liveUnregistered = { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }
  report.items.push({ name: 'live unregistered store devLogin 403 (no board)', ...liveUnregistered });

  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  await ctx.close();
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
