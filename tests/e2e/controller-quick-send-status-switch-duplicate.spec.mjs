import { test, expect } from '@playwright/test';
import {
  clickControllerDevButtonByTestId,
  freshContext,
  urlsLocalHomePoc,
  waitForReceiverOnline,
} from './harness.mjs';

/**
 * Regression: cross-zone duplicate guard (da07bd3) — same number in preparing must not block ready send.
 * QA b35c419: after preparing send, switching target status to ready leaves send disabled +「此號碼已在看板上」.
 */
test('preparing send then switch to ready re-enables send for same number', async ({ browser }) => {
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

  const ticketNo = '3471';
  const note = controller.locator('[data-testid="quick-send-rule-note"]');
  const sendBtn = controller.locator('[data-testid="btn-send-numbers"]');

  await controller.selectOption('[data-testid="fld-quick-status"]', 'preparing');
  await controller.fill('[data-testid="fld-quick-no"]', ticketNo);
  await clickControllerDevButtonByTestId(controller, 'btn-send-numbers');

  await expect(board.locator('.milksha-prep .milksha-num', { hasText: ticketNo })).toHaveCount(1, {
    timeout: 12000,
  });

  // Post-send refreshBoardLists → syncQuickSendFieldUi while dropdown still「準備中」
  await expect(note).toContainText('此號碼已在看板上', { timeout: 15000 });
  await expect(sendBtn).toBeDisabled();

  await controller.selectOption('[data-testid="fld-quick-status"]', 'ready');

  const uiState = await controller.evaluate(() => {
    const Send = window.QMS.Controller.SendNumber;
    const quickEl = document.getElementById('fld-quick-no');
    const sourceKey = document.getElementById('fld-quick-source').value;
    const validated = Send.validateQuickSendNumber(sourceKey, quickEl.value);
    const targetStatus = document.getElementById('fld-quick-status').value;
    const tickets = window.__controller.getTickets();
    let duplicateOnBoard = false;
    if (validated.ok) {
      const no = validated.normalized;
      for (let i = 0; i < tickets.length; i += 1) {
        const row = tickets[i];
        if (
          (row.sourceKey || 'store') === sourceKey &&
          String(row.no) === no &&
          row.status === targetStatus
        ) {
          duplicateOnBoard = true;
          break;
        }
      }
    }
    const sendBlocked = !validated.ok || duplicateOnBoard;
    const noteText = document.getElementById('quick-send-rule-note').textContent || '';
    return {
      targetStatus,
      sendBlocked,
      buttonDisabled: document.getElementById('btn-send-numbers').disabled,
      noteHasDuplicate: noteText.indexOf('此號碼已在看板上') >= 0,
    };
  });

  expect(uiState.targetStatus).toBe('ready');
  expect(
    uiState,
    `pr95-status-switch-dup: stale quick-send UI after status change ${JSON.stringify(uiState)}`,
  ).toEqual({
    targetStatus: 'ready',
    sendBlocked: false,
    buttonDisabled: false,
    noteHasDuplicate: false,
  });

  await clickControllerDevButtonByTestId(controller, 'btn-send-numbers');
  await expect(board.locator('.milksha-ready .milksha-num', { hasText: ticketNo })).toHaveCount(1, {
    timeout: 12000,
  });

  await ctx.close();
});
