import { test, expect } from '@playwright/test';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const BIND_KEY = 'milksha:board-bind-record';

const OLD_BIND_RECORD = {
  storeId: 'zz-qa-store-a',
  storeNumber: 'zz-qa-store-a',
  storeName: 'QA Store A',
  deviceId: 'dev-old',
  brandId: 'zz-qa',
};

async function expectSetupScreen(page) {
  const gate = page.locator('[data-testid="board-store-setup"]');
  await expect(gate).toBeVisible({ timeout: 15000 });
  await expect(gate).toContainText('請設定店編號');
  await expect(page.locator('#board-root')).toBeHidden();
  await expect(page.locator('.milksha-board-canvas, #milksha-board-canvas')).toHaveCount(0);
}

test.describe('home board store setup gate', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  test('items 1–4: missing, empty, whitespace, invalid store show setup (static)', async ({
    browser,
  }) => {
    const cases = ['/', '/?store=', '/?store=%20', '/?store=abc'];
    for (const path of cases) {
      const ctx = await isolatedCloudContext(browser);
      const page = await ctx.newPage();
      await installBundledCloudRouteShim(page);
      await page.goto(`${BASE}${path}`);
      await expectSetupScreen(page);
      await ctx.close();
    }
  });

  test('item 5: zz-qa-store-a boots board (fake-cloud)', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/?store=zz-qa-store-a`);
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await expect(page.locator('[data-testid="board-store-setup"]')).toBeHidden();
    await expect(page.locator('#board-root')).toBeVisible();
    await ctx.close();
  });

  test('item 8: motion=on invalid store still shows setup only', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/?motion=on&store=abc`);
    await expectSetupScreen(page);
    await ctx.close();
  });

  test('item 8: motion=on zz-qa-store-a boots', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/?motion=on&store=zz-qa-store-a`);
    await page.waitForFunction(() => Boolean(window.QMS?.runtime), { timeout: 25000 });
    await expect(page.locator('[data-testid="board-store-setup"]')).toBeHidden();
    await ctx.close();
  });

  test('items 9–11: old bind record with missing/invalid URL keeps record and shows setup', async ({
    browser,
  }) => {
    const ctx = await isolatedCloudContext(browser);
    await ctx.addInitScript((record) => {
      localStorage.setItem('milksha:board-bind-record', JSON.stringify(record));
    }, OLD_BIND_RECORD);
    const page = await ctx.newPage();
    await installBundledCloudRouteShim(page);
    await page.goto(`${BASE}/`);
    await expectSetupScreen(page);
    const afterMissing = await page.evaluate((key) => localStorage.getItem(key), BIND_KEY);
    expect(afterMissing).toBe(JSON.stringify(OLD_BIND_RECORD));

    await page.goto(`${BASE}/?store=not-a-store`);
    await expectSetupScreen(page);
    const afterInvalid = await page.evaluate((key) => localStorage.getItem(key), BIND_KEY);
    expect(afterInvalid).toBe(JSON.stringify(OLD_BIND_RECORD));
    await ctx.close();
  });

  test('item 14: setup text fits 1920x1080 and small TV viewport (local)', async ({ browser }) => {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
    ];
    for (const vp of viewports) {
      const ctx = await isolatedCloudContext(browser);
      const page = await ctx.newPage();
      await page.setViewportSize(vp);
      await page.goto(`${BASE}/`);
      await expectSetupScreen(page);
      const overflow = await page.evaluate(() => {
        const gate = document.querySelector('[data-testid="board-store-setup"]');
        const p = gate?.querySelector('p');
        if (!gate || !p) {
          return { ok: false };
        }
        const gr = gate.getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        const style = window.getComputedStyle(gate);
        return {
          ok: pr.width <= gr.width + 1 && pr.height <= gr.height + 1,
          fontFamily: style.fontFamily,
          text: p.textContent,
        };
      });
      expect(overflow.ok).toBe(true);
      expect(overflow.text).toBe('請設定店編號');
      expect(overflow.fontFamily.toLowerCase()).toContain('system-ui');
      await ctx.close();
    }
  });

  test('item 12: setup screen makes no cloud or functions network calls', async ({ browser }) => {
    const ctx = await isolatedCloudContext(browser);
    const page = await ctx.newPage();
    const hits = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (
        url.includes('cloudfunctions.net') ||
        url.includes('identitytoolkit.googleapis.com') ||
        url.includes('securetoken.googleapis.com') ||
        url.includes('firestore.googleapis.com') ||
        /127\.0\.0\.1:\d+\/devLogin/.test(url) ||
        /127\.0\.0\.1:\d+\/boardAutoPair/.test(url)
      ) {
        hits.push(url);
      }
      return route.continue();
    });
    await page.goto(`${BASE}/`);
    await expectSetupScreen(page);
    await page.waitForTimeout(1500);
    expect(hits).toEqual([]);
    await ctx.close();
  });
});
