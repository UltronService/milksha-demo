import { expect } from '@playwright/test';
import {
  transformTranslateY,
  pollMotionSamples,
  chipMotionSampleAtSlot,
  chipMotionSampleForNumberWithLeft,
  assertNoHorizontalWhileVisible,
  prepPayload,
  readyPayload,
  applyPayload,
  assertZoneSlotOrderExact,
} from './board-column-move-helpers.mjs';
import { prepRows, readyRows, findOverlappingChipPairs, sampleChipMotionDuring } from './board-motion-7-helpers.mjs';
import { assertChipsOpaqueAndUnique } from './board-animation-helpers.mjs';

export const GRID_ROWS = 5;
export const RIGHT_TOP_SLOT = GRID_ROWS;
export const LEFT_BOTTOM_SLOT = GRID_ROWS - 1;
export const RIGHT_BOTTOM_SLOT = GRID_ROWS * 2 - 1;

export { prepPayload, readyPayload, applyPayload, assertZoneSlotOrderExact, assertChipsOpaqueAndUnique };

/** Oldest-first queue: 7 numbers fill left column + right top two cells. */
export function backfillRemovalCase(startNum, removeOffset = 3) {
  const numbers = Array.from({ length: 7 }, (_, i) => startNum + i);
  const removeNum = String(startNum + removeOffset);
  const afterNumbers = numbers.filter((n) => String(n) !== removeNum);
  const cellsBefore = layoutCells(numbers);
  const backfillNum = cellsBefore[RIGHT_TOP_SLOT]?.number ?? null;
  const rightColFollower = cellsBefore[RIGHT_TOP_SLOT + 1]?.number ?? null;
  return {
    numbers,
    afterNumbers,
    removeNum,
    backfillNum,
    rightColFollower,
  };
}

function layoutCells(numberList) {
  const items = numberList.map((n) => ({ id: 'store:' + n, number: String(n) }));
  const cells = new Array(10).fill(null);
  for (let i = 0; i < items.length && i < 10; i += 1) {
    cells[i] = items[i];
  }
  return cells;
}

export function zoneRows(zone, startNum, count) {
  return zone === 'prep' ? prepRows(startNum, count) : readyRows(startNum, count);
}

export function zoneRowsWithout(zone, startNum, count, removeNum) {
  return zoneRows(zone, startNum, count).filter((r) => r.number !== String(removeNum));
}

