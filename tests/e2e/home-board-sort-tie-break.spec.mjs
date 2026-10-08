import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshContext, urlsLocalHomePoc, resetCloudState } from './harness.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '../../artifacts/boot-fast-self-qa/screenshots');

test.describe('home board sort tie-break (payload index)', () => {
  test.beforeAll(() => {
    mkdirSync(ART, { recursive: true });
  });

  test.beforeEach(async () => {
    await resetCloudState();
  });

  test('batch send, reopen, and silent re-apply keep newest top-left in both zones', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await freshContext(browser);
    const board = await ctx.newPage();
    const { board: boardUrl } = urlsLocalHomePoc();
    await board.goto(boardUrl);
    await board.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), { timeout: 25000 });

    const batch = [
      { source_type: 'From_Store_Preparing', number: '2003' },
      { source_type: 'From_Store_Preparing', number: '2005' },
      { source_type: 'From_Store_Preparing', number: '2011' },
      { source_type: 'From_Store_Preparing', number: '2012' },
      { source_type: 'From_Store_OK', number: '8801' },
      { source_type: 'From_Store_OK', number: '8802' },
      { source_type: 'From_Store_OK', number: '8803' },
    ];

    await board.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload, { silent: true });
    }, batch);

    const prepNums = await board.locator('.milksha-prep .milksha-num').allTextContents();
    const readyNums = await board.locator('.milksha-ready .milksha-num').allTextContents();
    expect(prepNums.map((t) => t.trim())).toEqual(['2012', '2011', '2005', '2003']);
    expect(readyNums.map((t) => t.trim())).toEqual(['8803', '8802', '8801']);

    await board.screenshot({ path: join(ART, 'tie-break-batch-send-1920.png'), fullPage: false });

    await board.reload();
    await board.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), { timeout: 25000 });
    await board.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload, { silent: true });
    }, batch);

    const prepAfterReopen = await board.locator('.milksha-prep .milksha-num').allTextContents();
    const readyAfterReopen = await board.locator('.milksha-ready .milksha-num').allTextContents();
    expect(prepAfterReopen.map((t) => t.trim())).toEqual(['2012', '2011', '2005', '2003']);
    expect(readyAfterReopen.map((t) => t.trim())).toEqual(['8803', '8802', '8801']);
    await board.screenshot({ path: join(ART, 'tie-break-board-reopen-1920.png'), fullPage: false });

    await board.evaluate((payload) => {
      window.QMS.runtime.applyPayload(payload, { silent: true });
    }, batch);
    const prepReconnect = await board.locator('.milksha-prep .milksha-num').allTextContents();
    const readyReconnect = await board.locator('.milksha-ready .milksha-num').allTextContents();
    expect(prepReconnect.map((t) => t.trim())).toEqual(['2012', '2011', '2005', '2003']);
    expect(readyReconnect.map((t) => t.trim())).toEqual(['8803', '8802', '8801']);
    await board.screenshot({ path: join(ART, 'tie-break-snapshot-reapply-1920.png'), fullPage: false });

    await ctx.close();
  });
});
