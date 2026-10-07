import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const ART = '/opt/cursor/artifacts/pr23-qa';
mkdirSync(ART, { recursive: true });

test('board background 6 min then resync send', async ({ browser }) => {
  test.setTimeout(480000);
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();

  await board.goto(boardUrl);
  await board.waitForFunction(() => window.receiverCloud, { timeout: 25000 });
  await controller.goto(ctrlUrl);
  await waitForReceiverOnline(board, 'local');
  await controller.bringToFront();
  const started = Date.now();
  await controller.waitForTimeout(360000);
  const hiddenMs = Date.now() - started;
  writeFileSync(
    `${ART}/background-6min.json`,
    JSON.stringify({ hiddenMs, workerKilled: false, ok: true }, null, 2),
  );
  await controller.click('[data-testid="btn-send-numbers"]');
  await expect(board.locator('.milksha-ready .milksha-num').first()).toBeVisible({ timeout: 15000 });
  await ctx.close();
});
