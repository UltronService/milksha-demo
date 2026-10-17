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

const CLOCK_2026_TAIPEI_1429 = '2026-10-17T06:29:45.000Z';
const CLOCK_2025_TAIPEI = '2025-06-15T04:00:00.000Z';
const LONG_STORE_NAME = '北北基桃超長門市名稱驗收用'.repeat(6);

const IP_KEYS = ['clientIp', 'ip', 'externalIp', 'clientIP', 'externalIP'];

async function boardAutoPairCount() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairCount`);
  const json = await res.json();
  return json.count;
}

async function boardAutoPairInitialCount() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairInitialCount`);
  const json = await res.json();
  return json.count;
}

async function boardAutoPairReadCount() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairReadCount`);
  const json = await res.json();
  return json.count;
}

async function boardAutoPairBodiesFromCloud() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairBodies`);
  const json = await res.json();
  return json.bodies || [];
}

async function authBootOrderFromCloud() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/authBootOrder`);
  return res.json();
}

async function devLoginCountFromCloud() {
  const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/devLoginCount`);
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

async function openCloudBoard(browser, storeId, options = {}) {
  const ctx = await cloudBoardContext(browser, options);
  const page = await ctx.newPage();
  if (options.clockIso) {
    await page.clock.install({ time: new Date(options.clockIso) });
  }
  await installBundledCloudRouteShim(page);
  await page.goto(`${BASE}/?mode=cloud&store=${storeId}`);
  if (options.expectBootError) {
    await page.waitForSelector('.boot-error-card', { timeout: 45000 });
    return { ctx, page };
  }
  await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
  if (!options.skipBindRecordWait) {
    await page.waitForFunction(
      () => localStorage.getItem('milksha:board-bind-record') !== null,
      { timeout: 45000 },
    );
  }
  return { ctx, page };
}

function assertNoIpFields(body) {
  for (const key of IP_KEYS) {
    expect(body[key], `unexpected bind field ${key}`).toBeUndefined();
  }
}

function readyPayloadMulti() {
  const rows = [];
  for (let i = 0; i < 8; i += 1) {
    rows.push({ source_type: 'From_Store_OK', number: String(7000 + i) });
  }
  rows.push({ source_type: 'From_FoodPanda_OK', number: '8111' });
  rows.push({ source_type: 'From_UberEat_OK', number: '8222' });
  return rows;
}

