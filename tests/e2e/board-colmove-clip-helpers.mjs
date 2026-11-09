import { expect } from '@playwright/test';

/** QA checklist A.3: tolerance 0 */
export const QA_TOLERANCE_PX = 0;
const VISIBLE_OPACITY_MIN = 0.08;

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zone
 * @param {{ trackItemIds?: string[] | null, tolerancePx?: number, includeExitClones?: boolean }} [opts]
 */
export async function startColumnMoveQaProbe(page, zone, opts = {}) {
  const trackItemIds = opts.trackItemIds ?? null;
  const tol = opts.tolerancePx ?? QA_TOLERANCE_PX;
  const includeExitClones = opts.includeExitClones !== false;

  await page.evaluate(
    ({ zoneKey, itemIds, tolerancePx, includeClones, opacityMin }) => {
      window.__colmoveQaProbe = {
        active: true,
        frameCount: 0,
        violations: [],
        trackItemIds: itemIds,
        prevChipCenters: {},
      };

      const zoneEl = document.querySelector('.milksha-zone.' + zoneKey);
      const numbersLayer = zoneEl?.querySelector('.milksha-zone-numbers');

      function getClipAndTitleRects() {
        if (!zoneEl) {
          return null;
        }
        const creamEl = zoneEl.querySelector('.milksha-cream');
        const titleEl = zoneEl.querySelector('.milksha-ztitle');
        if (creamEl) {
          return {
            clip: creamEl.getBoundingClientRect(),
            title: titleEl ? titleEl.getBoundingClientRect() : null,
          };
        }
        const art = window.QMS?.Board?.LandscapeArtLayout;
        const canvas = document.getElementById('milksha-board-canvas');
        if (!art || !canvas) {
          return null;
        }
        const zoneKeyInner = zoneEl.classList.contains('prep') ? 'prep' : 'ready';
        const c = art.creamRectForZone(zoneKeyInner);
        const canvasRect = canvas.getBoundingClientRect();
        const designW = 1920;
        const scale = canvasRect.width / designW;
        const clip = {
          left: canvasRect.left + c.left * scale,
          top: canvasRect.top + c.top * scale,
          right: canvasRect.left + (c.left + c.width) * scale,
          bottom: canvasRect.top + (c.top + c.height) * scale,
        };
        const zoneRect = zoneEl.getBoundingClientRect();
        const title = {
          left: zoneRect.left,
          top: zoneRect.top,
          right: zoneRect.right,
          bottom: clip.top,
        };
        return { clip, title };
      }

      function rectIntersectionArea(a, b) {
        const left = Math.max(a.left, b.left);
        const right = Math.min(a.right, b.right);
        const top = Math.max(a.top, b.top);
        const bottom = Math.min(a.bottom, b.bottom);
        if (right <= left || bottom <= top) {
          return 0;
        }
        return (right - left) * (bottom - top);
      }

      function isVisibleChip(chip) {
        const opacity = Number.parseFloat(getComputedStyle(chip).opacity);
        if (Number.isNaN(opacity) || opacity <= opacityMin) {
          return false;
        }
        const r = chip.getBoundingClientRect();
        return r.width >= 2 && r.height >= 2;
      }

      function sampleFrame() {
        const probe = window.__colmoveQaProbe;
        if (!probe || !probe.active) {
          return;
        }
        probe.frameCount += 1;
        if (!zoneEl || !numbersLayer) {
          probe.violations.push({ kind: 'missing-dom', frame: probe.frameCount });
          requestAnimationFrame(sampleFrame);
          return;
        }
        const layout = getClipAndTitleRects();
        if (!layout) {
          probe.violations.push({ kind: 'missing-dom', frame: probe.frameCount });
          requestAnimationFrame(sampleFrame);
          return;
        }
        const creamR = layout.clip;
        const titleR = layout.title;
        const allChips = [...zoneEl.querySelectorAll('.milksha-board-chip')].filter((chip) => {
          if (!includeClones && chip.getAttribute('data-column-move-exit-clone') === '1') {
            return false;
          }
          return isVisibleChip(chip);
        });

        for (let i = 0; i < allChips.length; i += 1) {
          const chip = allChips[i];
          const id = chip.getAttribute('data-item-id') || chip.getAttribute('data-column-move-exit-clone') || 'clone';
          if (itemIds && itemIds.length && id.startsWith('store:') && !itemIds.includes(id)) {
            continue;
          }
          const r = chip.getBoundingClientRect();
          const titleOverlap = titleR ? rectIntersectionArea(r, titleR) : 0;
          if (titleOverlap > tolerancePx) {
            probe.violations.push({ kind: 'title-overlap', frame: probe.frameCount, id, titleOverlap });
          }
          if (
            r.top < creamR.top - tolerancePx ||
            r.left < creamR.left - tolerancePx ||
            r.right > creamR.right + tolerancePx ||
            r.bottom > creamR.bottom + tolerancePx
          ) {
            probe.violations.push({
              kind: 'outside-cream',
              frame: probe.frameCount,
              id,
              chip: { top: r.top, left: r.left, right: r.right, bottom: r.bottom },
              cream: { top: creamR.top, left: creamR.left, right: creamR.right, bottom: creamR.bottom },
            });
          }

          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          const prev = probe.prevChipCenters[id];
          if (prev && id.startsWith('store:')) {
            const dLeft = Math.abs(cx - prev.cx);
            const dTop = Math.abs(cy - prev.cy);
            if (dLeft > tolerancePx && dTop > tolerancePx) {
              probe.violations.push({
                kind: 'diagonal-move',
                frame: probe.frameCount,
                id,
                dLeft,
                dTop,
              });
            }
          }
          if (id.startsWith('store:')) {
            probe.prevChipCenters[id] = { cx, cy };
          }
        }

        for (let a = 0; a < allChips.length; a += 1) {
          for (let b = a + 1; b < allChips.length; b += 1) {
            const ra = allChips[a].getBoundingClientRect();
            const rb = allChips[b].getBoundingClientRect();
            const overlap = rectIntersectionArea(ra, rb);
            if (overlap > tolerancePx) {
              probe.violations.push({
                kind: 'chip-overlap',
                frame: probe.frameCount,
                a: allChips[a].getAttribute('data-item-id') || 'clone-a',
                b: allChips[b].getAttribute('data-item-id') || 'clone-b',
                overlap,
              });
            }
          }
        }

        const cells = [...zoneEl.querySelectorAll('.milksha-num-cell')];
        for (let ci = 0; ci < cells.length; ci += 1) {
          const cellR = cells[ci].getBoundingClientRect();
          const occupants = allChips.filter((chip) => rectIntersectionArea(chip.getBoundingClientRect(), cellR) > tolerancePx);
          if (occupants.length >= 2) {
            probe.violations.push({
              kind: 'cell-double-occupy',
              frame: probe.frameCount,
              slot: ci,
              ids: occupants.map((c) => c.getAttribute('data-item-id') || 'clone'),
            });
          }
        }

        requestAnimationFrame(sampleFrame);
      }

      requestAnimationFrame(sampleFrame);
    },
    {
      zoneKey: zone,
      itemIds: trackItemIds,
      tolerancePx: tol,
      includeClones: includeExitClones,
      opacityMin: VISIBLE_OPACITY_MIN,
    },
  );
}

