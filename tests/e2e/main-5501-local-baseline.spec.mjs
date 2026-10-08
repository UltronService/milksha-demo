/**
 * Baseline from main @ 6ef1359 — local mode offline reconnect 5501 (not part of default CI).
 */
import { test, expect } from '@playwright/test';
import {
  urlsForMode,
  connectController,
  resetCloudState,
  freshContext,
  waitForReceiverOnline,
} from './harness.mjs';

async function openSession(browser) {
  await resetCloudState();
  const { recv, ctrl } = urlsForMode('local');
  const ctx = await freshContext(browser);
  const receiver = await ctx.newPage();
  const controller = await ctx.newPage();
  await receiver.goto(recv);
  await receiver.waitForFunction(() => Boolean(window.receiverCloud), { timeout: 25000 });
  await controller.goto(ctrl);
  await connectController(controller, 'local');
  await waitForReceiverOnline(receiver, 'local');
  await controller.waitForTimeout(800);
  return { ctx, receiver, controller };
}

test('main baseline | no chime for ready while offline on reconnect (local)', async ({ browser }) => {
  const { ctx, receiver, controller } = await openSession(browser);
  await receiver.evaluate(() => {
    window.__rcvTelemetry.ringCount = 0;
  });
  await controller.fill('#fld-no', '5501');
  await controller.selectOption('#fld-status', 'preparing');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '5501' })).toHaveCount(1, {
    timeout: 15000,
  });
  await controller.click('#btn-offline');
  await receiver.waitForFunction(
    () => window.receiverCloud && window.receiverCloud.isSimulatedOffline && window.receiverCloud.isSimulatedOffline(),
    { timeout: 10000 },
  );
  const ringsBefore = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  await controller.click('#btn-one-ready');
  await controller.waitForTimeout(2000);
  await controller.click('#btn-restore');
  await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '5501' })).toHaveCount(1, {
    timeout: 15000,
  });
  const ringsAfter = await receiver.evaluate(() => window.__rcvTelemetry.ringCount);
  expect(ringsAfter).toBe(ringsBefore);
  await ctx.close();
});
