import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { urlsForMode, connectController, resetCloudState } from './harness.mjs';

const ART = '/opt/cursor/artifacts';

test.beforeAll(() => {
  mkdirSync(ART, { recursive: true });
});

test('save controller and board screenshots', async ({ browser }) => {
  const { recv, ctrl } = urlsForMode('local');
  await resetCloudState();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__e2e_init')) {
        localStorage.clear();
        sessionStorage.setItem('__e2e_init', '1');
      }
    } catch {
      /* ignore */
    }
  });
  const receiver = await ctx.newPage();
  const controller = await ctx.newPage();

  await receiver.goto(recv);
  await controller.goto(ctrl);
  await connectController(controller, 'local');
  await expect(controller.locator('#online-state')).toContainText('在線', { timeout: 20000 });
  await expect(controller.locator('#status-heartbeat-at')).not.toHaveText('—', { timeout: 15000 });

  await controller.setViewportSize({ width: 1440, height: 900 });
  await controller.screenshot({ path: `${ART}/controller-desktop.png`, fullPage: false });

  await controller.setViewportSize({ width: 390, height: 844 });
  await expect(controller.locator('#local-mode-notice')).toBeVisible();
  await expect(controller.locator('#sec-net .zone-body')).toBeHidden();
  await controller.screenshot({ path: `${ART}/controller-mobile.png`, fullPage: false });
  await controller.setViewportSize({ width: 1440, height: 900 });

  const sourceRows = [
    { source: 'store', no: '7101', status: 'preparing' },
    { source: 'point', no: '7102', status: 'preparing' },
    { source: 'fp', no: '7103', status: 'ready' },
    { source: 'uber', no: '7104', status: 'ready' },
    { source: 'udd', no: '7105', status: 'preparing' },
  ];
  for (const row of sourceRows) {
    await controller.selectOption('#fld-source', row.source);
    await controller.fill('#fld-no', row.no);
    await controller.selectOption('#fld-status', row.status);
    await controller.click('#btn-add-ticket');
  }
  await receiver.setViewportSize({ width: 1366, height: 768 });
  await expect(receiver.locator('.rcv-tag', { hasText: '熊貓' })).toBeVisible({ timeout: 15000 });
  await receiver.screenshot({ path: `${ART}/board-sources-1366.png`, fullPage: false });

  await controller.click('#btn-gen-normal');
  await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '1002' })).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '1001' })).toHaveCount(1, {
    timeout: 15000,
  });

  await receiver.setViewportSize({ width: 1366, height: 768 });
  await receiver.waitForTimeout(500);
  await receiver.screenshot({
    path: `${ART}/board-1366.png`,
    fullPage: false,
  });

  await controller.click('#btn-offline');
  await expect(receiver.locator('[data-testid="rcv-guest-stage"][data-simulated-offline="1"]')).toBeVisible({
    timeout: 12000,
  });
  await controller.fill('#fld-no', '4999');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '4999' })).toHaveCount(0, {
    timeout: 8000,
  });
  const guestText = await receiver.locator('[data-testid="rcv-guest-stage"]').innerText();
  expect(guestText).not.toContain('尚未連線');
  await receiver.waitForTimeout(800);
  await receiver.screenshot({
    path: `${ART}/board-offline-1366.png`,
    fullPage: false,
  });

  function pngSize(buf) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  const boardPng = readFileSync(`${ART}/board-1366.png`);
  const offlinePng = readFileSync(`${ART}/board-offline-1366.png`);
  expect(pngSize(boardPng)).toEqual({ width: 1366, height: 768 });
  expect(pngSize(offlinePng)).toEqual({ width: 1366, height: 768 });
  expect(boardPng.equals(offlinePng)).toBe(false);
  const sourcesPng = readFileSync(`${ART}/board-sources-1366.png`);
  expect(sourcesPng.equals(boardPng)).toBe(false);

  await ctx.close();
});
