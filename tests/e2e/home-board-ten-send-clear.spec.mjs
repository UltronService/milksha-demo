import { test, expect } from '@playwright/test';
import { freshContext, PORT_SITE, waitForReceiverOnline } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;

function todayBusinessDate() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${day}`;
}

/** Settings-only seed reminiscent of post–#19 receiver cache (5ab3c35). */
function seed5ab3c35Settings() {
  const bd = todayBusinessDate();
  localStorage.setItem(
    'milksha:cloud-settings',
    JSON.stringify({
      projectId: 'milksha-qms-dev',
      apiKey: 'legacy-key',
      accessCode: 'legacy-code',
      region: 'asia-east1',
    }),
  );
  localStorage.setItem(
    'milksha:receiver-cache:s120030',
    JSON.stringify({
      seq: 12,
      numberContent: [],
      businessDate: bd,
      boardUpdatedAt: new Date().toISOString(),
    }),
  );
}

/** Settings-only seed reminiscent of post–#20 alignment (8138a4a). */
function seed8138a4aSettings() {
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
  localStorage.setItem(
    'milksha:local:poc-target',
    JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', pinnedAt: Date.now() }),
  );
  localStorage.setItem(
    'milksha:local:device:s120030:stb-old-99',
    JSON.stringify({ online: true, lastSeen: new Date().toISOString() }),
  );
  localStorage.setItem(
    'milksha:cloud-settings',
    JSON.stringify({
      projectId: 'milksha-qms-dev',
      apiKey: 'old-key',
      accessCode: 'old-code',
      region: 'asia-east1',
    }),
  );
}

async function openBoardAndController(ctx) {
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  await board.goto(`${BASE}/`);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(`${BASE}/controller/`);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await waitForReceiverOnline(board, 'local');
  return { board, controller };
}

async function assertTenSendsAndClear(board, controller) {
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(0, { timeout: 8000 });
  for (let i = 0; i < 10; i += 1) {
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(i + 1, { timeout: 8000 });
  }
  await controller.locator('[data-testid="zone-toggle-special"]').click();
  await controller.click('[data-testid="btn-clear-now"]');
  await expect(controller.locator('[data-testid="user-banner"]')).toContainText('看板已清空', { timeout: 8000 });
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(0, { timeout: 8000 });
  const boardKeyEmpty = await board.evaluate(() => {
    const raw = localStorage.getItem('milksha:local:board:s120030');
    if (!raw) return true;
    try {
      const doc = JSON.parse(raw);
      return !doc.tickets || doc.tickets.length === 0;
    } catch {
      return false;
    }
  });
  expect(boardKeyEmpty).toBe(true);
}

for (const scenario of [
  { name: 'fresh context', seed: null },
  { name: 'localStorage seeded 5ab3c35-style', seed: seed5ab3c35Settings },
  { name: 'localStorage seeded 8138a4a-style', seed: seed8138a4aSettings },
]) {
  test(`local-link ${scenario.name}: ten quick sends then 清空看板 (board tab not reloaded)`, async ({
    browser,
  }) => {
    const ctx = await freshContext(browser);
    if (scenario.seed) {
      await ctx.addInitScript(scenario.seed);
    }
    const { board, controller } = await openBoardAndController(ctx);
    await assertTenSendsAndClear(board, controller);
    await ctx.close();
  });
}
