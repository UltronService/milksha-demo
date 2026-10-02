import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import {
  startCloud,
  waitCloudReady,
  startSite,
  stopHarness,
  urlsForMode,
  connectController,
  resetCloudState,
  freshContext,
} from './harness.mjs';

const ART = '/opt/cursor/artifacts';

test.beforeAll(async () => {
  mkdirSync(ART, { recursive: true });
  startCloud();
  await waitCloudReady();
  await startSite();
});

test.afterAll(() => {
  stopHarness();
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
  await controller.screenshot({ path: `${ART}/controller-mobile.png`, fullPage: false });

  await controller.click('#btn-gen-normal');
  await controller.fill('#fld-no', '4101');
  await controller.selectOption('#fld-status', 'ready');
  await controller.click('#btn-add-ticket');
  await controller.fill('#fld-no', '4102');
  await controller.selectOption('#fld-status', 'preparing');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-ready .rcv-num', { hasText: '4101' })).toHaveCount(1, {
    timeout: 15000,
  });
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '4102' })).toHaveCount(1, {
    timeout: 15000,
  });

  await receiver.setViewportSize({ width: 1366, height: 768 });
  const clockBefore = await receiver.locator('#rcv-clock').innerText();
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
  for (let i = 0; i < 65; i += 1) {
    const clockNow = await receiver.locator('#rcv-clock').innerText();
    if (clockNow !== clockBefore) {
      break;
    }
    await receiver.waitForTimeout(1000);
  }
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

  await ctx.close();
});
