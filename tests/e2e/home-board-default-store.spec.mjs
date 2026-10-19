import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, expandControllerZone } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test('no store param shows setup screen and ignores legacy s120030 receiver cache', async ({
  browser,
}) => {
  const ctx = await freshContext(browser);
  await ctx.addInitScript(() => {
    localStorage.setItem(
      'milksha:receiver-cache:s120030',
      JSON.stringify({
        seq: 99,
        numberContent: [{ source_type: 'From_Store_OK', number: '9999' }],
        businessDate: '2099-01-01',
        boardUpdatedAt: new Date().toISOString(),
      }),
    );
    localStorage.setItem(
      'milksha:local:poc-target',
      JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', at: Date.now() }),
    );
  });
  const board = await ctx.newPage();
  await board.goto(`${BASE}/?mode=local`);
  await expect(board.locator('[data-testid="board-store-setup"]')).toBeVisible({ timeout: 15000 });
  await expect(board.locator('#board-root')).toBeHidden();
  expect(await board.evaluate(() => Boolean(window.receiverCloud))).toBe(false);
  await board.goto(`${BASE}/?mode=local&store=s120030`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await ctx.close();
});

test('controller board link points to home with store query', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/controller/?store=zz-qa-store-a&mode=cloud`);
  await expandControllerZone(page, 'sec-connect');
  await page.waitForFunction(
    () => document.getElementById('fld-store')?.value === 'zz-qa-store-a',
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
    const project = document.getElementById('fld-cloud-project');
    const apiKey = document.getElementById('fld-cloud-apikey');
    if (project && cfg.projectId) {
      project.value = cfg.projectId;
    }
    if (apiKey && cfg.apiKey) {
      apiKey.value = cfg.apiKey;
    }
    const block = document.getElementById('board-link-block');
    if (block) {
      block.hidden = false;
    }
    document.getElementById('btn-gen-board-link')?.click();
  });
  const url = await page.locator('[data-testid="fld-board-simple-url"]').inputValue();
  expect(url).toMatch(/\?store=zz-qa-store-a/);
  expect(url).not.toContain('receiver-demo');
  expect(url).toMatch(/\/(\?|$)/);
  await ctx.close();
});