export function assertUpwardExitFade(samples) {
  const valid = samples.filter(Boolean);
  expect(valid.length, 'expected upward exit samples').toBeGreaterThan(0);
  const tops = valid.map((s) => s.top);
  const delta = Math.max(...tops) - Math.min(...tops);
  const upward =
    valid.some((s) => transformTranslateY(s.transform) < -8) ||
    (delta > 12 && Math.min(...tops) < Math.max(...tops) - 8);
  const faded = valid.some((s) => Number.parseFloat(s.opacity) < 0.85);
  expect(upward || faded, JSON.stringify(valid)).toBe(true);
  const forHorizontal = valid.filter((s) => s.float) ;
  assertNoHorizontalWhileVisible(forHorizontal.length ? forHorizontal : valid);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zone
 * @param {string} itemId
 * @param {() => Promise<void>} trigger
 */
export async function assertBackfillChipStaysInCreamEveryFrame(page, zone, itemId, trigger) {
  await page.evaluate(
    ({ zoneKey, id }) => {
      window.__backfillCreamViolations = [];
      window.__backfillCreamWatch = true;
      function creamRectForZoneEl(zoneEl) {
        const cream = zoneEl.querySelector('.milksha-cream');
        if (cream) {
          return cream.getBoundingClientRect();
        }
        const art = window.QMS?.Board?.LandscapeArtLayout;
        const canvas = document.getElementById('milksha-board-canvas');
        if (!art || !canvas) {
          return null;
        }
        const zk = zoneEl.classList.contains('milksha-ready') ? 'ready' : 'prep';
        const boardCream = art.creamRectForZone(zk);
        const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
        const scale = m ? Number(m[1]) : 1;
        const cRect = canvas.getBoundingClientRect();
        return {
          left: cRect.left + boardCream.left * scale,
          top: cRect.top + boardCream.top * scale,
          right: cRect.left + (boardCream.left + boardCream.width) * scale,
          bottom: cRect.top + (boardCream.top + boardCream.height) * scale,
        };
      }
      function tick() {
        if (!window.__backfillCreamWatch) {
          return;
        }
        const zoneSel = zoneKey === 'prep' ? '.milksha-zone.milksha-prep' : '.milksha-zone.milksha-ready';
        const zoneEl = document.querySelector(zoneSel);
        const cr = zoneEl ? creamRectForZoneEl(zoneEl) : null;
        const chips = zoneEl
          ? [...zoneEl.querySelectorAll('.milksha-board-chip[data-item-id="' + id + '"]')]
          : [];
        for (const chip of chips) {
          const opacity = Number.parseFloat(getComputedStyle(chip).opacity);
          if (!Number.isFinite(opacity) || opacity < 0.02) {
            continue;
          }
          if (!cr) {
            window.__backfillCreamViolations.push({ reason: 'no-cream-rect' });
            continue;
          }
          const r = chip.getBoundingClientRect();
          if (r.left < cr.left || r.top < cr.top || r.right > cr.right || r.bottom > cr.bottom) {
            window.__backfillCreamViolations.push({ id, opacity, chip: r, cream: cr });
          }
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    },
    { zoneKey: zone, id: itemId },
  );
  await trigger();
  await page.waitForTimeout(2200);
  const violations = await page.evaluate(() => {
    window.__backfillCreamWatch = false;
    return window.__backfillCreamViolations || [];
  });
  expect(violations, JSON.stringify(violations.slice(0, 5))).toEqual([]);
}

export function assertEnterFromBelowMotion(samples) {
  const valid = samples.filter(Boolean);
  expect(valid.length, 'expected enter-from-below samples').toBeGreaterThan(0);
  const tops = valid.map((s) => s.top);
  const delta = Math.max(...tops) - Math.min(...tops);
  const fromBelow =
    valid.some((s) => transformTranslateY(s.transform) > 4) ||
    (delta > 8 && Math.max(...tops) > Math.min(...tops) + 4);
  const fadedIn = valid.some(
    (s) => Number.parseFloat(s.opacity) < 0.92 && Number.parseFloat(s.opacity) > 0.05,
  );
  expect(fromBelow || fadedIn, JSON.stringify(valid)).toBe(true);
  assertNoHorizontalWhileVisible(valid);
}

export function assertVerticalSlideUp(samples) {
  const valid = samples.filter(Boolean);
  expect(valid.length).toBeGreaterThan(0);
  const tops = valid.map((s) => s.top);
  const delta = Math.max(...tops) - Math.min(...tops);
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);
  const up =
    valid.some((s) => transformTranslateY(s.transform) < -6) ||
    maxTop - minTop > 8;
  expect(up, JSON.stringify(valid)).toBe(true);
  assertNoHorizontalWhileVisible(valid);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zone
 */
/** Sample motion at a grid slot (float-friendly, exit-clone aware). */
export async function chipMotionSampleColumnSlot(page, zone, idx) {
  return page.evaluate(
    ({ zoneKey, slotIdx }) => {
      const zoneSel = zoneKey === 'prep' ? '.milksha-zone.milksha-prep' : '.milksha-zone.milksha-ready';
      const zoneEl = document.querySelector(zoneSel);
      if (!zoneEl) {
        return null;
      }
      const cells = [...zoneEl.querySelectorAll('.milksha-num-cell')];
      const cell = cells[slotIdx];
      if (!cell) {
        return null;
      }
      const cr = cell.getBoundingClientRect();
      const chips = [...zoneEl.querySelectorAll('.milksha-board-chip')].filter((el) => {
        const r = el.getBoundingClientRect();
        return Math.abs(r.left - cr.left) < 50;
      });
      const pick =
        chips.find((el) => el.getAttribute('data-column-move-exit-clone') === '1') ||
        chips.find((el) => el.classList.contains('milksha-board-chip--layer-float')) ||
        chips.find((el) => !el.classList.contains('milksha-board-chip--layer-float'));
      if (!pick) {
        return null;
      }
      const cs = getComputedStyle(pick);
      const r = pick.getBoundingClientRect();
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        top: r.top,
        left: r.left,
        float: pick.classList.contains('milksha-board-chip--layer-float'),
      };
    },
    { zoneKey: zone, slotIdx: idx },
  );
}

export async function chipMotionSampleRightTop(page, zone) {
  return chipMotionSampleColumnSlot(page, zone, RIGHT_TOP_SLOT);
}

export async function chipMotionSampleByNumberAny(page, zone, num) {
  return page.evaluate(
    ({ zoneKey, n }) => {
      const zoneSel = zoneKey === 'prep' ? '.milksha-zone.milksha-prep' : '.milksha-zone.milksha-ready';
      const zoneEl = document.querySelector(zoneSel);
      if (!zoneEl) {
        return null;
      }
      const chips = [...zoneEl.querySelectorAll('.milksha-board-chip')].filter(
        (el) => el.getAttribute('data-item-id') === 'store:' + n,
      );
      const pick =
        chips.find((el) => el.classList.contains('milksha-board-chip--layer-float')) || chips[0];
      if (!pick) {
        return null;
      }
      const cs = getComputedStyle(pick);
      const r = pick.getBoundingClientRect();
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        top: r.top,
        left: r.left,
        float: pick.classList.contains('milksha-board-chip--layer-float'),
      };
    },
    { zoneKey: zone, n: String(num) },
  );
}

export async function chipMotionSampleLeftBottomMotion(page, zone, backfillNum) {
  const slot = await chipMotionSampleAtSlot(page, zone, LEFT_BOTTOM_SLOT);
  const byNum = await page.evaluate(
    ({ zoneKey, num }) => {
      const zoneSel = zoneKey === 'prep' ? '.milksha-zone.milksha-prep' : '.milksha-zone.milksha-ready';
      const zoneEl = document.querySelector(zoneSel);
      if (!zoneEl) {
        return null;
      }
      const chips = [...zoneEl.querySelectorAll('.milksha-board-chip')].filter(
        (el) => el.getAttribute('data-item-id') === 'store:' + num,
      );
      const pick = chips[0];
      if (!pick) {
        return null;
      }
      const cs = getComputedStyle(pick);
      const r = pick.getBoundingClientRect();
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        top: r.top,
        left: r.left,
        float: pick.classList.contains('milksha-board-chip--layer-float'),
      };
    },
    { zoneKey: zone, num: String(backfillNum) },
  );
  if (!slot) {
    return byNum;
  }
  if (!byNum) {
    return slot;
  }
  const slotTy = Math.abs(transformTranslateY(slot.transform));
  const numTy = Math.abs(transformTranslateY(byNum.transform));
  return numTy >= slotTy ? byNum : slot;
}

