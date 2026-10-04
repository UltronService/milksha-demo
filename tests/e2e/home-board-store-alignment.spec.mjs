import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, waitForReceiverOnline } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

const WRONG_STORE_SEED = () => {
  localStorage.setItem(
    'milksha:local:device:s110012:stb-01',
    JSON.stringify({ online: true, lastSeen: new Date().toISOString() }),
  );
  localStorage.removeItem('milksha:local:poc-target');
};

test('wrong-store heartbeat: controller shows hint until board realigns', async ({ browser }) => {
  const ctx = await freshContext(browser);
  await ctx.addInitScript(WRONG_STORE_SEED);
  const controller = await ctx.newPage();
  await controller.goto(`${BASE}/controller/`);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await expect(controller.locator('#online-state')).toContainText('看板頁面是舊版或店號不同', {
    timeout: 8000,
  });

  const board = await ctx.newPage();
  await board.goto(`${BASE}/?store=s110012&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await waitForReceiverOnline(board, 'local');

  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 15000 });

  const deviceDoc = await board.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('milksha:local:device:s120030:stb-01') || 'null');
    } catch {
      return null;
    }
  });
  expect(deviceDoc && deviceDoc.online).toBe(true);

  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 5000 });
  await ctx.close();
});

test('board already open on wrong store realigns when controller connects', async ({ browser }) => {
  const ctx = await freshContext(browser);
  await ctx.addInitScript(WRONG_STORE_SEED);
  const board = await ctx.newPage();
  await board.goto(`${BASE}/?store=s110012&device=stb-01`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });

  const controller = await ctx.newPage();
  await controller.goto(`${BASE}/controller/`);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 15000 });

  const hbKey = await board.evaluate(() => {
    const good = localStorage.getItem('milksha:local:device:s120030:stb-01');
    return Boolean(good);
  });
  expect(hbKey).toBe(true);
  await ctx.close();
});
