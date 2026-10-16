import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline, expandControllerZone } from './harness.mjs';

test('quick send keeps typed number and resend preparing does not demote ready', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
  await board.goto(boardUrl);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(ctrlUrl);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await waitForReceiverOnline(board, 'local');
  await board.evaluate(() => window.QMS.runtime.applyPayload([]));

  await controller.fill('[data-testid="fld-quick-no"]', '3456');
  await controller.selectOption('[data-testid="fld-quick-status"]', 'ready');
  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num').filter({ hasText: '3456' })).toBeVisible({
    timeout: 8000,
  });
  await expect(controller.locator('[data-testid="fld-quick-no"]')).toHaveValue('3456');

  await controller.selectOption('[data-testid="fld-quick-status"]', 'preparing');
  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num').filter({ hasText: '3456' })).toBeVisible();
  await expect(board.locator('.milksha-prep .milksha-num').filter({ hasText: '3456' })).toHaveCount(0);

  await ctx.close();
});

test('store simulation keeps running while board paginates ready zone', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
  await board.goto(boardUrl);
  await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(ctrlUrl);
  await controller.waitForFunction(
    () => document.getElementById('online-state')?.getAttribute('data-connected') === '1',
    { timeout: 15000 },
  );
  await waitForReceiverOnline(board, 'local');
  await board.evaluate(() => window.QMS.runtime.applyPayload([]));

  await expandControllerZone(controller, 'sec-pos');
  await controller.click('[data-testid="btn-gen-peak"]');
  await expect(controller.locator('[data-testid="sim-status"]')).toContainText(/運行中/, { timeout: 5000 });

  const tenMinMs = 10 * 60 * 1000;
  await controller.evaluate(
    async ({ advanceMs }) => {
      const ctrl = window.__controller;
      const host = ctrl.getStoreSimulationHost();
      let now = Date.now();
      let seed = 20261016;
      const rng = function () {
        seed += 0x6d2b79f5;
        let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
      ctrl.setSimulationClock({ nowMs: now, rng: rng });
      const step = 30000;
      for (let elapsed = 0; elapsed < advanceMs; elapsed += step) {
        now += step;
        ctrl.setSimulationClock({ nowMs: now, rng: rng });
        host.wake(true);
      }
    },
    { advanceMs: tenMinMs },
  );

  await expect(controller.locator('[data-testid="sim-status"]')).toContainText(/運行中/);

  await expect
    .poll(
      async () => {
        return controller.evaluate(() => {
          const tally = { store: 0, point: 0, fp: 0, uber: 0, udd: 0 };
          window.__controller.getTickets().forEach((t) => {
            const sk = t.sourceKey || 'store';
            if (tally[sk] != null) {
              tally[sk] += 1;
            }
          });
          return tally;
        });
      },
      { timeout: 15000 },
    )
    .toMatchObject({
      store: expect.any(Number),
    });

  const ticketCounts = await controller.evaluate(() => {
    const tally = { store: 0, point: 0, fp: 0, uber: 0, udd: 0 };
    window.__controller.getTickets().forEach((t) => {
      const sk = t.sourceKey || 'store';
      if (tally[sk] != null) {
        tally[sk] += 1;
      }
    });
    return tally;
  });
  expect(ticketCounts.store).toBeGreaterThan(0);
  expect(ticketCounts.udd).toBeGreaterThan(0);
  expect(ticketCounts.uber).toBeGreaterThan(0);

  const boardCounts = await board.evaluate(() => {
    const tally = { store: 0, point: 0, fp: 0, uber: 0, udd: 0 };
    document.querySelectorAll('.milksha-board-chip[data-item-id]').forEach((el) => {
      const id = el.getAttribute('data-item-id') || '';
      const sk = id.split(':')[0];
      if (tally[sk] != null) {
        tally[sk] += 1;
      }
    });
    return tally;
  });
  expect(boardCounts.store).toBeGreaterThan(0);

  await controller.click('[data-testid="btn-sim-stop"]');
  await ctx.close();
});
