import { test, expect } from '@playwright/test';
import { taipeiBusinessDate } from '../../tools/fake-cloud/taipei-business-date.mjs';
import { PORT_CLOUD, PORT_SITE, clickControllerDevButton, clickControllerDevButtonByTestId, installBundledCloudRouteShim, isolatedCloudContext, resetCloudState, waitForReceiverOnline } from './harness.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const STORE = 's120030';

test.describe('controller post-send today_board read abort (fake-cloud)', () => {
  test('superseded board GET after push_numbers does not show red or drop ticket', async ({ browser }) => {
    test.setTimeout(120000);
    await resetCloudState({ seedDevice: true });
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);

    await board.goto(`${BASE}/?mode=cloud&store=${STORE}`);
    await ctrl.goto(`${BASE}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await waitForReceiverOnline(board, 'cloud');
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
    await expect(ctrl.locator('#online-state')).toContainText('在線', { timeout: 15000 });
    await expect
      .poll(async () =>
        ctrl.evaluate(async () => {
          const text = await fetch('controller-app.js?v=20261011a').then((r) => r.text());
          return (
            Boolean(window.QMS?.Transport?.BoardRefreshAfterCommand?.refreshBoardIgnoringSupersededAbort) &&
            text.includes('refreshBoardIgnoringSupersededAbort(refreshBoardLists)') &&
            text.includes('push_numbers 後同步看板略過')
          );
        }),
      )
      .toBe(true);

    let holdNextBoardGet = false;
    /** @type {null | (() => void)} */
    let releaseHeldBoardGet = null;

    ctrl.on('request', (req) => {
      if (holdNextBoardGet) {
        return;
      }
      if (req.method() !== 'POST' || !req.url().includes('devCommand')) {
        return;
      }
      const body = req.postData() || '';
      if (body.includes('push_numbers')) {
        holdNextBoardGet = true;
      }
    });

    await ctrl.route('**/today_board**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      if (holdNextBoardGet) {
        holdNextBoardGet = false;
        await new Promise((resolve) => {
          releaseHeldBoardGet = resolve;
        });
      } else if (releaseHeldBoardGet) {
        releaseHeldBoardGet();
        releaseHeldBoardGet = null;
      }
      await route.continue();
    });

    await clickControllerDevButtonByTestId(ctrl, 'btn-send-numbers');
    await expect
      .poll(() => releaseHeldBoardGet !== null, { timeout: 15000, intervals: [100, 200, 500] })
      .toBe(true);

    await expect(ctrl.locator('[data-testid="command-error-alert"]')).toBeHidden({ timeout: 8000 });

    await ctrl.waitForTimeout(4100);

    await expect(ctrl.locator('[data-testid="command-error-alert"]')).toBeHidden({ timeout: 8000 });
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1, { timeout: 15000 });
    await expect
      .poll(async () =>
        ctrl.evaluate(() => {
          const items = Array.from(document.querySelectorAll('#log-list li')).map((li) => li.textContent || '');
          return !items.some((line) => line.includes('連線失敗') && line.includes('push_numbers'));
        }),
      )
      .toBe(true);

    await ctx.close();
  });

  test('push_numbers HTTP 409 stale_list shows no red and syncs list from today_board', async ({ browser }) => {
    test.setTimeout(90000);
    await resetCloudState({ seedDevice: true });
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/seed-board`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: STORE,
        businessDate: taipeiBusinessDate(),
        seq: 3,
        tickets: [{ no: '1001', status: 'ready', updatedAt: '2026-10-03T12:00:00.000Z' }],
      }),
    });
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);

    await ctrl.route('**/devCommand**', async (route) => {
      const body = route.request().postData() || '';
      if (route.request().method() === 'POST' && body.includes('push_numbers')) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'stale_list' }),
        });
        return;
      }
      await route.continue();
    });

    await board.goto(`${BASE}/?mode=cloud&store=${STORE}`);
    await ctrl.goto(`${BASE}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await waitForReceiverOnline(board, 'cloud');
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });

    await clickControllerDevButtonByTestId(ctrl, 'btn-send-numbers');

    await expect(ctrl.locator('[data-testid="command-error-alert"]')).toBeHidden({ timeout: 12000 });
    await expect(ctrl.locator('[data-testid="user-banner"]')).toBeHidden({ timeout: 8000 });
    await expect(ctrl.locator('#log-list')).not.toContainText('雲端暫時出錯', { timeout: 8000 });

    const cloudReady = await ctrl.evaluate(async () => {
      const transport = window.__controller && window.__controller.getTransport
        ? window.__controller.getTransport()
        : null;
      if (!transport || !transport.readBoard) {
        return null;
      }
      const doc = await transport.readBoard();
      const tickets = doc && doc.data && doc.data.tickets ? doc.data.tickets : [];
      return tickets.filter((t) => t.status === 'ready').map((t) => String(t.no)).sort();
    });
    const uiReady = await ctrl.evaluate(() =>
      Array.from(document.querySelectorAll('#list-ready li'))
        .map((li) => (li.textContent || '').replace(/\s*\(.*\)$/, '').trim())
        .sort(),
    );
    expect(cloudReady).toEqual(['1001']);
    expect(uiReady).toEqual(cloudReady);

    await ctx.close();
  });

  test('push_numbers HTTP 500 still shows error and rolls back local ready list', async ({ browser }) => {
    test.setTimeout(90000);
    await resetCloudState({ seedDevice: true });
    const ctx = await isolatedCloudContext(browser);
    const board = await ctx.newPage();
    const ctrl = await ctx.newPage();
    await installBundledCloudRouteShim(board);
    await installBundledCloudRouteShim(ctrl);

    await ctrl.route('**/devCommand**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'internal_error', message: 'fail' }),
        });
        return;
      }
      await route.continue();
    });

    await board.goto(`${BASE}/?mode=cloud&store=${STORE}`);
    await ctrl.goto(`${BASE}/controller/?mode=cloud&store=${STORE}`);
    await board.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 30000 });
    await waitForReceiverOnline(board, 'cloud');
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });

    await clickControllerDevButtonByTestId(ctrl, 'btn-send-numbers');
    await expect(ctrl.locator('[data-testid="quick-send-error"]')).toBeVisible({ timeout: 12000 });
    await expect(ctrl.locator('[data-testid="quick-send-error"]')).toContainText('雲端暫時出錯');
    await expect(ctrl.locator('#list-ready li')).toHaveCount(0, { timeout: 8000 });

    await ctx.close();
  });
});
