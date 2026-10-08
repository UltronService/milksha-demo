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

  let zzQaPickerNewOnLive = { found: false, note: 'skipped' };
  try {
    const liveListPath = join(ART, 'live-listStores.json');
    const liveListRaw = readFileSync(liveListPath, 'utf8');
    const liveListJson = JSON.parse(liveListRaw);
    const stores = liveListJson.stores || [];
    zzQaPickerNewOnLive = {
      found: stores.some((s) => s && s.storeId === 'zz-qa-picker-new'),
      storeIds: stores.map((s) => s.storeId),
    };
    writeFileSync(join(ART, 'live-zz-qa-picker-new-check.json'), JSON.stringify(zzQaPickerNewOnLive, null, 2));
  } catch (e) {
    zzQaPickerNewOnLive = { found: false, error: String(e && e.message ? e.message : e) };
  }
  report.items.push({ name: 'live registry contains zz-qa-picker-new (must be false)', ...zzQaPickerNewOnLive });

  if (live.apiKey && !live.apiKey.includes('fake-api')) {
    const livePage = await browser.newPage();
    await livePage.addInitScript((cfg) => {
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: cfg.projectId,
          apiKey: cfg.apiKey,
          region: 'asia-east1',
          useEmulator: false,
          gateway: '',
          emulatorPrefix: '',
        }),
      );
      window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
        apiKey: cfg.apiKey,
        projectId: cfg.projectId,
        functionsBaseUrl: cfg.functionsBaseUrl,
      });
    }, live);
    await livePage.goto(`${BASE}/controller/?mode=cloud&store=c030020`, { waitUntil: 'domcontentloaded' });
    await livePage.evaluate((cfg) => {
      const projectEl = document.getElementById('fld-cloud-project');
      const keyEl = document.getElementById('fld-cloud-apikey');
      if (projectEl) {
        projectEl.value = cfg.projectId;
      }
      if (keyEl) {
        keyEl.value = cfg.apiKey;
      }
      window.MILKSHA_FIREBASE_CONFIG = Object.assign({}, window.MILKSHA_FIREBASE_CONFIG || {}, {
        apiKey: cfg.apiKey,
        projectId: cfg.projectId,
        functionsBaseUrl: cfg.functionsBaseUrl,
      });
    }, live);
    await livePage.waitForSelector('#online-state[data-connected="1"]', { timeout: 90000 });
    await expandControllerZone(livePage, 'sec-connect');
    await livePage.evaluate(() => window.__controller.refreshStoreListFromCloud());
    await livePage.waitForTimeout(1500);
    await livePage.locator('#fld-store').click();
    const liveShot = join(SHOTS, 'live-cloud-store-picker.png');
    await livePage.screenshot({ path: liveShot, fullPage: false });
    report.items.push({
      name: 'live cloud store picker screenshot (read-only c030020)',
      ok: true,
      path: liveShot,
      url: `https://ultronservice.github.io/milksha-demo/controller/?mode=cloud&store=c030020`,
      note: 'Screenshot captured from local static server serving this PR branch with real milksha-qms-dev APIs (read-only c030020).',
    });
    await livePage.close();
  }

  writeFileSync(join(ART, 'report.json'), JSON.stringify(report, null, 2));
  await ctx.close();
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
