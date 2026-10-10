import { expect } from '@playwright/test';
import { expandControllerZone } from './harness.mjs';

/**
 * @param {import('@playwright/test').Page | undefined} ctrl
 */
export async function stopLiveCloudSimulation(ctrl) {
  if (!ctrl || ctrl.isClosed()) {
    return;
  }
  try {
    const status = (await ctrl.locator('[data-testid="sim-status"]').textContent({ timeout: 5000 })) || '';
    if (!/已停止/.test(status)) {
      await ctrl.click('[data-testid="btn-sim-stop"]');
      await ctrl.waitForTimeout(3000);
    }
  } catch {
    /* page may not have reached controller UI */
  }
}

/**
 * @param {import('@playwright/test').Page | undefined} ctrl
 */
export async function sendClearNow(ctrl) {
  if (!ctrl || ctrl.isClosed()) {
    return;
  }
  try {
    await expandControllerZone(ctrl, 'sec-special');
    await ctrl.click('[data-testid="btn-clear-now"]');
    await ctrl.waitForTimeout(3000);
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * @param {import('@playwright/test').Page | undefined} board
 */
export async function assertLiveCloudBoardEmpty(board) {
  if (!board || board.isClosed()) {
    return;
  }
  await board.waitForFunction(
    () =>
      document.querySelectorAll('.milksha-prep .milksha-num').length === 0 &&
      document.querySelectorAll('.milksha-ready .milksha-num').length === 0,
    { timeout: 15000 },
  );
  const prep = await board.locator('.milksha-prep .milksha-num').count();
  const ready = await board.locator('.milksha-ready .milksha-num').count();
  expect(prep + ready).toBe(0);
}

/**
 * @param {import('@playwright/test').Page | undefined} ctrl
 * @param {import('@playwright/test').Page | undefined} board
 */
export async function teardownLiveCloudSession(ctrl, board) {
  await stopLiveCloudSimulation(ctrl);
  await sendClearNow(ctrl);
  await assertLiveCloudBoardEmpty(board);
}
