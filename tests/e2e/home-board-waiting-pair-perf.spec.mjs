import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from './harness.mjs';
import {
  QA_WAITING_STORE,
  WAITING_OVERLAY_TEST_ID,
  PAIR_RETRY_MIN_MS,
  PAIR_SUCCESS_DEADLINE_MS,
} from '../helpers/waiting-pair-contract.js';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

function homeBoardUrl(query = '') {
  const q = String(query).replace(/^\?/, '');
  return q ? `${BASE}/?${q}` : `${BASE}/`;
}

async function registerStore(storeId, name) {
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/registerStore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, name }),
  });
}

test.describe('home board waiting pair perf (red, CPU 1/4)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('item 22: ~1h waiting retries without timer leak (simulated clock)', async ({ browser }) => {
    test.slow();
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__MILKSHA_TEST_CPU_THROTTLE = 4;
    });
    await page.clock.install({ time: new Date('2026-10-19T10:00:00.000Z') });
    await installBundledCloudRouteShim(page);
    await page.goto(homeBoardUrl(`mode=cloud&store=${QA_WAITING_STORE}`));
    await expect(page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`)).toBeVisible({
      timeout: 30000,
    });
    const before = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
    await page.clock.fastForward(PAIR_RETRY_MIN_MS * 360);
    const after = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
    const deltaMb = (after - before) / (1024 * 1024);
    const timers = await page.evaluate(() => window.__milkshaWaitingPairActiveTimers || 0);
    expect(timers).toBeLessThanOrEqual(1);
    expect(deltaMb).toBeLessThanOrEqual(5);
    await ctx.close();
  });

  test('item 23: after pair shows buffered numbers up to 500 without leak', async ({ browser }) => {
    test.slow();
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__MILKSHA_TEST_CPU_THROTTLE = 4;
    });
    await installBundledCloudRouteShim(page);
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/seedBoardNumbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: QA_WAITING_STORE, count: 500 }),
    });
    await page.goto(homeBoardUrl(`mode=cloud&store=${QA_WAITING_STORE}`));
    await registerStore(QA_WAITING_STORE, 'buffer QA');
    await page.waitForFunction(() => Boolean(window.receiverCloud), {
      timeout: PAIR_SUCCESS_DEADLINE_MS,
    });
    const snapshot = await page.evaluate(() => {
      const snap = window.QMS?.runtime?.getSnapshot?.() || { ready: [], preparing: [] };
      return {
        total: snap.ready.length + snap.preparing.length,
        unique: new Set([...snap.ready, ...snap.preparing].map((x) => x.number || x.no)).size,
      };
    });
    expect(snapshot.total).toBe(500);
    expect(snapshot.unique).toBe(500);
    const heapMb =
      (await page.evaluate(() => performance.memory?.usedJSHeapSize || 0)) / (1024 * 1024);
    expect(heapMb).toBeLessThanOrEqual(200);
    await ctx.close();
  });

  test('item 24 motion=on: first paired numbers skip enter animation and stay page 1', async ({
    browser,
  }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/seedBoardNumbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: QA_WAITING_STORE, count: 3 }),
    });
    await page.goto(homeBoardUrl(`motion=on&mode=cloud&store=${QA_WAITING_STORE}`));
    await registerStore(QA_WAITING_STORE, 'motion QA');
    await page.waitForFunction(() => Boolean(window.receiverCloud), {
      timeout: PAIR_SUCCESS_DEADLINE_MS,
    });
    const motion = await page.evaluate(() => ({
      skippedEnter: window.__milkshaBoardSkippedInitialEnterAnim === true,
      pageIndex: window.QMS?.Board?.Anim?.getPageIndex?.() ?? 0,
      animating: document.querySelector('.milksha-board-cell--enter') !== null,
    }));
    expect(motion.skippedEnter).toBe(true);
    expect(motion.pageIndex).toBe(0);
    expect(motion.animating).toBe(false);
    await ctx.close();
  });
});