async function assertHintDoesNotOverlapBoardChrome(page, designW) {
  const metrics = await page.evaluate(() => {
    const hint = document.getElementById('milksha-board-bind-hint');
    const canvas = document.getElementById('milksha-board-canvas');
    if (!hint || !canvas) {
      return null;
    }
    const hr = hint.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const scale = cr.width / 1920;
    const selectors = [
      '.milksha-ztitle-zh',
      '.milksha-ztitle-en',
      '.milksha-board-icon-slot',
      '.milksha-num',
    ];
    const overlaps = [];
    for (const sel of selectors) {
      const nodes = document.querySelectorAll(sel);
      for (const node of nodes) {
        const r = node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) {
          continue;
        }
        const hit =
          hr.left < r.right && hr.right > r.left && hr.top < r.bottom && hr.bottom > r.top;
        if (hit) {
          overlaps.push(sel);
        }
      }
    }
    const nameEl = hint.querySelector('.milksha-board-bind-hint__name');
    const nameCs = nameEl ? getComputedStyle(nameEl) : null;
    return {
      insetRight: cr.right - hr.right,
      insetBottom: cr.bottom - hr.bottom,
      scale,
      overlaps,
      textOverflow: nameCs ? nameCs.textOverflow : '',
      nameText: nameEl ? nameEl.textContent || '' : '',
      nameScrollGtClient:
        nameEl && nameEl.scrollWidth > nameEl.clientWidth + 0.5,
    };
  });
  expect(metrics).not.toBeNull();
  const insetExpected = 16 * metrics.scale;
  expect(Math.abs(metrics.insetRight - insetExpected)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(metrics.insetBottom - insetExpected)).toBeLessThanOrEqual(0.5);
  expect(metrics.overlaps).toEqual([]);
  return metrics;
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
    await registerStore('zz-qa-long-name', LONG_STORE_NAME);
  });

  test('boot order: boardAutoPair before signIn; login uses pair customToken not devLogin', async ({
    browser,
  }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a', {
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    const boot = await authBootOrderFromCloud();
    const names = boot.events.map((e) => e.name);
    const pairIdx = names.indexOf('boardAutoPair');
    const signInIdx = names.indexOf('signInWithCustomToken');
    expect(pairIdx).toBeGreaterThanOrEqual(0);
    expect(signInIdx).toBeGreaterThan(pairIdx);
    expect(names.indexOf('devLogin')).toBe(-1);
    expect(await devLoginCountFromCloud()).toBe(0);
    const signInEv = boot.events.find((e) => e.name === 'signInWithCustomToken');
    expect(signInEv && signInEv.detail).toBe('pair_token');
    expect(boot.lastBoardAutoPairCustomToken).toBeTruthy();
    await expect(page.locator('.milksha-zone.ready').first()).toBeVisible();
    await ctx.close();
  });

  test('bind uses brand+storeNumber+deviceId without IP; numbers still work', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a', {
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    expect(await boardAutoPairInitialCount()).toBe(1);
    expect(await boardAutoPairReadCount()).toBe(0);
    const bindBodies = await boardAutoPairBodiesFromCloud();
    expect(bindBodies.length).toBeGreaterThanOrEqual(1);
    for (const body of bindBodies) {
      assertNoIpFields(body);
      expect(body.brand).toBe('Milksha');
      expect(body.storeNumber).toBe('zz-qa-store-a');
      expect(body.deviceId).toBeTruthy();
    }
    await page.evaluate(() => {
      window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '1234' }]);
    });
    await expect(page.locator('.milksha-zone.ready .milksha-num').first()).toContainText('1234');
    await ctx.close();
  });

  test('reload uses read path; initial bind only once', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a', {
      clearStorageOnce: true,
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    expect(await boardAutoPairInitialCount()).toBe(1);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await page.clock.fastForward(2000);
    expect(await boardAutoPairInitialCount()).toBe(1);
    expect(await boardAutoPairReadCount()).toBe(1);
    const bodies = await boardAutoPairBodiesFromCloud();
    const readBodies = bodies.filter((b) => b.storeId && !b.brand);
    expect(readBodies.length).toBeGreaterThanOrEqual(1);
    expect(readBodies[0].deviceId).toBeTruthy();
    await ctx.close();
  });

  test('read within 10m may return isFirstBind but hint hidden when hint-ever', async ({ browser }) => {
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/boardAutoPairNow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nowMs: Date.parse(CLOCK_2026_TAIPEI_1429) }),
    });
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-ci-store', {
      clearStorageOnce: true,
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    expect(await boardAutoPairInitialCount()).toBe(1);
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    const record = await page.evaluate(() => localStorage.getItem('milksha:board-bind-record'));
    const ctx2 = await isolatedCloudContext(browser);
    const page2 = await ctx2.newPage();
    await page2.clock.install({ time: new Date(CLOCK_2026_TAIPEI_1429) });
    await installBundledCloudRouteShim(page2);
    await page2.addInitScript((rec) => {
      localStorage.setItem('milksha:board-bind-record', rec);
      localStorage.setItem('milksha:board-bind-hint-ever', '1');
    }, record);
    await page2.goto(`${BASE}/?mode=cloud&store=zz-qa-ci-store`);
    await page2.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await page2.clock.fastForward(1500);
    await expect(page2.locator('#milksha-board-bind-hint')).toBeHidden();
    expect(await boardAutoPairReadCount()).toBe(1);
    await ctx.close();
    await ctx2.close();
  });

  test('ok false shows boot error and does not save bind record', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-not-registered', {
      expectBootError: true,
      skipBindRecordWait: true,
    });
    await expect(page.locator('.boot-error-card')).toContainText('找不到目標叫號機');
    const record = await page.evaluate(() => localStorage.getItem('milksha:board-bind-record'));
    expect(record).toBeNull();
    await expect(page.locator('#milksha-board-bind-hint')).toBeHidden();
    expect(await boardAutoPairCount()).toBe(1);
    await ctx.close();
  });

  test('bind hint clock uses Playwright clock: format, minute tick, no seconds', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a', {
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    const hint = page.locator('#milksha-board-bind-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('2026-10-17 14:29');
    expect(await hint.innerText()).not.toMatch(/:\d{2}:\d{2}/);
    await page.clock.fastForward(12_000);
    await expect(hint).toContainText('14:29');
    await page.clock.fastForward(20_000);
    await expect(hint).toContainText('2026-10-17 14:30');
    await ctx.close();
  });

  test('bind hint omits time when clock year before 2026', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a', {
      clockIso: CLOCK_2025_TAIPEI,
    });
    const hint = page.locator('#milksha-board-bind-hint');
    await expect(hint).toBeVisible();
    const text = await hint.innerText();
    expect(text).toContain('QA測試門市A');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    await ctx.close();
  });

  test('hint survives reload; new session hides permanently without extra initial bind', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-ci-store', {
      clearStorageOnce: true,
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    const initialAfterFirst = await boardAutoPairInitialCount();
    expect(initialAfterFirst).toBe(1);
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    expect(await boardAutoPairInitialCount()).toBe(initialAfterFirst);
    const ctx2 = await isolatedCloudContext(browser);
    const page2 = await ctx2.newPage();
    await page2.clock.install({ time: new Date(CLOCK_2026_TAIPEI_1429) });
    await installBundledCloudRouteShim(page2);
    const stash = await page.evaluate(() => ({
      record: localStorage.getItem('milksha:board-bind-record'),
      hintEver: localStorage.getItem('milksha:board-bind-hint-ever'),
    }));
    await page2.addInitScript((data) => {
      localStorage.setItem('milksha:board-bind-record', data.record);
      if (data.hintEver) {
        localStorage.setItem('milksha:board-bind-hint-ever', data.hintEver);
      }
    }, stash);
    await page2.goto(`${BASE}/?mode=cloud&store=zz-qa-ci-store`);
    await page2.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await page2.clock.fastForward(1500);
    await expect(page2.locator('#milksha-board-bind-hint')).toBeHidden();
    expect(await boardAutoPairInitialCount()).toBe(initialAfterFirst);
    await page2.reload();
    await page2.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 45000 });
    await expect(page2.locator('#milksha-board-bind-hint')).toBeHidden();
    await ctx.close();
    await ctx2.close();
  });

  test('clear storage rebind shows hint again on first bind', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-store-a', {
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    await expect(page.locator('#milksha-board-bind-hint')).toBeVisible();
    const beforeClear = await boardAutoPairInitialCount();
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
    expect(await boardAutoPairInitialCount()).toBe(beforeClear + 1);
    await ctx.close();
  });

  test('two boards same store both show bind hint and numbers', async ({ browser }) => {
    const a = await openCloudBoard(browser, 'zz-qa-store-a', { clockIso: CLOCK_2026_TAIPEI_1429 });
    const b = await openCloudBoard(browser, 'zz-qa-store-a', { clockIso: CLOCK_2026_TAIPEI_1429 });
    expect(await boardAutoPairInitialCount()).toBe(2);
    await expect(a.page.locator('#milksha-board-bind-hint')).toBeVisible();
    await expect(b.page.locator('#milksha-board-bind-hint')).toBeVisible();
    const payload = [{ source_type: 'From_Store_OK', number: '5678' }];
    await a.page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), payload);
    await b.page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), payload);
    await expect(a.page.locator('.milksha-zone.ready .milksha-num').first()).toContainText('5678');
    await expect(b.page.locator('.milksha-zone.ready .milksha-num').first()).toContainText('5678');
    await a.ctx.close();
    await b.ctx.close();
  });

  test('layout long name ellipsis and no overlap 1080p and 4K', async ({ browser }) => {
    const { ctx, page } = await openCloudBoard(browser, 'zz-qa-long-name', {
      clockIso: CLOCK_2026_TAIPEI_1429,
    });
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), readyPayloadMulti());
    for (const size of [{ w: 1920, h: 1080, tag: '1080p' }, { w: 3840, h: 2160, tag: '4k' }]) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.clock.fastForward(300);
      const metrics = await assertHintDoesNotOverlapBoardChrome(page, size.w);
      expect(metrics.textOverflow).toBe('ellipsis');
      expect(metrics.nameScrollGtClient).toBe(true);
      expect(metrics.nameText).toContain('北北基桃');
      const stage = page.locator('#board-root');
      const hintFont = await stage.evaluate((el) =>
        parseFloat(getComputedStyle(el).getPropertyValue('--milksha-bind-hint-font')),
      );
      expect(hintFont).toBeGreaterThanOrEqual(14);
      await page.screenshot({ path: join(ART_DIR, `bind-hint-long-${size.tag}.png`) });
    }
    await ctx.close();
  });
});
