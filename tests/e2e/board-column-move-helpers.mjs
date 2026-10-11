import { expect } from '@playwright/test';
import { prepNumbers, readyNumbers } from './board-animation-helpers.mjs';

const GRID_ROWS = 5;

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zone
 * @param {number} slotIndex 0-based cell index in zone grid
 */
export async function chipMotionSampleForNumber(page, zone, number) {
  return page.evaluate(
    ({ zoneKey, num }) => {
      const zoneEl = document.querySelector('.milksha-zone.' + zoneKey);
      if (!zoneEl) {
        return null;
      }
      const chip = zoneEl.querySelector('.milksha-board-chip[data-item-id="store:' + num + '"]');
      if (!chip || chip.classList.contains('milksha-board-chip--layer-float')) {
        return null;
      }
      const cs = getComputedStyle(chip);
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        top: chip.getBoundingClientRect().top,
        float: false,
      };
    },
    { zoneKey: zone, num: String(number) },
  );
}

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
        const fr = float.getBoundingClientRect();
        return {
          opacity: cs.opacity,
          transform: cs.transform,
          top: fr.top,
          left: fr.left,
          float: true,
        };
      }
      const cs = getComputedStyle(chip);
      const cr = chip.getBoundingClientRect();
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        top: cr.top,
        left: cr.left,
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
  return out;
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

/** Payload order oldest→newest: left-bottom before overflow is always the first entry. */
export function leftBottomNumber(numbers) {
  return String(numbers[0]);
}

export function assertNoHorizontalWhileVisible(samples) {
  let prevLeft = null;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s || Number.parseFloat(s.opacity) <= 0.85) {
      prevLeft = null;
      continue;
    }
    if (prevLeft !== null) {
      expect(Math.abs(s.left - prevLeft), JSON.stringify(s)).toBeLessThan(2);
    }
    prevLeft = s.left;
  }
}

export function assertPushedChipExitThenEnter(samples) {
  const down = samples.some(
    (s) =>
      s &&
      (s.float === true ||
        transformTranslateY(s.transform) > 8 ||
        Number.parseFloat(s.opacity) < 0.85),
  );
  expect(down, 'expected down-out phase on pushed chip').toBe(true);
  const enter = samples.some((s) => s && transformTranslateY(s.transform) < -4);
  const settle = samples.some((s) => s && Math.abs(transformTranslateY(s.transform)) < 2);
  expect(enter || settle, JSON.stringify(samples)).toBe(true);
}

export async function pushedOverflowMotionSample(page, zone, pushedNumber) {
  const slot4 = await chipMotionSampleAtSlot(page, zone, GRID_ROWS - 1);
  if (
    slot4 &&
    (slot4.float ||
      Number.parseFloat(slot4.opacity) < 0.9 ||
      transformTranslateY(slot4.transform) > 4)
  ) {
    return slot4;
  }
  return chipMotionSampleForNumberWithLeft(page, zone, pushedNumber);
}

export async function chipMotionSampleForNumberWithLeft(page, zone, number) {
  return page.evaluate(
    ({ zoneKey, num }) => {
      const zoneEl = document.querySelector('.milksha-zone.' + zoneKey);
      const chip = zoneEl?.querySelector('.milksha-board-chip[data-item-id="store:' + num + '"]');
      if (!chip || chip.classList.contains('milksha-board-chip--layer-float')) {
        return null;
      }
      const cs = getComputedStyle(chip);
      const r = chip.getBoundingClientRect();
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        top: r.top,
        left: r.left,
        float: false,
      };
    },
    { zoneKey: zone, num: String(number) },
  );
}

export async function assertZoneSlotOrderExact(page, zone) {
  const expected = await page.evaluate((zoneKey) => {
    const snap = window.QMS.runtime.getSnapshot();
    const list = zoneKey === 'prep' ? snap.preparing : snap.ready;
    const cells = window.QMS.MilkshaBoard.layoutPageGrid(list, 0, window.QMS.MilkshaBoard.PAGE_SIZE);
    return cells.filter(Boolean).map((c) => c.number);
  }, zone);
  const bySlot = await page.evaluate((zoneKey) => {
    const zoneEl = document.querySelector('.milksha-zone.' + zoneKey);
    const cells = [...zoneEl.querySelectorAll('.milksha-num-cell')];
    return cells.map((cell) => {
      const chip = cell.querySelector('.milksha-board-chip:not(.milksha-board-chip--layer-float)');
      return chip?.querySelector('.milksha-num')?.textContent?.trim() || '';
    });
  }, zone);
  const visible = bySlot.filter(Boolean);
  expect(visible).toEqual(expected.filter(Boolean));
}

export async function assertReadyPulseOnNumber(page, number) {
  const itemId = 'store:' + number;
  const cfg = await page.evaluate(() => window.QMS.MilkshaBoardAnimConfig.getConfig());
  const windowMs = cfg.readyScaleInMs + cfg.readyScaleHoldMs + cfg.readyScaleOutMs + 500;
  await page.waitForFunction(
    ({ id, min }) => {
      const el = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
      if (!el) {
        return false;
      }
      const tr = getComputedStyle(el).transform;
      const m = tr.match(/matrix\(([^)]+)\)/);
      const s = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
      return s >= min;
    },
    { id: itemId, min: 1.26 },
    { timeout: windowMs },
  );
}

export function sequentialNumbers(base, count) {
  return Array.from({ length: count }, (_, i) => base + i);
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
