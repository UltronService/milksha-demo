import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';

test.describe('board number rules (local fake cloud)', () => {
  test('invalid payload entries dropped; valid render; dedupe and ready wins', async ({ browser }) => {
    const ctx = await freshContext(browser);
    const board = await ctx.newPage();
    const { board: boardUrl } = urlsLocalHomePoc();
    await board.goto(boardUrl);
    await board.waitForFunction(
      () => Boolean(window.QMS?.runtime?.applyPayload),
      { timeout: 25000 },
    );

    const warnings = [];
    await board.exposeFunction('__captureWarn', (msg) => warnings.push(msg));
    await board.evaluate(() => {
      const orig = console.warn;
      console.warn = function (...args) {
        orig.apply(console, args);
        window.__captureWarn(args.join(' '));
      };
    });

    await board.evaluate(() => {
      window.QMS.runtime.applyPayload(
        [
          { source_type: 'From_Store_OK', number: '1001' },
          { source_type: 'From_Store_OK', number: '123' },
          { source_type: 'From_Store_OK', number: '12345' },
          { source_type: 'From_Store_Preparing', number: 'abcd' },
          { source_type: 'From_Store_Preparing', number: '' },
          { source_type: 'From_Store_Preparing', number: null },
          { source_type: 'From_Store_Preparing', number: 2002 },
          { source_type: 'From_Store_Preparing', number: '2002' },
          { source_type: 'From_Store_Preparing', number: '3003' },
          { source_type: 'From_Store_OK', number: '3003' },
          { source_type: 'From_Store_OK', number: '1001' },
        ],
        { silent: true },
      );
    });

    const snap = await board.evaluate(() => {
      const s = window.QMS.runtime.getSnapshot();
      return {
        ready: s.ready.map((r) => r.number),
        prep: s.preparing.map((p) => p.number),
      };
    });
    expect(snap.ready.sort()).toEqual(['1001', '3003']);
    expect(snap.prep).toEqual(['2002']);

    const texts = await board.locator('.milksha-num').allTextContents();
    for (const t of texts) {
      expect(t.trim()).toMatch(/^\d{4}$/);
    }

    expect(warnings.some((w) => /dropped invalid board number:\s*123\b/.test(w))).toBe(true);
    await ctx.close();
  });

  test('JSON number 1001 is not displayed; string ticket still renders', async ({ browser }) => {
    const ctx = await freshContext(browser);
    const board = await ctx.newPage();
    const { board: boardUrl } = urlsLocalHomePoc();
    await board.goto(boardUrl);
    await board.waitForFunction(
      () => Boolean(window.QMS?.runtime?.applyPayload),
      { timeout: 25000 },
    );
    await board.evaluate(() => {
      window.QMS.runtime.applyPayload(
        [
          { source_type: 'From_Store_OK', number: 1001 },
          { source_type: 'From_Store_OK', number: '1002' },
        ],
        { silent: true },
      );
    });
    const snap = await board.evaluate(() => {
      const s = window.QMS.runtime.getSnapshot();
      return s.ready.map((r) => r.number);
    });
    expect(snap).toEqual(['1002']);
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(1);
    await expect(board.locator('.milksha-ready .milksha-num')).toHaveText('1002');
    await ctx.close();
  });

  test('sixty preparing entries render without error', async ({ browser }) => {
    const ctx = await freshContext(browser);
    const board = await ctx.newPage();
    const { board: boardUrl } = urlsLocalHomePoc();
    await board.goto(boardUrl);
    await board.waitForFunction(
      () => Boolean(window.QMS?.runtime?.applyPayload),
      { timeout: 25000 },
    );
    await board.evaluate(() => {
      const batch = [];
      for (let i = 0; i < 60; i += 1) {
        batch.push({
          source_type: 'From_Store_Preparing',
          number: String(1000 + i),
        });
      }
      window.QMS.runtime.applyPayload(batch, { silent: true });
    });
    const count = await board.evaluate(() => window.QMS.runtime.getSnapshot().preparing.length);
    expect(count).toBe(60);
    await expect(board.locator('.milksha-board')).toBeVisible();
    await ctx.close();
  });

  test('controller path still sends via fake cloud (zz-qa-ci-store id in URL optional)', async ({
    browser,
  }) => {
    const ctx = await freshContext(browser);
    const board = await ctx.newPage();
    const controller = await ctx.newPage();
    const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();
    await board.goto(boardUrl);
    await controller.goto(ctrlUrl);
    await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
    await waitForReceiverOnline(board, 'local');
    await controller.click('[data-testid="btn-send-numbers"]');
    await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 8000 });
    await ctx.close();
  });
});
