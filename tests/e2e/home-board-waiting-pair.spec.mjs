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
  SETUP_GATE_TEST_ID,
  formatWaitingPairLine,
  PAIR_RETRY_MIN_MS,
  PAIR_SUCCESS_DEADLINE_MS,
} from '../helpers/waiting-pair-contract.js';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const BIND_KEY = 'milksha:board-bind-record';

function homeBoardUrl(query = '') {
  const q = String(query).replace(/^\?/, '');
  return q ? `${BASE}/?${q}` : `${BASE}/`;
}

async function boardAutoPairCount() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairCount`);
  return (await res.json()).count;
}

async function registerStore(storeId, name) {
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/registerStore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, name }),
  });
}

async function setCloudPairNow(nowMs) {
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairNow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nowMs }),
  });
}

async function openWaitingBoard(browser, query, options = {}) {
  const ctx = await isolatedCloudContext(browser);
  if (options.seedBindRecord) {
    await ctx.addInitScript((record) => {
      localStorage.setItem('milksha:board-bind-record', JSON.stringify(record));
    }, options.seedBindRecord);
  }
  const page = await ctx.newPage();
  if (options.clockIso) {
    await page.clock.install({ time: new Date(options.clockIso) });
  }
  await installBundledCloudRouteShim(page);
  await page.goto(homeBoardUrl(query));
  const waiting = page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`);
  await expect(waiting).toBeVisible({ timeout: 30000 });
  return { ctx, page, waiting };
}

