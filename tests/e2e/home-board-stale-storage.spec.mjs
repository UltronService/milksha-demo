import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, waitForReceiverOnline } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STALE_SEED = () => {
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
  localStorage.setItem(
    'milksha:cloud-settings',
    JSON.stringify({
      projectId: 'milksha-qms-dev',
      apiKey: 'old-key',
      accessCode: 'old-code',
      region: 'asia-east1',
    }),
  );
  localStorage.setItem(
    'milksha:local:device:c030020:stb-old-99',
    JSON.stringify({ online: true, lastSeen: new Date().toISOString() }),
  );
};

async function assertPocFlow(board, controller) {
  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 5000 });
  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 5000 });
  const deviceDoc = await board.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('milksha:local:device:c030020:stb-01') || 'null');
    } catch {
      return null;
    }
  });
  expect(deviceDoc && deviceDoc.online).toBe(true);
}

test('stale deviceId: board first then controller shows online and numbers', async ({ browser }) => {
  const ctx = await freshContext(browser);
  await ctx.addInitScript(STALE_SEED);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  await board.goto(`${BASE}/?mode=local`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await waitForReceiverOnline(board, 'local');
  await controller.goto(`${BASE}/controller/?mode=local`);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 5000 });
  await assertPocFlow(board, controller);
  await ctx.close();
});

test('stale deviceId: controller first then board shows online and numbers', async ({ browser }) => {
  const ctx = await freshContext(browser);
  await ctx.addInitScript(STALE_SEED);
  const controller = await ctx.newPage();
  const board = await ctx.newPage();
  await controller.goto(`${BASE}/controller/?mode=local`);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await board.goto(`${BASE}/?mode=local`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await waitForReceiverOnline(board, 'local');
  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 5000 });
  await assertPocFlow(board, controller);
  await ctx.close();
});

test('stale cloud settings without mode query still boots home local link', async ({ browser }) => {
  const ctx = await freshContext(browser);
  await ctx.addInitScript(() => {
    localStorage.setItem(
      'milksha:cloud-settings',
      JSON.stringify({
        projectId: 'bad',
        apiKey: 'x',
        accessCode: 'y',
        region: 'asia-east1',
      }),
    );
  });
  const board = await ctx.newPage();
  await board.goto(`${BASE}/?mode=cloud`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  const pinned = await board.evaluate(() => {
    const raw = localStorage.getItem('milksha:local:device:c030020:stb-01');
    return {
      deviceId: localStorage.getItem('milksha:deviceId'),
      hasHeartbeat: Boolean(raw),
    };
  });
  expect(pinned.deviceId).toBe('stb-01');
  expect(pinned.hasHeartbeat).toBe(true);
  await ctx.close();
});
