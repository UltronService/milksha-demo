import { expect } from '@playwright/test';
import { urlsLocalHomePoc } from './harness.mjs';

export async function openLocalBoard(page) {
  const { board } = urlsLocalHomePoc();
  await page.goto(board);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), { timeout: 25000 });
}

/** Past first-payload + one silent reconnect so incremental updates may animate. */
export async function primeBoardForAnimation(page) {
  await openLocalBoard(page);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
  });
}

export async function resetOpacityAnimCounter(page) {
  await page.evaluate(() => {
    if (window.QMS.runtime.resetBoardAnimProbe) {
      window.QMS.runtime.resetBoardAnimProbe();
    }
  });
}

export async function opacityAnimRunsSinceReset(page) {
  return page.evaluate(() => {
    const rt = window.QMS.runtime;
    if (!rt || !rt.getBoardAnimProbe) {
      return 0;
    }
    return rt.getBoardAnimProbe().opacityAnimRuns;
  });
}

export async function assertChipsOpaqueAndUnique(page) {
  const stats = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.milksha-board-chip')];
    const ids = chips.map((el) => el.getAttribute('data-item-id'));
    const badOpacity = chips.filter((el) => {
      const o = getComputedStyle(el).opacity;
      return o !== '' && o !== '1';
    }).length;
    return { badOpacity, dup: ids.length - new Set(ids).size };
  });
  expect(stats.badOpacity).toBe(0);
  expect(stats.dup).toBe(0);
}

export async function prepNumbers(page) {
  return page.locator('.milksha-prep .milksha-num').allTextContents();
}

export async function readyNumbers(page) {
  return page.locator('.milksha-ready .milksha-num').allTextContents();
}
