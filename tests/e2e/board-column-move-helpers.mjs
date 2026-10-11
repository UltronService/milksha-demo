import { expect } from '@playwright/test';
import { prepNumbers, readyNumbers } from './board-animation-helpers.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zone
 * @param {number} slotIndex 0-based cell index in zone grid
 */
export async function chipMotionSampleAtSlot(page, zone, slotIndex) {
  return page.evaluate(
    ({ zoneKey, idx }) => {
      const zoneEl = document.querySelector('.milksha-zone.' + zoneKey);
      if (!zoneEl) {
        return null;
      }
      const cells = [...zoneEl.querySelectorAll('.milksha-num-cell')];
      const cell = cells[idx];
      if (!cell) {
        return null;
      }
      const chip = cell.querySelector('.milksha-board-chip:not(.milksha-board-chip--layer-float)');
      if (!chip) {
        const floats = [...zoneEl.querySelectorAll('.milksha-board-chip--layer-float')];
        const float = floats.find((el) => {
          const r = el.getBoundingClientRect();
          const cr = cell.getBoundingClientRect();
          return Math.abs(r.left - cr.left) < 40 && Math.abs(r.top - cr.top) < 80;
        });
        if (!float) {
          return null;
        }
        const cs = getComputedStyle(float);
        return {
          opacity: cs.opacity,
          transform: cs.transform,
          top: float.getBoundingClientRect().top,
          float: true,
        };
      }
      const cs = getComputedStyle(chip);
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        top: chip.getBoundingClientRect().top,
        float: false,
      };
    },
    { zoneKey: zone, idx: slotIndex },
  );
}

/**
 * @param {string | null | undefined} transform
 */
export function transformTranslateY(transform) {
  if (!transform || transform === 'none') {
    return 0;
  }
  const m = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),\s*([^)]+)\)/);
  if (m) {
    return Number.parseFloat(m[2]) || 0;
  }
  const t = transform.match(/translate\([^,]*,\s*([^)]+)\)/);
  if (t) {
    return Number.parseFloat(t[1]) || 0;
  }
  return 0;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} trigger
 * @param {() => Promise<object | null>} sample
 * @param {{ samples?: number, intervalMs?: number }} [opts]
 */
export async function pollMotionSamples(page, trigger, sample, opts = {}) {
  const samples = opts.samples ?? 20;
  const intervalMs = opts.intervalMs ?? 16;
  const out = [];
  const poll = (async () => {
    for (let i = 0; i < samples; i += 1) {
      out.push(await sample());
      await page.waitForTimeout(intervalMs);
    }
  })();
  await trigger();
  await poll;
  return out.filter(Boolean);
}

export function assertDownwardExitMotion(samples) {
  const tops = samples.map((s) => s.top);
  const delta = Math.max(...tops) - Math.min(...tops);
  const movedDown = samples.some((s) => transformTranslateY(s.transform) > 8) || delta > 12;
  const faded = samples.some((s) => Number.parseFloat(s.opacity) < 0.85);
  expect(movedDown || faded, JSON.stringify(samples)).toBe(true);
}

export function assertEnterFromAboveMotion(samples) {
  const tops = samples.map((s) => s.top);
  const delta = Math.max(...tops) - Math.min(...tops);
  const fromAbove =
    samples.some((s) => transformTranslateY(s.transform) < -8) || delta > 12;
  expect(fromAbove, JSON.stringify(samples)).toBe(true);
}

export function prepPayload(numbers) {
  return numbers.map((number) => ({ source_type: 'From_Store_Preparing', number: String(number) }));
}

export function readyPayload(numbers) {
  return numbers.map((number) => ({ source_type: 'From_Store_OK', number: String(number) }));
}

export async function applyPayload(page, rows) {
  await page.evaluate((payload) => {
    window.QMS.runtime.applyPayload(payload);
  }, rows);
}

/** Assert visible zone numbers match layout queue ( multiset ; art grid DOM index may differ). */
export async function assertZoneNumberSet(page, zone, numbers) {
  const expected = numbers.map(String).sort();
  const got =
    zone === 'prep'
      ? (await prepNumbers(page)).map((t) => t.trim())
      : (await readyNumbers(page)).map((t) => t.trim());
  expect(got.slice().sort()).toEqual(expected);
  expect(got.length).toBe(expected.length);
}

/** layoutPageGrid slot order for a queue of numbers (public layout API). */
export async function layoutQueueNumbers(page, numbers) {
  return page.evaluate((nums) => {
    const MB = window.QMS.MilkshaBoard;
    const items = nums.map((n) => ({ id: 'store:' + n, number: String(n) }));
    const cells = MB.layoutPageGrid(items, 0, MB.PAGE_SIZE);
    const positions = MB.gridPositionsForCells(cells);
    positions.sort((a, b) => a.index - b.index);
    return positions.map((p) => p.number);
  }, numbers);
}
