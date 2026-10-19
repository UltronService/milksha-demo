import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc } from './harness.mjs';

test.describe('board number rules (local fake cloud)', () => {
  test('payload strings render; dedupe and ready wins; non-string dropped', async ({ browser }) => {
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
    expect(snap.ready.sort()).toEqual(['1001', '123', '12345', '3003']);
    expect(snap.prep.sort()).toEqual(['', '2002', 'abcd']);

    const texts = await board.locator('.milksha-num').allTextContents();
    expect(texts.some((t) => t === '12345')).toBe(true);

    expect(warnings.some((w) => /dropped invalid board number:\s*2002\b/.test(w))).toBe(true);
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
    const nums = await board.locator('.milksha-num').allTextContents();
    expect(nums).toEqual(['1002']);
    await ctx.close();
  });
});