export async function pollPayloadMotionSamples(page, beforeRows, afterRows, sampleFn, opts) {
  await applyPayload(page, beforeRows);
  await page.waitForTimeout(500);
  return pollMotionSamples(
    page,
    () => applyPayload(page, afterRows),
    sampleFn,
    opts ?? { samples: 80, intervalMs: 16 },
  );
}

export async function pollBackfillRemoval(page, zone, startNum, removeNum, sampleFn) {
  const before = zoneRows(zone, startNum, 7);
  const after = zoneRowsWithout(zone, startNum, 7, removeNum);
  await applyPayload(page, before);
  await page.waitForTimeout(400);
  return pollMotionSamples(
    page,
    () => applyPayload(page, after),
    sampleFn,
    { samples: 72, intervalMs: 16 },
  );
}

export async function assertNoOverlapDuringBackfill(page, zone, startNum, removeNum) {
  const before = zoneRows(zone, startNum, 7);
  const after = zoneRowsWithout(zone, startNum, 7, removeNum);
  await applyPayload(page, before);
  await page.waitForTimeout(400);
  const hits = [];
  const poll = (async () => {
    for (let i = 0; i < 28; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const pairs = await findOverlappingChipPairs(page);
      if (pairs.length) {
        hits.push(...pairs.filter((p) => p.zone.includes(zone)));
      }
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(20);
    }
  })();
  await applyPayload(page, after);
  await poll;
  expect(hits, JSON.stringify(hits)).toEqual([]);
}

