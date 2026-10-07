import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, expandControllerZone } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

test('no store param uses c030020 and ignores legacy s120030 receiver cache', async ({ browser }) => {
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
  await board.waitForFunction(() => Boolean(window.QMS?.runtime), { timeout: 25000 });
  const snapshot = await board.evaluate(() => {
    const runtime = window.QMS?.runtime;
    const snap = runtime?.getSnapshot?.() || { ready: [], preparing: [] };
    return {
      ready: snap.ready.map((x) => x.number || x.no),
      storeFromCloud: window.receiverCloud ? 'booted' : 'none',
    };
  });
  expect(snapshot.ready).not.toContain('9999');
  await board.goto(`${BASE}/?mode=local&store=s120030`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await ctx.close();
});

test('controller board link points to home with store query', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/controller/?store=zz-qa-store-a&mode=cloud`);
  await expandControllerZone(page, 'sec-connect');
  await page.click('[data-testid="btn-gen-board-link"]');
  const url = await page.locator('[data-testid="fld-board-simple-url"]').inputValue();
  expect(url).toMatch(/\?store=zz-qa-store-a/);
  expect(url).not.toContain('receiver-demo');
  expect(url).toMatch(/\/(\?|$)/);
  await ctx.close();
});
