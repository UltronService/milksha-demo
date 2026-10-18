import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { join } from 'node:path';
import {
  installPr101SiteRoute,
  sampleControllerDbg,
  PR101_STORE,
  PR101_DEVICE,
} from '../../artifacts/pr101-diag/pr101-diag-lib.mjs';
import { GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { teardownLiveCloudSession } from './live-cloud-teardown.mjs';

const STORE = PR101_STORE;

/** @type {import('playwright').Browser | undefined} */
let browser;
/** @type {import('@playwright/test').BrowserContext | undefined} */
let ctx;
/** @type {import('@playwright/test').Page | undefined} */
let board;
/** @type {import('@playwright/test').Page | undefined} */
let ctrl;

test.afterEach(async () => {
  try {
    if (ctx) {
      await ctx.setOffline(false);
    }
    await teardownLiveCloudSession(ctrl, board);
  } finally {
    if (browser) {
      await browser.close();
    }
    browser = undefined;
    ctx = undefined;
    board = undefined;
    ctrl = undefined;
  }
});

test.describe('PR101 zz-qa-store-a realtime disconnect banner (live cloud)', () => {
  test('browser offline 30s shows 即時同步中斷 banner', async () => {
    test.setTimeout(300000);
    if (STORE !== 'zz-qa-store-a') {
      throw new Error('Refusing store other than zz-qa-store-a');
    }

    browser = await chromium.launch();
    ctx = await browser.newContext();
    ctx.setDefaultTimeout(180000);
    await installPr101SiteRoute(ctx, join(process.cwd()));

    board = await ctx.newPage();
    ctrl = await ctx.newPage();

    await board.goto(
      `${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${PR101_DEVICE}`,
    );
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
    await sampleControllerDbg(ctrl);

    await ctx.setOffline(true);
    const deadline = Date.now() + 30000;
    let last = null;
    while (Date.now() < deadline) {
      last = await sampleControllerDbg(ctrl);
      if (!last.bannerHidden && /即時同步中斷/.test(last.bannerText || '')) {
        break;
      }
      await ctrl.waitForTimeout(2000);
    }
    await ctx.setOffline(false);

    expect(last, 'offline banner samples').toBeTruthy();
    expect(last.bannerHidden, JSON.stringify(last)).toBe(false);
    expect(last.bannerText || '').toMatch(/即時同步中斷/);
  });
});