export async function assertVerticalOnlyWhileVisible(page, zone, startNum, removeNum) {
  const { backfillNum, rightColFollower } = backfillRemovalCase(startNum, removeNum - startNum);
  const trackNums = [backfillNum, rightColFollower].filter(Boolean).map(String);
  const before = zoneRows(zone, startNum, 7);
  const after = zoneRowsWithout(zone, startNum, 7, removeNum);
  await applyPayload(page, before);
  await page.waitForTimeout(400);
  const sampling = sampleChipMotionDuring(page, 520, 35);
  await applyPayload(page, after);
  const samples = await sampling;
  for (const num of trackNums) {
    const points = [];
    for (const frame of samples) {
      const c = frame.chips.find(
        (x) =>
          x.num === num &&
          x.zone.includes(zone) &&
          Number.parseFloat(x.opacity) > 0.2,
      );
      if (c) {
        points.push(c);
      }
    }
    let prevLeft = null;
    for (const p of points) {
      if (Number.parseFloat(p.opacity) <= 0.85) {
        prevLeft = null;
        continue;
      }
      if (prevLeft !== null) {
        expect(Math.abs(p.left - prevLeft), `${num} horizontal drift ${JSON.stringify(p)}`).toBeLessThan(2);
      }
      prevLeft = p.left;
    }
  }
}

export async function assertOneChipPerCellDuringBackfill(page, zone, startNum, removeNum) {
  const before = zoneRows(zone, startNum, 7);
  const after = zoneRowsWithout(zone, startNum, 7, removeNum);
  await applyPayload(page, before);
  await page.waitForTimeout(400);
  const violations = [];
  const poll = (async () => {
    for (let i = 0; i < 26; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const v = await page.evaluate((zoneKey) => {
        const zoneSel = zoneKey === 'prep' ? '.milksha-zone.milksha-prep' : '.milksha-zone.milksha-ready';
      const zoneEl = document.querySelector(zoneSel);
        if (!zoneEl) {
          return [];
        }
        const out = [];
        const cells = [...zoneEl.querySelectorAll('.milksha-num-cell')];
        cells.forEach((cell, idx) => {
          const chips = [...cell.querySelectorAll('.milksha-board-chip')].filter((el) => {
            const o = Number.parseFloat(getComputedStyle(el).opacity);
            return (Number.isFinite(o) ? o : 1) > 0.15;
          });
          if (chips.length > 1) {
            out.push({ idx, count: chips.length });
          }
        });
        return out;
      }, zone);
      if (v.length) {
        violations.push(...v);
      }
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(22);
    }
  })();
  await applyPayload(page, after);
  await poll;
  expect(violations, JSON.stringify(violations)).toEqual([]);
}

export async function sampleLeftBottomEnter(page, zone, backfillNum) {
  const slot = await chipMotionSampleAtSlot(page, zone, LEFT_BOTTOM_SLOT);
  const byId = await chipMotionSampleForNumberWithLeft(page, zone, backfillNum);
  if (!slot) {
    return byId;
  }
  if (!byId) {
    return slot;
  }
  const slotTy = Math.abs(transformTranslateY(slot.transform));
  const idTy = Math.abs(transformTranslateY(byId.transform));
  return slotTy >= idTy ? slot : byId;
}
