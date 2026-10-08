import { test, expect } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'artifacts', 'board-canvas-self-qa', 'screenshots');

async function readCanvasScale(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('milksha-board-canvas');
    if (!canvas || !canvas.style.transform) {
      return null;
    }
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    return m ? Number(m[1]) : null;
  });
}

async function seedNumbers(board) {
  await board.evaluate(() =>
    window.QMS.runtime.applyPayload([
      { source_type: 'From_Store_Preparing', number: '8101' },
      { source_type: 'From_Store_Preparing', number: '8102' },
      { source_type: 'From_Store_OK', number: '7201' },
      { source_type: 'From_Store_OK', number: '8888' },
    ]),
  );
}

test('home board canvas scales uniformly at 4K and letterboxes non-16:9', async ({ browser }) => {
  mkdirSync(ART, { recursive: true });
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();

  await board.goto(boardUrl);
  await board.waitForFunction(() => window.QMS?.runtime?.applyPayload, { timeout: 25000 });
  await controller.goto(ctrlUrl);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');

  await board.setViewportSize({ width: 1920, height: 1080 });
  await seedNumbers(board);
  await board.waitForTimeout(200);
  expect(await readCanvasScale(board)).toBeCloseTo(1, 5);

  await board.setViewportSize({ width: 3840, height: 2160 });
  await board.waitForTimeout(200);
  expect(await readCanvasScale(board)).toBeCloseTo(2, 5);

  const zoneAspect = await board.evaluate(() => {
    const prep = document.querySelector('.milksha-zone.prep');
    const ready = document.querySelector('.milksha-zone.ready');
    if (!prep || !ready) {
      return null;
    }
    const pr = prep.getBoundingClientRect();
    const rr = ready.getBoundingClientRect();
    return { prepW: pr.width, readyW: rr.width, prepH: pr.height, readyH: rr.height };
  });
  expect(zoneAspect).not.toBeNull();
  expect(Math.abs(zoneAspect.prepW - zoneAspect.readyW)).toBeLessThan(4);
  expect(Math.abs(zoneAspect.prepH - zoneAspect.readyH)).toBeLessThan(4);

  await board.setViewportSize({ width: 1440, height: 1080 });
  await board.waitForTimeout(200);
  expect(await readCanvasScale(board)).toBeCloseTo(0.75, 5);
  const letterbox1440 = await board.evaluate(() => {
    const vp = document.getElementById('milksha-board-viewport');
    if (!vp) {
      return null;
    }
    const r = vp.getBoundingClientRect();
    return { top: r.top, height: r.height, innerH: window.innerHeight };
  });
  expect(letterbox1440.height).toBe(810);
  expect(letterbox1440.top).toBeCloseTo(135, 1);
  const stageBg1440 = await board.evaluate(() => {
    const stage = document.querySelector('.milksha-stage');
    return stage ? getComputedStyle(stage).backgroundColor : null;
  });
  expect(stageBg1440).toBe('rgb(0, 0, 0)');

  await board.setViewportSize({ width: 1920, height: 800 });
  await board.waitForTimeout(200);
  const letterbox1920x800 = await board.evaluate(() => {
    const vp = document.getElementById('milksha-board-viewport');
    if (!vp) {
      return null;
    }
    const r = vp.getBoundingClientRect();
    return { left: r.left, width: r.width, innerW: window.innerWidth };
  });
  expect(letterbox1920x800.width).toBeCloseTo(1422, 0);
  expect(letterbox1920x800.left).toBeCloseTo((1920 - letterbox1920x800.width) / 2, 1);
  const stageBg1920x800 = await board.evaluate(() => {
    const stage = document.querySelector('.milksha-stage');
    return stage ? getComputedStyle(stage).backgroundColor : null;
  });
  expect(stageBg1920x800).toBe('rgb(0, 0, 0)');

  await board.setViewportSize({ width: 1920, height: 1080 });
  await board.evaluate(() => window.QMS.runtime.setCloudOfflineVisible(true));
  await board.evaluate(() => window.QMS.runtime.setCloudPausedVisible(true));
  await board.waitForTimeout(100);
  const overlayInCanvas = await board.evaluate(() => {
    const canvas = document.getElementById('milksha-board-canvas');
    const off = document.getElementById('milksha-cloud-offline');
    const paused = document.getElementById('milksha-cloud-paused');
    if (!canvas || !off || !paused) {
      return { ok: false };
    }
    const cr = canvas.getBoundingClientRect();
    const or = off.getBoundingClientRect();
    const pr = paused.getBoundingClientRect();
    const inside =
      or.left >= cr.left - 1 &&
      or.right <= cr.right + 1 &&
      or.top >= cr.top - 1 &&
      pr.right <= cr.right + 1 &&
      pr.bottom <= cr.bottom + 1;
    return { ok: inside };
  });
  expect(overlayInCanvas.ok).toBe(true);

  await board.screenshot({ path: join(ART, 'board-numbers-1920x1080.png'), fullPage: false });
  await board.setViewportSize({ width: 3840, height: 2160 });
  await board.waitForTimeout(200);
  await board.screenshot({ path: join(ART, 'board-numbers-3840x2160.png'), fullPage: false });
  await board.setViewportSize({ width: 1440, height: 1080 });
  await board.waitForTimeout(200);
  await board.screenshot({ path: join(ART, 'board-letterbox-1440x1080.png'), fullPage: false });
  await board.setViewportSize({ width: 1920, height: 800 });
  await board.waitForTimeout(200);
  await board.screenshot({ path: join(ART, 'board-letterbox-1920x800.png'), fullPage: false });

  await ctx.close();
});
