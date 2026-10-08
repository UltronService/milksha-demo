import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc, waitForReceiverOnline } from './harness.mjs';

const VIEW = { width: 1920, height: 1080 };

function readyRows(start, count) {
  return Array.from({ length: count }, (_, i) => ({
    source_type: 'From_Store_OK',
    number: String(start + i),
  }));
}

function prepRows(start, count) {
  return Array.from({ length: count }, (_, i) => ({
    source_type: 'From_Store_Preparing',
    number: String(start + i),
  }));
}

test('home board matches Milksha two-column layout', async ({ browser }) => {
  const ctx = await freshContext(browser);
  const board = await ctx.newPage();
  const controller = await ctx.newPage();
  const { board: boardUrl, ctrl: ctrlUrl } = urlsLocalHomePoc();

  await board.goto(boardUrl);
  await board.waitForFunction(
    () => window.QMS?.runtime?.applyPayload && window.receiverCloud,
    { timeout: 25000 },
  );
  await controller.goto(ctrlUrl);
  await controller.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  await waitForReceiverOnline(board, 'local');
  await board.setViewportSize(VIEW);

  await board.evaluate(() => window.QMS.runtime.applyPayload([]));
  await expect(board.locator('.milksha-hdr')).toHaveCount(0);
  await expect(board.locator('.milksha-tag')).toHaveCount(0);
  await expect(board.locator('.milksha-empty-board-hint')).toHaveCount(0);

  const prepZone = board.locator('.milksha-zone.prep');
  const readyZone = board.locator('.milksha-zone.ready');
  await expect(prepZone).toHaveCount(1);
  await expect(readyZone).toHaveCount(1);

  const columns = await board.evaluate(() => {
    const prep = document.querySelector('.milksha-zone.prep');
    const ready = document.querySelector('.milksha-zone.ready');
    if (!prep || !ready) {
      return null;
    }
    const pr = prep.getBoundingClientRect();
    const rr = ready.getBoundingClientRect();
    return { prepW: pr.width, readyW: rr.width, prepLeft: pr.left, readyLeft: rr.left };
  });
  expect(columns).not.toBeNull();
  expect(Math.abs(columns.prepW - columns.readyW)).toBeLessThan(3);
  expect(columns.prepLeft).toBeLessThan(columns.readyLeft);

  await expect(prepZone.locator('.milksha-ztitle-zh')).toHaveText('準備中');
  await expect(prepZone.locator('.milksha-ztitle-en')).toHaveText('Preparing');
  await expect(readyZone.locator('.milksha-ztitle-zh')).toHaveText('請取餐');
  await expect(readyZone.locator('.milksha-ztitle-en')).toHaveText('Pick Up Now');

  const titleOffset = await board.evaluate(() => {
    const viewportH = window.innerHeight;
    const prepTitle = document.querySelector('.milksha-zone.prep .milksha-ztitle-zh');
    if (!prepTitle) {
      return null;
    }
    const top = prepTitle.getBoundingClientRect().top;
    return { top, ratio: top / viewportH };
  });
  expect(titleOffset).not.toBeNull();
  expect(titleOffset.ratio).toBeGreaterThanOrEqual(0.04);

  await board.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
    ...prepRows(8100, 10),
    ...readyRows(7200, 9),
    { source_type: 'From_Store_OK', number: '8888' },
  ]);
  await expect(board.locator('.milksha-num')).toHaveCount(20);
  await expect(board.locator('.milksha-pg-indicator')).toHaveCount(0);

  const overflow1920 = await board.evaluate(() => {
    const art = window.QMS?.Board?.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    if (!art || !canvas) {
      return { ok: false };
    }
    const cRect = canvas.getBoundingClientRect();
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    const scale = m ? Number(m[1]) : 1;
    function inCream(r, cream) {
      const left = (r.left - cRect.left) / scale;
      const right = (r.right - cRect.left) / scale;
      const top = (r.top - cRect.top) / scale;
      const bottom = (r.bottom - cRect.top) / scale;
      return (
        left >= cream.left - 1 &&
        right <= cream.left + cream.width + 1 &&
        top >= cream.top - 1 &&
        bottom <= cream.top + cream.height + 1
      );
    }
    const zones = [
      { sel: '.milksha-zone.prep', cream: art.PREP_CREAM },
      { sel: '.milksha-zone.ready', cream: art.READY_CREAM },
    ];
    for (let z = 0; z < zones.length; z += 1) {
      const nums = Array.from(document.querySelectorAll(zones[z].sel + ' .milksha-num'));
      for (let i = 0; i < nums.length; i += 1) {
        if (!inCream(nums[i].getBoundingClientRect(), zones[z].cream)) {
          return { ok: false, text: nums[i].textContent };
        }
      }
    }
    return { ok: true };
  });
  expect(overflow1920.ok).toBe(true);

  await board.setViewportSize({ width: 1280, height: 720 });
  await board.waitForTimeout(300);
  const eightFit = await board.evaluate(() => {
    const art = window.QMS?.Board?.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const num = Array.from(document.querySelectorAll('.milksha-ready .milksha-num')).find(
      (el) => el.textContent === '8888',
    );
    if (!num || !art || !canvas) {
      return { ok: false };
    }
    const cRect = canvas.getBoundingClientRect();
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    const scale = m ? Number(m[1]) : 1;
    const r = num.getBoundingClientRect();
    const cream = art.READY_CREAM;
    const right = (r.right - cRect.left) / scale;
    const left = (r.left - cRect.left) / scale;
    const bottom = (r.bottom - cRect.top) / scale;
    return {
      ok:
        right <= cream.left + cream.width + 1 &&
        left >= cream.left - 1 &&
        bottom <= cream.top + cream.height + 1,
    };
  });
  expect(eightFit.ok).toBe(true);

  await board.setViewportSize(VIEW);
  await board.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
    ...prepRows(8100, 10),
    ...readyRows(7200, 11),
  ]);
  await expect(board.locator('.milksha-pg-indicator')).toHaveCount(1);
  await expect(board.locator('.milksha-ready .milksha-pg-indicator')).toHaveText('1/2');

  await ctx.close();
});
