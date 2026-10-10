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

/** @returns {Promise<{ violations: Array<object>, detachedCount: number, chipCount: number }>} */
export async function getBoardIntegritySnapshot(page) {
  return page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.milksha-num-cell').forEach((cell) => {
      const chips = [...cell.querySelectorAll('.milksha-board-chip')];
      const text = cell.textContent.replace(/\s/g, '');
      const nums = chips.map((c) => (c.querySelector('.milksha-num')?.textContent || '').trim());
      const badText = text.length > 0 && !/^\d{4}$/.test(text);
      if (chips.length !== 1 && chips.length > 0) {
        bad.push({
          kind: 'cell-chip-count',
          zone: cell.closest('.milksha-zone')?.className || '',
          chipCount: chips.length,
          text,
          nums,
        });
      }
      if (chips.length === 1 && nums[0] && !/^\d{4}$/.test(nums[0])) {
        bad.push({ kind: 'cell-format', zone: cell.closest('.milksha-zone')?.className || '', text: nums[0] });
      }
      if (badText) {
        bad.push({ kind: 'cell-text', zone: cell.closest('.milksha-zone')?.className || '', text });
      }
    });
    document.querySelectorAll('.milksha-zone').forEach((zoneEl) => {
      const nums = [...zoneEl.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float) .milksha-num')]
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      const seen = new Set();
      for (const n of nums) {
        if (!/^\d{4}$/.test(n)) {
          bad.push({ kind: 'zone-format', zone: zoneEl.className, text: n });
        }
        if (seen.has(n)) {
          bad.push({ kind: 'zone-dup', zone: zoneEl.className, text: 'dup:' + n });
        }
        seen.add(n);
      }
    });
    const detachedCount = document.querySelectorAll('.milksha-board-chip--layer-float').length;
    const chipCount = document.querySelectorAll('.milksha-board-chip').length;
    return { violations: bad, detachedCount, chipCount };
  });
}

/** @returns {Promise<Array<{ zone: string, chipCount: number, text: string }>>} */
export async function findCellIntegrityViolations(page) {
  const snap = await getBoardIntegritySnapshot(page);
  return snap.violations;
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
/**
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} trigger
 * @param {{ samples?: number, intervalMs?: number, maxDetached?: number }} [opts]
 */
export async function sampleIntegrityDuringUpdate(page, trigger, opts = {}) {
  const samples = opts.samples ?? 24;
  const intervalMs = opts.intervalMs ?? 25;
  const maxDetachedAllowed = opts.maxDetached ?? 12;
  const violations = [];
  let peakDetached = 0;
  let sampling = true;

  const sampleOnce = async () => {
    const snap = await getBoardIntegritySnapshot(page);
    peakDetached = Math.max(peakDetached, snap.detachedCount);
    if (snap.violations.length) {
      violations.push(...snap.violations);
    }
    return snap;
  };

  const poll = (async () => {
    for (let i = 0; i < samples && sampling; i += 1) {
      await sampleOnce();
      await page.waitForTimeout(intervalMs);
    }
  })();

  await trigger();
  await poll;
  sampling = false;
  const finalSnap = await sampleOnce();
  expect([...violations, ...finalSnap.violations], JSON.stringify([...violations, ...finalSnap.violations])).toEqual([]);
  expect(peakDetached, 'detached fade chips piled up').toBeLessThanOrEqual(maxDetachedAllowed);
  return { peakDetached, finalDetached: finalSnap.detachedCount };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} durationMs
 * @param {number} intervalMs
 */
export async function sampleIntegrityForDuration(page, durationMs, intervalMs = 250) {
  const end = Date.now() + durationMs;
  const violations = [];
  let peakDetached = 0;
  while (Date.now() < end) {
    const snap = await getBoardIntegritySnapshot(page);
    peakDetached = Math.max(peakDetached, snap.detachedCount);
    if (snap.violations.length) {
      violations.push(...snap.violations);
    }
    await page.waitForTimeout(intervalMs);
  }
  let finalSnap = await getBoardIntegritySnapshot(page);
  const drainDeadline = Date.now() + 3000;
  while (finalSnap.detachedCount > 0 && Date.now() < drainDeadline) {
    await page.waitForTimeout(100);
    finalSnap = await getBoardIntegritySnapshot(page);
  }
  expect(violations, JSON.stringify(violations)).toEqual([]);
  expect(finalSnap.violations, JSON.stringify(finalSnap.violations)).toEqual([]);
  expect(finalSnap.detachedCount, 'detached chips must drain after animations').toBe(0);
  return { peakDetached, finalDetached: finalSnap.detachedCount };
}
