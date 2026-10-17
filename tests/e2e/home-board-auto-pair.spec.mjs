import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  restartCloud,
  startSite,
  resetCloudState,
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  isolatedCloudContext,
} from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const ART_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'artifacts', 'auto-pair', 'screenshots');

async function boardBindCount() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardBindCount`);
  const json = await res.json();
  return json.count;
}

async function registerStore(storeId, name) {
  await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/registerStore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, name }),
  });
}

async function cloudBoardContext(browser, { clearStorageOnce = false } = {}) {
  const ctx = await browser.newContext();
  if (clearStorageOnce) {
    await ctx.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('__auto_pair_boot')) {
          localStorage.clear();
          sessionStorage.clear();
          sessionStorage.setItem('__auto_pair_boot', '1');
        }
      } catch {
        /* ignore */
      }
    });
  } else {
    await ctx.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });
  }
  return ctx;
}

async function openCloudBoard(browser, storeId, options) {
  const ctx = await cloudBoardContext(browser, options);
  const page = await ctx.newPage();
  await installBundledCloudRouteShim(page);
  await page.goto(`${BASE}/?mode=cloud&store=${storeId}`);
  await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
  await page.waitForFunction(
    () => localStorage.getItem('milksha:board-bind-record') !== null,
    { timeout: 45000 },
  );
  return { ctx, page };
}

test.describe('home board auto-pair', () => {
  test.beforeAll(async () => {
    mkdirSync(ART_DIR, { recursive: true });
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
    await registerStore('zz-qa-store-a', 'QA測試門市A');
    await registerStore('zz-qa-ci-store', 'CI測試門市');
  });

  test('bind uses brand+store+machine without IP; numbers still work', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a');
    const count = await boardBindCount();
    expect(count).toBe(1);
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '1234' }]);
    });
    await expect(page.locator('.milksha-zone.ready .milksha-num').first()).toContainText('1234');
    await ctx.close();
  });

  test('reload does not send second bind', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a', { clearStorageOnce: true });
    expect(await boardBindCount()).toBe(1);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await page.waitForTimeout(1500);
    expect(await boardBindCount()).toBe(1);
    await ctx.close();
  });

  test('bind hint visible with expected format', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a');
    const hint = page.locator('#milksha-board-bind-hint');
    await expect(hint).toBeVisible();
    const text = await hint.innerText();
    expect(text).toMatch(/^已綁定：/);
    expect(text).toContain('QA測試門市A');
    expect(text).toContain('zz-qa-store-a');
    expect(text).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await ctx.close();
  });

  test('hint survives reload; new session hides permanently', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-ci-store', { clearStorageOnce: true });
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    const ctx2 = await isolatedCloudContext(browser);
    const page2 = await ctx2.newPage();
    await installBundledCloudRouteShim(page2);
    const record = await page.evaluate(() => localStorage.getItem('milksha:board-bind-record'));
    await page2.addInitScript((rec) => {
      localStorage.setItem('milksha:board-bind-record', rec);
    }, record);
    await page2.goto(`${BASE}/?mode=cloud&store=zz-qa-ci-store`);
    await page2.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await page2.waitForTimeout(1200);
    await expect(page2.locator('#milksha-board-bind-hint')).toBeHidden();
    await page2.reload();
    await page2.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await expect(page2.locator('#milksha-board-bind-hint')).toBeHidden();
    await ctx.close();
    await ctx2.close();
  });

  test('clear storage rebind shows hint again on first bind', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a');
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await page.waitForFunction(
      () => localStorage.getItem('milksha:board-bind-record') !== null,
      { timeout: 45000 },
    );
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    await ctx.close();
  });

  test('two boards same store both bind and show numbers', async ({ browser }) => {
    const a = await openCloudBoard(browser, 'zz-qa-store-a');
    const b = await openCloudBoard(browser, 'zz-qa-store-a');
    expect(await boardBindCount()).toBe(2);
    await a.page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '5678' }]);
    });
    await b.page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '5678' }]);
    });
    await expect(a.page.locator('.milksha-zone.ready .milksha-num').first()).toContainText('5678');
    await expect(b.page.locator('.milksha-zone.ready .milksha-num').first()).toContainText('5678');
    await a.ctx.close();
    await b.ctx.close();
  });

  test('layout rules 1080p and 4K screenshots', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a');
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '8888' }]);
    });
    for (const size of [{ w: 1920, h: 1080, tag: '1080p' }, { w: 3840, h: 2160, tag: '4k' }]) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.waitForTimeout(300);
      const metrics = await page.evaluate(() => {
        const hint = document.getElementById('milksha-board-bind-hint');
        const canvas = document.getElementById('milksha-board-canvas');
        const num = document.querySelector('.milksha-zone.ready .milksha-num');
        if (!hint || !canvas || !num) {
          return null;
        }
        const hr = hint.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        const nr = num.getBoundingClientRect();
        const cs = getComputedStyle(hint);
        const stage = document.getElementById('board-root');
        const hintFont = parseFloat(getComputedStyle(stage).getPropertyValue('--milksha-bind-hint-font')) || 0;
        const numFont = parseFloat(getComputedStyle(stage).getPropertyValue('--milksha-num-font')) || 0;
        const overlap =
          hr.left < nr.right && hr.right > nr.left && hr.top < nr.bottom && hr.bottom > nr.top;
        return {
          insetRight: cr.right - hr.right,
          insetBottom: cr.bottom - hr.bottom,
          hintFont,
          numFont,
          overlap,
          opacity: cs.opacity,
          bg: cs.backgroundColor,
        };
      });
      expect(metrics).not.toBeNull();
      expect(Math.abs(metrics.insetRight - 16 * (size.w / 1920))).toBeLessThanOrEqual(0);
      expect(Math.abs(metrics.insetBottom - 16 * (size.w / 1920))).toBeLessThanOrEqual(0);
      expect(metrics.overlap).toBe(false);
      expect(metrics.hintFont).toBeGreaterThanOrEqual(14);
      expect(metrics.bg).toBe('rgba(0, 0, 0, 0)');
      await page.screenshot({ path: join(ART_DIR, `bind-hint-${size.tag}.png`) });
    }
    await ctx.close();
  });
});
