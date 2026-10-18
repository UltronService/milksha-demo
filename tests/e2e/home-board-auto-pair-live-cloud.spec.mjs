/**
 * Real milksha-qms-dev boardAutoPair (zz-qa-ci-store only). Requires deployed boardAutoPair + valid Pages firebase.js.
 */
import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { LIVE_CLOUD_STORE_ID } from './live-cloud-config.mjs';

const STORE = LIVE_CLOUD_STORE_ID;
const BAD_STORE = 'zz-qa-e2e-missing-store';
function boardUrl(store, deviceId) {
  return `${GITHUB_PAGES_BASE}/?mode=cloud&store=${encodeURIComponent(store)}&device=${encodeURIComponent(deviceId)}`;
}

/**
 * @param {import('playwright').BrowserContext} ctx
 */
function trackBoardAutoPairBodies(ctx) {
  const bodies = [];
  ctx.on('request', (req) => {
    const url = req.url();
    if (req.method() === 'POST' && url.includes('/boardAutoPair')) {
      try {
        bodies.push(JSON.parse(req.postData() || '{}'));
      } catch {
        bodies.push({});
      }
    }
  });
  return bodies;
}

test.describe('zz-qa-ci-store live boardAutoPair', () => {
  test.describe.configure({ mode: 'serial' });

  test('first bind shows 已綁定 hint and bind record', async () => {
    const deviceId = `stb-ap-live-${Date.now()}`;
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await installLiveBranchCloudRoutes(ctx);
    const bodies = trackBoardAutoPairBodies(ctx);
    const page = await ctx.newPage();
    await page.goto(boardUrl(STORE, deviceId));
    await page.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 240000 });
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#milksha-board-bind-hint')).toContainText('已綁定');
    const record = await page.evaluate(() => localStorage.getItem('milksha:board-bind-record'));
    expect(record).toBeTruthy();
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    const initial = bodies.find((b) => b.brand && b.storeNumber);
    expect(initial).toBeTruthy();
    expect(initial.deviceId).toBe(deviceId);
    await browser.close();
  });

  test('reload with hint-ever does not show hint again', async () => {
    const deviceId = `stb-ap-reload-${Date.now()}`;
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await installLiveBranchCloudRoutes(ctx);
    const page = await ctx.newPage();
    await page.goto(boardUrl(STORE, deviceId));
    await page.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 240000 });
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible({ timeout: 60000 });
    await page.evaluate(() => {
      sessionStorage.removeItem('milksha:board-bind-hint-session');
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 240000 });
    await expect(page.locator('#milksha-board-bind-hint')).toBeHidden({ timeout: 30000 });
    await browser.close();
  });

  test('unknown store shows boot error and no bind record', async () => {
    const deviceId = 'stb-ap-bad-01';
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await installLiveBranchCloudRoutes(ctx);
    const page = await ctx.newPage();
    await page.goto(boardUrl(BAD_STORE, deviceId));
    await page.waitForSelector('.boot-error-card', { timeout: 240000 });
    await expect(page.locator('.boot-error-card')).toContainText('找不到目標叫號機');
    const record = await page.evaluate(() => localStorage.getItem('milksha:board-bind-record'));
    expect(record).toBeNull();
    await browser.close();
  });

  test('restart uses read path only (storeId + deviceId)', async () => {
    const deviceId = `stb-ap-read-${Date.now()}`;
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await installLiveBranchCloudRoutes(ctx);
    const bodies = trackBoardAutoPairBodies(ctx);
    const page = await ctx.newPage();
    await page.goto(boardUrl(STORE, deviceId));
    await page.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 240000 });
    await page.waitForFunction(
      () => localStorage.getItem('milksha:board-bind-record') !== null,
      undefined,
      { timeout: 60000 },
    );
    const countAfterFirst = bodies.length;
    expect(countAfterFirst).toBeGreaterThanOrEqual(1);
    const hadInitial = bodies.some((b) => b.brand && b.storeNumber);
    expect(hadInitial).toBe(true);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 240000 });
    await page.waitForTimeout(3000);
    const readBodies = bodies.filter((b) => b.storeId && !b.brand && !b.storeNumber);
    expect(readBodies.length).toBeGreaterThanOrEqual(1);
    expect(readBodies[readBodies.length - 1].deviceId).toBe(deviceId);
    expect(readBodies[readBodies.length - 1].storeId).toBeTruthy();
    const initialAfterReload = bodies.filter((b) => b.brand && b.storeNumber);
    expect(initialAfterReload.length).toBe(1);
    await browser.close();
  });
});