test.describe('home board waiting pair (red)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('item 1: waiting overlay shows centered 店編號 {store}　等待配對中', async ({ browser }) => {
    const { ctx, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await expect(waiting).toContainText(formatWaitingPairLine(QA_WAITING_STORE));
    const box = await waiting.boundingBox();
    const viewport = await waiting.page().viewportSize();
    assertCentered(box, viewport);
    await ctx.close();
  });

  test('item 2: URL store casing preserved in waiting text', async ({ browser }) => {
    const { ctx, waiting } = await openWaitingBoard(browser, 'mode=cloud&store=S999998');
    await expect(waiting).toContainText(formatWaitingPairLine('S999998'));
    await ctx.close();
  });

  test('item 3: waiting text font size is at least board title size', async ({ browser }) => {
    const { ctx, page, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    const sizes = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="board-waiting-pair"]');
      const title = document.querySelector('.milksha-board-title, .milksha-zone__title');
      const overlayPx = overlay ? parseFloat(getComputedStyle(overlay).fontSize) : 0;
      const titlePx = title ? parseFloat(getComputedStyle(title).fontSize) : 0;
      const numVar = getComputedStyle(document.getElementById('board-root') || document.body)
        .getPropertyValue('--milksha-num-font');
      return { overlayPx, titlePx, numVar };
    });
    expect(sizes.overlayPx).toBeGreaterThanOrEqual(sizes.titlePx);
    expect(sizes.overlayPx).toBeGreaterThanOrEqual(parseFloat(sizes.numVar) || 88);
    await ctx.close();
  });

  test('item 4: waiting overlay has no blink or CSS animation', async ({ browser }) => {
    const { ctx, page, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    const anim = await waiting.evaluate((el) => getComputedStyle(el).animationName);
    expect(anim === 'none' || anim === '').toBeTruthy();
    const blink = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="board-waiting-pair"].milksha-blink')),
    );
    expect(blink).toBe(false);
    await ctx.close();
  });

  test('item 5: while waiting hide ready/preparing zones and bind hint', async ({ browser }) => {
    const { ctx, page } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await expect(page.locator('.milksha-zone.ready')).toBeHidden();
    await expect(page.locator('.milksha-zone.preparing')).toBeHidden();
    await expect(page.locator('#milksha-board-bind-hint')).toBeHidden();
    await ctx.close();
  });

  test('item 6: waiting overlay does not cover board title', async ({ browser }) => {
    const { ctx, page, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    const title = page.locator('.milksha-board-title, .milksha-zone__title').first();
    await expect(title).toBeVisible();
    const overlap = await page.evaluate(() => {
      const t = document.querySelector('.milksha-board-title, .milksha-zone__title');
      const w = document.querySelector('[data-testid="board-waiting-pair"]');
      if (!t || !w) return true;
      const a = t.getBoundingClientRect();
      const b = w.getBoundingClientRect();
      const intersect =
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return intersect;
    });
    expect(overlap).toBe(false);
    await ctx.close();
  });

  test('item 7: HTML in store param renders as plain text', async ({ browser }) => {
    const { ctx, waiting } = await openWaitingBoard(
      browser,
      'mode=cloud&store=%3Cb%3Es999998%3C%2Fb%3E',
    );
    await expect(waiting).toContainText('<b>s999998</b>');
    await expect(waiting.locator('b')).toHaveCount(0);
    await ctx.close();
  });

  test('item 8: s999998 waiting line fits one row at 1920 width', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(homeBoardUrl(`mode=cloud&store=${QA_WAITING_STORE}`));
    const waiting = page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`);
    await expect(waiting).toBeVisible({ timeout: 30000 });
    const lines = await waiting.evaluate((el) => {
      const cs = getComputedStyle(el);
      const h = el.getBoundingClientRect().height;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize);
      return h / lh;
    });
    expect(lines).toBeLessThanOrEqual(1.2);
    await ctx.close();
  });

  test('item 9 static: waiting overlay on default board', async ({ browser }) => {
    const { ctx, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await expect(waiting).toBeVisible();
    await ctx.close();
  });

  test('item 9 motion=on: waiting overlay before pair completes', async ({ browser }) => {
    const { ctx, waiting } = await openWaitingBoard(
      browser,
      `motion=on&mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await expect(waiting).toBeVisible();
    await ctx.close();
  });

  test('item 10: retries boardAutoPair no faster than 10s', async ({ browser }) => {
    const baseNow = Date.parse('2026-10-19T08:00:00.000Z');
    await setCloudPairNow(baseNow);
    const { ctx, page } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    const c0 = await boardAutoPairCount();
    await page.clock.fastForward(PAIR_RETRY_MIN_MS - 1);
    await page.waitForTimeout(50);
    expect(await boardAutoPairCount()).toBe(c0);
    await page.clock.fastForward(1);
    await expect
      .poll(async () => boardAutoPairCount(), { timeout: 5000 })
      .toBeGreaterThan(c0);
    await ctx.close();
  });

  test('item 11: register store within 15s completes pairing', async ({ browser }) => {
    const { ctx, page, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await registerStore(QA_WAITING_STORE, '等待配對 QA');
    await expect(page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`)).toBeHidden({
      timeout: PAIR_SUCCESS_DEADLINE_MS,
    });
    await expect
      .poll(async () => page.evaluate((k) => localStorage.getItem(k), BIND_KEY), {
        timeout: PAIR_SUCCESS_DEADLINE_MS,
      })
      .not.toBeNull();
    await ctx.close();
  });

  test('item 12: after success zones visible and no boot error white card', async ({ browser }) => {
    const { ctx, page } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await registerStore(QA_WAITING_STORE, '等待配對 QA');
    await page.waitForFunction(() => Boolean(window.receiverCloud), {
      timeout: PAIR_SUCCESS_DEADLINE_MS,
    });
    await expect(page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`)).toBeHidden();
    await expect(page.locator('.milksha-zone.ready')).toBeVisible();
    await expect(page.locator('.milksha-zone.preparing')).toBeVisible();
    await expect(page.locator('.boot-error-card')).toHaveCount(0);
    await ctx.close();
  });

  test('item 13: after success retry timer stops (pair count stable)', async ({ browser }) => {
    const baseNow = Date.parse('2026-10-19T09:00:00.000Z');
    await setCloudPairNow(baseNow);
    const { ctx, page } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await registerStore(QA_WAITING_STORE, '等待配對 QA');
    await page.waitForFunction(() => Boolean(window.receiverCloud), {
      timeout: PAIR_SUCCESS_DEADLINE_MS,
    });
    const afterSuccess = await boardAutoPairCount();
    await page.clock.fastForward(PAIR_RETRY_MIN_MS * 3);
    expect(await boardAutoPairCount()).toBe(afterSuccess);
    await ctx.close();
  });

  test('item 14: POS reject keeps waiting overlay visible', async ({ browser }) => {
    const { ctx, page, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/posRejectStore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: QA_WAITING_STORE }),
    });
    await page.waitForTimeout(500);
    await expect(waiting).toBeVisible();
    await ctx.close();
  });

  test('item 15: two devices same store both pair successfully', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const pageA = await ctx.newPage();
    const pageB = await ctx.newPage();
    await installBundledCloudRouteShim(pageA);
    await installBundledCloudRouteShim(pageB);
    await pageA.goto(homeBoardUrl(`mode=cloud&store=${QA_WAITING_STORE}&device=stb-wait-a`));
    await pageB.goto(homeBoardUrl(`mode=cloud&store=${QA_WAITING_STORE}&device=stb-wait-b`));
    await registerStore(QA_WAITING_STORE, '雙盒 QA');
    await pageA.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await pageB.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await ctx.close();
  });

  test('item 16: invalid URL store shows 請設定店編號 setup gate', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(homeBoardUrl('store=s0305769'));
    const gate = page.locator(`[data-testid="${SETUP_GATE_TEST_ID}"]`);
    await expect(gate).toBeVisible({ timeout: 15000 });
    await expect(gate).toContainText('請設定店編號');
    await ctx.close();
  });

  test('item 17: cloud invalid_store_format shows setup gate', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(homeBoardUrl('mode=cloud&store=s0305769'));
    const gate = page.locator(`[data-testid="${SETUP_GATE_TEST_ID}"]`);
    await expect(gate).toBeVisible({ timeout: 20000 });
    await expect(gate).toContainText('請設定店編號');
    await ctx.close();
  });

  test('item 18: disabled store shows existing pair failure not waiting overlay', async ({
    browser,
  }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(homeBoardUrl('mode=cloud&store=zz-deny-wait-red'));
    await expect(page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`)).toHaveCount(0);
    await expect(page.locator('.boot-error-card, #milksha-cloud-paused')).toBeVisible({
      timeout: 45000,
    });
    await ctx.close();
  });

  test('item 19: offline shows 離線 not waiting; recovery resumes pair', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(homeBoardUrl(`mode=cloud&store=${QA_WAITING_STORE}`));
    await page.context().setOffline(true);
    await expect(page.locator('#milksha-cloud-offline:not([hidden])')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`)).toHaveCount(0);
    await page.context().setOffline(false);
    await expect(page.locator(`[data-testid="${WAITING_OVERLAY_TEST_ID}"]`)).toBeVisible({
      timeout: 30000,
    });
    await ctx.close();
  });

  test('item 20 e2e: stale a17 bind record cleared when URL is s999998', async ({ browser }) => {
    const { ctx, page } = await openWaitingBoard(browser, `mode=cloud&store=${QA_WAITING_STORE}`, {
      seedBindRecord: {
        storeId: 'a17',
        storeNumber: 'a17',
        storeName: 'stale',
        deviceId: 'dev-old',
      },
    });
    const record = await page.evaluate((k) => localStorage.getItem(k), BIND_KEY);
    expect(record).toBeNull();
    const bodies = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairBodies`).then((r) =>
      r.json(),
    );
    const last = bodies.bodies[bodies.bodies.length - 1];
    expect(last.storeNumber || last.storeId).toBe(QA_WAITING_STORE);
    await ctx.close();
  });

  test('item 21: reload keeps waiting state', async ({ browser }) => {
    const { ctx, page, waiting } = await openWaitingBoard(
      browser,
      `mode=cloud&store=${QA_WAITING_STORE}`,
    );
    await page.reload();
    await expect(waiting).toBeVisible({ timeout: 30000 });
    await ctx.close();
  });
});

function assertCentered(box, viewport) {
  if (!box || !viewport) {
    throw new Error('missing layout boxes');
  }
  const cx = box.x + box.width / 2;
  const mid = viewport.width / 2;
  expect(Math.abs(cx - mid)).toBeLessThan(viewport.width * 0.08);
}
