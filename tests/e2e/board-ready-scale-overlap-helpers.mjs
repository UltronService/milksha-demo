import { expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';

export const PULSE_NUMBERS = ['9999', '9998', '9997', '9996', '9995', '9994', '9993', '9992', '9991', '9990'];

export function itemIdForNumber(num) {
  return `store:${num}`;
}

export function numberForCellIndex(cellIndex) {
  return PULSE_NUMBERS[cellIndex];
}

export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function rectFromDom(r) {
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
}

export async function waitForPulseHold(page, itemId, expectedScale = 1.3) {
  const inMs = await page.evaluate(() => window.QMS.MilkshaBoardAnimConfig.getConfig().readyScaleInMs);
  await page.waitForTimeout(inMs + 100);
  await page.waitForFunction(
    ({ id, min, max }) => {
      const el = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
      if (!el) {
        return false;
      }
      const tr = getComputedStyle(el).transform;
      const m = tr.match(/matrix\(([^)]+)\)/);
      const s = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
      return s >= min && s <= max;
    },
    { id: itemId, min: expectedScale - 0.04, max: expectedScale + 0.04 },
    { timeout: 12000 },
  );
}

/** Prep one cell's number, then all ready — re-pulse at that cell without changing layout. */
export async function triggerPulseAtCell(page, cellIndex) {
  const target = numberForCellIndex(cellIndex);
  await page.evaluate((num) => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    const batch = [];
    for (let i = 0; i < 10; i += 1) {
      const n = String(9990 + i);
      if (n === num) {
        batch.push({ source_type: 'From_Store_Preparing', number: n });
      } else {
        batch.push({ source_type: 'From_Store_OK', number: n });
      }
    }
    window.QMS.runtime.applyPayload(batch, { silent: true });
    const all = [];
    for (let i = 0; i < 10; i += 1) {
      all.push({ source_type: 'From_Store_OK', number: String(9990 + i) });
    }
    window.QMS.runtime.applyPayload(all);
  }, target);
}

export async function measurePulseOverlap(page, pulseItemId) {
  return page.evaluate((id) => {
    const pulse = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
    const zone = document.querySelector('.milksha-zone.ready');
    if (!pulse || !zone) {
      return { ok: false, reason: 'missing pulse or zone' };
    }
    const tr = getComputedStyle(pulse).transform;
    const m = tr.match(/matrix\(([^)]+)\)/);
    const scale = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
    const r = pulse.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const ow = pulse.offsetWidth;
    const oh = pulse.offsetHeight;
    const expanded = {
      left: cx - (ow * scale) / 2,
      right: cx + (ow * scale) / 2,
      top: cy - (oh * scale) / 2,
      bottom: cy + (oh * scale) / 2,
    };
    const zr = zone.getBoundingClientRect();
    const zoneRect = { left: zr.left, right: zr.right, top: zr.top, bottom: zr.bottom };
    const insideZone =
      expanded.left >= zoneRect.left - 1 &&
      expanded.right <= zoneRect.right + 1 &&
      expanded.top >= zoneRect.top - 1 &&
      expanded.bottom <= zoneRect.bottom + 1;

    const cell = pulse.closest('.milksha-num-cell');
    const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
    const cells = layer ? [...layer.querySelectorAll('.milksha-num-cell')] : [];
    const cellIndex = cell ? cells.indexOf(cell) : -1;

    const others = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')].filter(
      (el) => el.getAttribute('data-item-id') !== id,
    );
    let minNeighborGapPx = Infinity;
    const overlaps = [];
    for (let i = 0; i < others.length; i += 1) {
      const o = others[i].getBoundingClientRect();
      const other = { left: o.left, right: o.right, top: o.top, bottom: o.bottom };
      const gap = Math.max(expanded.top - other.bottom, other.top - expanded.bottom, expanded.left - other.right, other.left - expanded.right, 0);
      minNeighborGapPx = Math.min(minNeighborGapPx, gap);
      if (
        expanded.left < other.right &&
        expanded.right > other.left &&
        expanded.top < other.bottom &&
        expanded.bottom > other.top
      ) {
        overlaps.push({
          id: others[i].getAttribute('data-item-id'),
          number: others[i].querySelector('.milksha-num')?.textContent,
        });
      }
    }
    if (!Number.isFinite(minNeighborGapPx)) {
      minNeighborGapPx = null;
    }
    return {
      ok: true,
      scale: Math.round(scale * 1000) / 1000,
      cellIndex,
      number: pulse.querySelector('.milksha-num')?.textContent,
      minNeighborGapPx: minNeighborGapPx === null ? null : Math.round(minNeighborGapPx * 10) / 10,
      insideZone,
      overlaps,
    };
  }, pulseItemId);
}

export async function assertNoOverlapAtHold(page, cellIndex, viewportTag) {
  const num = numberForCellIndex(cellIndex);
  const itemId = itemIdForNumber(num);
  await triggerPulseAtCell(page, cellIndex);
  await page.waitForFunction(() => document.querySelectorAll('.milksha-ready .milksha-board-chip').length === 10);
  await waitForPulseHold(page, itemId, 1.3);
  const m = await measurePulseOverlap(page, itemId);
  expect(m.ok).toBe(true);
  if (m.overlaps.length > 0 || !m.insideZone) {
    const msg = `${viewportTag} cell ${cellIndex} (${num}) scale ${m.scale}: overlaps=${JSON.stringify(m.overlaps)} insideZone=${m.insideZone} minGap=${m.minNeighborGapPx}`;
    throw new Error(msg);
  }
  return m;
}

export async function openBoardForOverlap(page) {
  await primeBoardForAnimation(page);
}
