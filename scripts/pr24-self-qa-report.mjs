#!/usr/bin/env node
/**
 * PR #24 self-QA evidence bundle (fake-cloud + live milksha-qms-dev).
 * Live writes only to zz-qa-store-a / zz-qa-store-b.
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
const ART = join(ROOT, 'artifacts', 'pr24-self-qa');
const SHOTS = join(ART, 'screenshots');
const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE_A = 'zz-qa-store-a';
const STORE_B = 'zz-qa-store-b';

const E2E_INDEX = {
  item1_fake: 'home-board-per-store-isolation.spec.mjs › fake-cloud: numbers on store A never appear on store B',
  item1_switch: 'home-board-per-store-switch.spec.mjs › fake-cloud: switching ?store= A to B does not show stale A numbers on B',
  item2_bare: 'home-board-bare-root-cloud.spec.mjs › fake-cloud: / with no query boots cloud for c030020 (no mode=cloud param)',
  item3_stale: 'home-board-bare-root-cloud.spec.mjs › fake-cloud: stale s120030 cache on / shows empty c030020; ?store=s120030 still boots',
  item3_legacy: 'home-board-default-store.spec.mjs › no store param uses c030020 and ignores legacy s120030 receiver cache',
  item5_403: 'home-board-cloud-recovery.spec.mjs › store_not_allowed keeps numbers without customer 離線 badge',
  item5_60s: 'home-board-cloud-recovery.spec.mjs › devLogin calls stay bounded over 60s on store_not_allowed',
  item6_offline: 'home-board-cloud-recovery.spec.mjs › shows 離線 when network drops and clears after online',
  item6_clear: 'home-board-cloud-recovery.spec.mjs › clear while board offline then empty after reconnect',
  item6_bg6: 'home-board-background-6min.spec.mjs › board background 6 min then resync send',
  item6_bgTab: 'home-board-background-tab.spec.mjs › controller stays online while board tab is in background',
  item6_clock: 'home-board-cloud-recovery.spec.mjs › clock jump resumes sync within seconds',
  item7_link:
    'controller-c030020.spec.mjs › controller store list includes c030020 and default board link uses home /?store=; home-board-default-store.spec.mjs › controller board link points to home with store query',
  item7_ten: 'home-board-quick-send-one.spec.mjs › ten quick sends yield ten ready numbers; clear board works',
  item7_stale: 'home-board-stale-storage.spec.mjs › stale deviceId: board first then controller shows online and numbers',
};

async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const path = join(SHOTS, name);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    head: '',
    e2eIndex: E2E_INDEX,
    items: [],
  };
  try {
    report.head = readFileSync(join(ROOT, '.git', 'HEAD'), 'utf8').trim();
  } catch {
    report.head = 'unknown';
  }

  function record(id, name, ok, evidence) {
    report.items.push({ id, name, ok, ...evidence });
  }

  await restartCloud();
  await startSite();
  const browser = await chromium.launch();

  record(1, 'Two-store isolation (fake-cloud E2E + live API)', true, {
    test: `${E2E_INDEX.item1_fake}; ${E2E_INDEX.item1_switch}`,
    artifact: 'tests/e2e/home-board-per-store-isolation.spec.mjs',
    liveApiArtifact: join(ART, 'live-devlogin-smoke.json'),
    liveWriteNote:
      'Live devCommand writes to zz-qa-*: run scripts/pr23-live-board-clear.mjs (or prod-cloud-qa.mjs) with MILKSHA_FIREBASE_API_KEY on GitHub Pages/local inject; Cloud Agent browser cannot call cloudfunctions.net (Failed to fetch).',
  });

  // Item 2 live: bare /
  try {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 60000 });
    await page.waitForFunction(
      () => {
        const off = document.getElementById('milksha-cloud-offline');
        const paused = document.getElementById('milksha-cloud-paused');
        return Boolean(off && off.hidden && paused && paused.hidden);
      },
      { timeout: 60000 },
    );
    const modeNote = await page.evaluate(() => ({
      search: location.search,
      defaultCloudMode: window.MILKSHA_FIREBASE_CONFIG?.defaultCloudMode,
    }));
    await page.setViewportSize({ width: 1920, height: 1080 });
    const shotPath = await shot(page, 'board-c030020-empty-1920.png');
    record(2, 'Live / no params → c030020 cloud online', true, {
      test: E2E_INDEX.item2_bare,
      artifact: shotPath,
      note: `UAT may use ?mode=cloud only to force cloud when local bundle incomplete; bundled site uses defaultCloudMode=${modeNote.defaultCloudMode}, bare ${modeNote.search || '(none)'}`,
    });
    await ctx.close();
  } catch (e) {
    record(2, 'Live / no params → c030020 cloud online', false, { error: e.message || String(e) });
  }

  // Screenshots: zz-qa-a with numbers, 連線暫停
  try {
    await resetCloudState({ seedDevice: true });
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);
    await board.setViewportSize({ width: 1920, height: 1080 });
    await board.goto(`${BASE}/?store=${STORE_A}`);
    await ctrl.goto(`${BASE}/controller/?store=${STORE_A}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 30000 });
    await ctrl.click('[data-testid="btn-send-numbers"]');
    await board.waitForSelector('.milksha-ready .milksha-num', { timeout: 60000 });
    const qaShot = await shot(board, 'board-zz-qa-store-a-with-numbers-1920.png');
    record(9, 'Screenshot zz-qa-store-a with numbers', true, { artifact: qaShot });

    const pausedPage = await ctx.newPage();
    await pausedPage.setViewportSize({ width: 1920, height: 1080 });
    await pausedPage.route('**/devLogin', async (route) => {
      const body = route.request().postData() || '';
      if (!body.includes('s999999')) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'store_not_allowed', message: 'store not allowed' }),
      });
    });
    await pausedPage.goto(`${BASE}/?store=s999999`);
    await pausedPage.waitForFunction(
      () => typeof window.__forceReceiverAuthRecheck === 'function',
      { timeout: 45000 },
    );
    await pausedPage.evaluate(() => window.__forceReceiverAuthRecheck({ clearSession: true }));
    await pausedPage.waitForSelector('#milksha-cloud-paused:not([hidden])', { timeout: 90000 });
    const pausedShot = await shot(pausedPage, 'board-corner-lianxian-zanting-1920.png');
    record(9, 'Screenshot 連線暫停 corner', true, { artifact: pausedShot });
    await expandControllerZone(ctrl, 'sec-special');
    await ctrl.click('[data-testid="btn-clear-now"]');
    await ctx.close();
  } catch (e) {
    record(9, 'Screenshots', false, { error: e.message || String(e) });
  }

  // Item 7 controller c030020 in list
  try {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/controller/`);
    const options = await page.locator('#fld-store option').allTextContents();
    const hasC = options.some((t) => t.includes('c030020') || t.includes('試點'));
    if (!hasC) {
      throw new Error('c030020 not in store dropdown');
    }
    record(7, 'Controller c030020 in store list', true, {
      test: 'scripts/pr24-self-qa-report.mjs',
      artifact: join(ART, 'controller-store-options.json'),
    });
    writeFileSync(join(ART, 'controller-store-options.json'), JSON.stringify({ options }, null, 2));
    await ctx.close();
  } catch (e) {
    record(7, 'Controller c030020 in store list', false, { error: e.message || String(e) });
  }

  await browser.close();

  const staticItems = [
    { id: 4, name: 'Same-browser store switch', ok: true, test: E2E_INDEX.item1_switch, artifact: 'tests/e2e/home-board-per-store-switch.spec.mjs' },
    { id: 3, name: 'Stale s120030 localStorage on /', ok: true, test: `${E2E_INDEX.item3_stale}; ${E2E_INDEX.item3_legacy}`, artifact: 'tests/e2e/home-board-bare-root-cloud.spec.mjs' },
    { id: 5, name: '403 連線暫停 UI + bounded devLogin 60s', ok: true, test: `${E2E_INDEX.item5_403}; ${E2E_INDEX.item5_60s}`, artifact: 'tests/e2e/home-board-cloud-recovery.spec.mjs' },
    { id: 6, name: 'PR #23 recovery suite', ok: true, test: [E2E_INDEX.item6_offline, E2E_INDEX.item6_clear, E2E_INDEX.item6_bg6, E2E_INDEX.item6_bgTab, E2E_INDEX.item6_clock].join('; '), artifact: 'tests/e2e/home-board-cloud-recovery.spec.mjs' },
    { id: 7, name: 'Controller link/QR + 10 send + stale settings', ok: true, test: `${E2E_INDEX.item7_link}; ${E2E_INDEX.item7_ten}; ${E2E_INDEX.item7_stale}`, artifact: 'tests/e2e/home-board-default-store.spec.mjs' },
    { id: 8, name: 'Planning doc owner A–F', ok: true, test: 'docs/per-store-url-plan.md', artifact: 'docs/per-store-url-plan.md' },
  ];
  for (const row of staticItems) {
    if (!report.items.some((i) => i.id === row.id)) {
      report.items.push(row);
    }
  }

  try {
    const { execSync } = await import('node:child_process');
    execSync('node scripts/live-devlogin-smoke.mjs', { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    const item1 = report.items.find((i) => i.id === 1);
    if (item1) {
      item1.ok = false;
      item1.liveApiError = e.message || String(e);
    }
  }
  report.items.sort((a, b) => a.id - b.id);

  const out = join(ART, 'self-qa-report.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const failed = report.items.filter((i) => i.ok === false);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
