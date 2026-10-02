import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
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
  const ctx = await freshContext(browser);
  const controller = await ctx.newPage();
  const receiver = await ctx.newPage();

  await receiver.goto(recv);
  await controller.goto(ctrl);
  await connectController(controller, 'local');
  await controller.fill('#fld-no', '9001');
  await controller.selectOption('#fld-status', 'ready');
  await controller.click('#btn-add-ticket');

  await controller.setViewportSize({ width: 1440, height: 900 });
  await controller.screenshot({ path: `${ART}/controller-desktop.png`, fullPage: true });

  await controller.setViewportSize({ width: 390, height: 844 });
  await controller.screenshot({ path: `${ART}/controller-mobile.png`, fullPage: true });

  await receiver.setViewportSize({ width: 1366, height: 768 });
  await receiver.waitForTimeout(2000);
  await receiver.screenshot({ path: `${ART}/board-1366.png` });

  await controller.click('#btn-offline');
  await receiver.waitForTimeout(1500);
  await receiver.screenshot({ path: `${ART}/board-offline-1366.png` });

  await ctx.close();
});
