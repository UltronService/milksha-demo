import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';

test('controller stays online while board tab is in background', async ({ browser }) => {
  test.setTimeout(150000);
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();

  await board.goto(boardUrl);
  await board.waitForFunction(
    () => window.QMS?.runtime?.applyPayload && window.receiverCloud,
    { timeout: 25000 },
  );
  await controller.goto(ctrlUrl);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');
  await expect(controller.locator('#online-state')).toContainText('看板 在線', { timeout: 15000 });

  await controller.bringToFront();
  await board.waitForTimeout(70000);

  await expect(controller.locator('#online-state')).toContainText('看板 在線', { timeout: 10000 });
  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 10000 });

  await ctx.close();
});

test('board idle keeps DOM churn low between paging ticks', async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  await board.goto(urlsLocalHomePoc().board);
  await board.waitForFunction(() => window.QMS?.runtime?.applyPayload, { timeout: 25000 });

  const rows = [];
  for (let i = 0; i < 14; i += 1) {
    rows.push({ source_type: 'From_Store_OK', number: String(7000 + i) });
  }
  await board.evaluate((payload) => window.QMS.runtime.applyPayload(payload), rows);

  await board.evaluate(() => {
    const root = document.getElementById('milksha-board');
    window.__milkshaMutations = 0;
    if (!root) {
      return;
    }
    const obs = new MutationObserver(function () {
      window.__milkshaMutations += 1;
    });
    obs.observe(root, { childList: true, subtree: true, characterData: true });
    window.__milkshaMutObs = obs;
  });

  await board.waitForTimeout(32000);
  const stats = await board.evaluate(() => {
    if (window.__milkshaMutObs) {
      window.__milkshaMutObs.disconnect();
    }
    return { mutations: window.__milkshaMutations || 0 };
  });

  expect(stats.mutations).toBeLessThan(80);
  await ctx.close();
});
