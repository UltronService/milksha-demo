import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';

const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';

function median(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

test.describe('zz-qa-store-a live cloud with branch site route', () => {
  test.describe.configure({ retries: 2 });

  test('five sends within 3s and board animates', async () => {
    test.setTimeout(360000);
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    ctx.setDefaultTimeout(180000);
    await installLiveBranchCloudRoutes(ctx);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${STORE}`);
    await board.goto(`${GITHUB_PAGES_BASE}/?mode=cloud&store=${STORE}&device=${DEVICE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 180000 });
    await ctrlNav;
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
    const times = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      await ctrl.click('[data-testid="btn-send-numbers"]');
      await board.waitForFunction(
        (n) => document.querySelectorAll('.milksha-ready .milksha-num').length >= n,
        i + 1,
        { timeout: 3000 },
      );
      times.push(Date.now() - t0);
      await board.waitForTimeout(150);
    }
    expect(median(times)).toBeLessThan(3000);
    expect(Math.max(...times)).toBeLessThan(5000);
    await board.waitForFunction(
      () =>
        [...document.querySelectorAll('.milksha-board-chip')].every((el) => {
          const o = getComputedStyle(el).opacity;
          return o === '1' || o === '';
        }),
      { timeout: 15000 },
    );
    await browser.close();
  });
});