/** @returns {Promise<{ frameCount: number, violations: object[] }>} */
export async function stopColumnMoveQaProbe(page, settleMs = 520) {
  await page.waitForTimeout(settleMs);
  return page.evaluate(() => {
    const probe = window.__colmoveQaProbe;
    if (!probe) {
      return { frameCount: 0, violations: [{ kind: 'probe-missing' }] };
    }
    probe.active = false;
    return { frameCount: probe.frameCount, violations: probe.violations.slice() };
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zone
 * @param {() => Promise<void>} trigger
 * @param {{ settleMs?: number, trackItemIds?: string[] | null }} [opts]
 */
export async function assertQaMotionBoundaryDuringColumnMove(page, zone, trigger, opts = {}) {
  await startColumnMoveQaProbe(page, zone, {
    trackItemIds: opts.trackItemIds ?? null,
    tolerancePx: QA_TOLERANCE_PX,
    includeExitClones: true,
  });
  await trigger();
  const result = await stopColumnMoveQaProbe(page, opts.settleMs ?? 520);
  expect(result.frameCount, 'expected rAF samples during column-move window').toBeGreaterThan(8);
  expect(result.violations, JSON.stringify(result.violations.slice(0, 12), null, 2)).toEqual([]);
  return result;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zone
 * @param {string} pushedNumber
 * @param {() => Promise<void>} trigger
 * @param {{ settleMs?: number }} [opts]
 */
export async function assertChipStaysInsideCreamDuringColumnMove(page, zone, pushedNumber, trigger, opts = {}) {
  const chipItemId = 'store:' + String(pushedNumber);
  return assertQaMotionBoundaryDuringColumnMove(page, zone, trigger, {
    settleMs: opts.settleMs,
    trackItemIds: [chipItemId],
  });
}

/** @returns {Promise<{ frameCount: number, violations: object[], byKind: Record<string, number> }>} */
export async function runQaProbeCollectOnly(page, zone, trigger, settleMs = 520) {
  await startColumnMoveQaProbe(page, zone, { trackItemIds: null, tolerancePx: QA_TOLERANCE_PX });
  await trigger();
  const result = await stopColumnMoveQaProbe(page, settleMs);
  const byKind = {};
  for (const v of result.violations) {
    byKind[v.kind] = (byKind[v.kind] || 0) + 1;
  }
  return { ...result, byKind };
}
