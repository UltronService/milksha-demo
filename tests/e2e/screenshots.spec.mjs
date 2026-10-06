import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import {
  urlsForMode,
  connectController,
  resetCloudState,
  guestBoardStyleFingerprint,
  expandControllerZone,
  installBundledCloudRouteShim,
} from './harness.mjs';
import { e2eArtifactsDir } from './artifact-dir.mjs';

const ART = e2eArtifactsDir();

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
  await controller.evaluate(() => {
    const z = document.getElementById('sec-net');
    if (!z) {
      return;
    }
    const body = z.querySelector('.zone-body');
    const btn = z.querySelector('.zone-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
    }
    if (body) {
      body.hidden = true;
    }
  });
  await expect(controller.locator('#sec-net .zone-body')).toBeHidden();
  await controller.screenshot({ path: `${ART}/controller-mobile.png`, fullPage: false });
  await controller.setViewportSize({ width: 1440, height: 900 });

  await expandControllerZone(controller, 'sec-net');

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
  const stylesOnline = await guestBoardStyleFingerprint(receiver);
  await receiver.screenshot({
    path: `${ART}/board-1366.png`,
    fullPage: false,
  });

  await controller.click('#btn-offline');
  await controller.waitForTimeout(2000);
  await controller.fill('#fld-no', '4999');
  await controller.click('#btn-add-ticket');
  await expect(receiver.locator('.rcv-prep .rcv-num', { hasText: '4999' })).toHaveCount(0, {
    timeout: 8000,
  });
  const guestText = await receiver.locator('[data-testid="rcv-guest-stage"]').innerText();
  expect(guestText).not.toContain('尚未連線');
  expect(guestText).not.toContain('斷線');
  expect(guestText).not.toContain('s120030');
  expect(guestText).not.toMatch(/milkshas\d+/i);
  const stylesOffline = await guestBoardStyleFingerprint(receiver);
  expect(stylesOffline.stageSimulatedOffline).toBe('0');
  expect(stylesOffline.offlineClassNames).toEqual([]);
  expect(stylesOffline.stage).toEqual(stylesOnline.stage);
  expect(stylesOffline.board).toEqual(stylesOnline.board);
  await receiver.waitForTimeout(300);
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
  const sourcesPng = readFileSync(`${ART}/board-sources-1366.png`);
  expect(sourcesPng.equals(boardPng)).toBe(false);

  await ctx.close();
});

test('save cloud mode screenshots', async ({ browser }) => {
  const base = urlsForMode('local').base;
  mkdirSync(ART, { recursive: true });
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const controller = await ctx.newPage();
  await installBundledCloudRouteShim(controller);
  await controller.goto(`${base}/controller/?mode=cloud`);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 25000 });
  await expandControllerZone(controller, 'sec-connect');
  await controller.evaluate(() => {
    const adv = document.getElementById('advanced-settings');
    if (adv) {
      adv.open = true;
    }
    const mode = document.getElementById('fld-mode');
    if (mode) {
      mode.value = 'cloud';
    }
    document.getElementById('fld-cloud-project').value = 'milksha-qms-dev';
    document.getElementById('fld-cloud-apikey').value = 'e2e-placeholder-key';
    document.getElementById('fld-device').value = 'stb-01';
    if (window.QMS?.Transport?.CloudSettings) {
      window.QMS.Transport.CloudSettings.save({
        projectId: 'milksha-qms-dev',
        apiKey: 'e2e-placeholder-key',
        region: 'asia-east1',
      });
    }
    const linkBlock = document.getElementById('board-link-block');
    if (linkBlock) linkBlock.hidden = false;
  });
  await controller.click('#btn-gen-board-link');
  await expect(controller.locator('#board-setup-qr')).toBeVisible();
  await controller.setViewportSize({ width: 1440, height: 900 });
  await controller.screenshot({ path: `${ART}/controller-cloud-settings.png`, fullPage: false });

  await controller.setViewportSize({ width: 390, height: 844 });
  await controller.screenshot({ path: `${ART}/controller-mobile.png`, fullPage: false });

  const board = await ctx.newPage();
  await installBundledCloudRouteShim(board);
  await board.goto(`${base}/receiver-demo/?store=s120030&mode=cloud`);
  await board.setViewportSize({ width: 1366, height: 768 });
  await expect(board.locator('[data-testid="rcv-setup-gate"]')).toBeVisible();
  await board.screenshot({ path: `${ART}/board-setup-needed-1366.png`, fullPage: false });

  await ctx.close();
});
