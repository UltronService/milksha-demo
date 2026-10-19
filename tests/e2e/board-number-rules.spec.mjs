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

  test('empty ready number cell matches normal grid cell size and keeps next slot position', async ({
    browser,
  }) => {
    const ctx = await freshContext(browser);
    const board = await ctx.newPage();
    const { board: boardUrl } = urlsLocalHomePoc();
    await board.goto(boardUrl);
    await board.waitForFunction(
      () => Boolean(window.QMS?.runtime?.applyPayload),
      { timeout: 25000 },
    );

    const readyGridCells = () =>
      board.evaluate(() => {
        const zone = document.querySelector('.milksha-ready');
        if (!zone) {
          return null;
        }
        const grid =
          zone.querySelector('.milksha-cream-grid.milksha-zone-numbers') ||
          zone.querySelector('.milksha-art-numbers.milksha-zone-numbers');
        if (!grid) {
          return null;
        }
        return [...grid.querySelectorAll(':scope > .milksha-num-cell')].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        });
      });

    await board.evaluate(() => {
      window.QMS.runtime.applyPayload(
        [
          { source_type: 'From_Store_OK', number: '1002' },
          { source_type: 'From_Store_OK', number: '1001' },
        ],
        { silent: true },
      );
    });
    await board.locator('.milksha-ready .milksha-num', { hasText: '1001' }).waitFor({ timeout: 15000 });
    const refCells = await readyGridCells();
    expect(refCells).not.toBeNull();
    expect(refCells.length).toBeGreaterThanOrEqual(2);
    const refSecondSlot = refCells[1];

    await board.evaluate(() => {
      window.QMS.runtime.applyPayload(
        [
          { source_type: 'From_Store_OK', number: '   ' },
          { source_type: 'From_Store_OK', number: '1001' },
        ],
        { silent: true },
      );
    });
    await board.locator('.milksha-ready .milksha-num', { hasText: '1001' }).waitFor({ timeout: 15000 });
    const blankPair = await board.evaluate(() => {
      const zone = document.querySelector('.milksha-ready');
      const grid =
        zone.querySelector('.milksha-cream-grid.milksha-zone-numbers') ||
        zone.querySelector('.milksha-art-numbers.milksha-zone-numbers');
      const cells = [...grid.querySelectorAll(':scope > .milksha-num-cell')];
      const slot0 = cells[0];
      const slot1 = cells[1];
      const blankNum = slot0.querySelector('.milksha-num');
      const filledNum = slot1.querySelector('.milksha-num');
      const r0 = slot0.getBoundingClientRect();
      const r1 = slot1.getBoundingClientRect();
      return {
        slot0: { width: r0.width, height: r0.height, left: r0.left, top: r0.top },
        slot1: { width: r1.width, height: r1.height, left: r1.left, top: r1.top },
        blankText: blankNum ? blankNum.textContent : null,
        filledText: filledNum ? filledNum.textContent : null,
        slot0HasChip: Boolean(slot0.querySelector('.milksha-board-chip')),
      };
    });

    expect(blankPair.slot0HasChip).toBe(true);
    expect(blankPair.blankText).toBe('');
    expect(blankPair.filledText).toBe('1001');
    expect(Math.abs(blankPair.slot0.width - blankPair.slot1.width)).toBeLessThan(2);
    expect(Math.abs(blankPair.slot0.height - blankPair.slot1.height)).toBeLessThan(2);
    expect(Math.abs(blankPair.slot1.left - refSecondSlot.left)).toBeLessThan(2);
    expect(Math.abs(blankPair.slot1.top - refSecondSlot.top)).toBeLessThan(2);
    expect(Math.abs(blankPair.slot0.left - refCells[0].left)).toBeLessThan(2);
    expect(Math.abs(blankPair.slot0.top - refCells[0].top)).toBeLessThan(2);
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
