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

export async function waitForChipsOpaque(page, timeout = 8000) {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.milksha-board-chip')].every((el) => {
        const o = getComputedStyle(el).opacity;
        return o === '1' || o === '';
      }),
    { timeout },
  );
}

export async function assertChipsOpaqueAndUnique(page) {
  await waitForChipsOpaque(page);
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

/** @returns {Promise<Array<{ zone: string, chipCount: number, text: string }>>} */
export async function findCellIntegrityViolations(page) {
  return page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.milksha-num-cell').forEach((cell) => {
      const chips = [...cell.querySelectorAll('.milksha-board-chip')];
      const text = cell.textContent.replace(/\s/g, '');
      const nums = chips.map((c) => (c.querySelector('.milksha-num')?.textContent || '').trim());
      const dupInCell = nums.length > 1;
      const badText = text.length > 0 && !/^\d{1,4}$/.test(text);
      if (chips.length > 1 || badText) {
        bad.push({
          zone: cell.closest('.milksha-zone')?.className || '',
          chipCount: chips.length,
          text,
          nums,
          dupInCell,
        });
      }
    });
    document.querySelectorAll('.milksha-zone').forEach((zoneEl) => {
      const nums = [...zoneEl.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float) .milksha-num')]
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      const seen = new Set();
      for (const n of nums) {
        if (seen.has(n)) {
          bad.push({
            zone: zoneEl.className + ' dup',
            chipCount: 0,
            text: 'dup:' + n,
          });
        }
        seen.add(n);
      }
    });
    return bad;
  });
}

export async function assertEachCellSingleNumber(page) {
  const bad = await findCellIntegrityViolations(page);
  expect(bad, JSON.stringify(bad)).toEqual([]);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} trigger
 * @param {{ samples?: number, intervalMs?: number }} [opts]
 */
export async function sampleIntegrityDuringUpdate(page, trigger, opts = {}) {
  const samples = opts.samples ?? 24;
  const intervalMs = opts.intervalMs ?? 25;
  const violations = [];
  const timer = setInterval(async () => {
    const bad = await findCellIntegrityViolations(page);
    if (bad.length) {
      violations.push(...bad);
    }
  }, intervalMs);
  await trigger();
  await page.waitForTimeout(intervalMs * samples);
  clearInterval(timer);
  const finalBad = await findCellIntegrityViolations(page);
  expect([...violations, ...finalBad], JSON.stringify([...violations, ...finalBad])).toEqual([]);
}
