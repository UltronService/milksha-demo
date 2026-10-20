import { test, expect } from '@playwright/test';
import { primeBoardForAnimation, getBoardIntegritySnapshot } from './board-animation-helpers.mjs';
import {
  chipPositionDrift,
  findOverlappingChipPairs,
  measurePageIndicatorInCream,
  prepRows,
  readyRows,
  sampleChipMotionDuring,
} from './board-motion-7-helpers.mjs';

const VIEW = { width: 1920, height: 1080 };

test.describe('board motion 7 diagnose (red on main)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEW);
    await primeBoardForAnimation(page);
  });

  test('item 1: page indicator inside cream frame bottom-right (prep 2 pages)', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 10));
    await page.waitForTimeout(400);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 11));
    await page.waitForTimeout(600);
    const m = await measurePageIndicatorInCream(page, 'prep');
    expect(m.ok, JSON.stringify(m)).toBe(true);
    expect(m.text).toMatch(/1\/2/);
    expect(m.insideCream, `indicator outside cream: ${JSON.stringify(m)}`).toBe(true);
    expect(m.nearBottomRight, `not bottom-right 16px: ${JSON.stringify(m)}`).toBe(true);
  });

  test('item 2: leaving ready number fades in place (no drift while fading)', async ({ page }) => {
    const base = readyRows(2100, 8);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), base);
    await page.waitForTimeout(500);
    const removeNum = '2102';
    const sampling = sampleChipMotionDuring(page, 380, 40);
    await page.evaluate(
      (rows) => window.QMS.runtime.applyPayload(rows),
      base.filter((r) => r.number !== '2102'),
    );
    const samples = await sampling;
    const { driftPx, points } = chipPositionDrift(samples, removeNum);
    const fading = points.filter((p) => Number.parseFloat(p.opacity) < 0.95);
    expect(fading.length, 'removed chip should be sampled while fading').toBeGreaterThan(0);
    expect(driftPx, `leaving chip moved ${driftPx}px while fading: ${JSON.stringify(points)}`).toBeLessThan(3);
  });

  test('item 3: ready backfill must not overlap other numbers (diagonal FLIP)', async ({ page }) => {
    const base = readyRows(2100, 7);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), base);
    await page.waitForTimeout(500);
    const poll = (async () => {
      const hits = [];
      for (let i = 0; i < 12; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const pairs = await findOverlappingChipPairs(page);
        if (pairs.length) {
          hits.push(...pairs);
        }
        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(35);
      }
      return hits;
    })();
    await page.evaluate(
      (rows) => window.QMS.runtime.applyPayload(rows),
      base.filter((r) => r.number !== '2103'),
    );
    const overlaps = await poll;
    expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
  });

  test('item 5: prep page 2→1 after shrink shows fade-in (layer not fully opaque mid turn)', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 11));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    await page.waitForTimeout(700);
    const turnPromise = page.evaluate(() => {
      return new Promise((resolve) => {
        const layer = document.querySelector('.milksha-zone.prep .milksha-zone-numbers');
        if (!layer) {
          resolve({ ok: false, reason: 'no-layer' });
          return;
        }
        let seenLow = false;
        let seenDiagonal = false;
        const obs = new MutationObserver(() => {
          const o = Number.parseFloat(getComputedStyle(layer).opacity);
          if (Number.isFinite(o) && o < 0.85 && o > 0.05) {
            seenLow = true;
          }
        });
        obs.observe(layer, { childList: true, subtree: true, attributes: true });
        const chipsObs = new MutationObserver(() => {
          document.querySelectorAll('.milksha-zone.prep .milksha-board-chip').forEach((chip) => {
            const t = getComputedStyle(chip).transform;
            if (t && t !== 'none' && /matrix\(/.test(t)) {
              const m = t.match(/matrix\(([^)]+)\)/);
              if (m) {
                const parts = m[1].split(',').map((x) => Number.parseFloat(x.trim()));
                const tx = parts[4] || 0;
                const ty = parts[5] || 0;
                if (Math.abs(tx) > 40 && Math.abs(ty) > 40) {
                  seenDiagonal = true;
                }
              }
            }
          });
        });
        chipsObs.observe(layer, { childList: true, subtree: true, attributes: true });
        window.QMS.runtime.applyPayload(
          Array.from({ length: 10 }, (_, i) => ({
            source_type: 'From_Store_Preparing',
            number: String(8100 + i),
          })),
        );
        setTimeout(() => {
          obs.disconnect();
          chipsObs.disconnect();
          resolve({ ok: true, seenLow, seenDiagonal });
        }, 420);
      });
    });
    const r = await turnPromise;
    expect(r.ok).toBe(true);
    expect(r.seenLow, 'page-turn fade-in: layer should be mid-opacity during turn').toBe(true);
    expect(r.seenDiagonal, 'page shrink should not diagonal-FLIP chips').toBe(false);
  });

  test('item 6: prep layer restores after page-2-only item removed (no ~1s blank)', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 11));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    await page.waitForTimeout(700);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 10));
    await page.waitForTimeout(1100);
    const state = await page.evaluate(() => {
      const layer = document.querySelector('.milksha-zone.prep .milksha-zone-numbers');
      const layerO = layer ? Number.parseFloat(getComputedStyle(layer).opacity) : 0;
      const chips = layer ? layer.querySelectorAll('.milksha-board-chip').length : 0;
      const visible = layer
        ? [...layer.querySelectorAll('.milksha-board-chip')].filter((el) => {
            const o = Number.parseFloat(getComputedStyle(el).opacity);
            return (Number.isFinite(o) ? o : 1) > 0.35;
          }).length
        : 0;
      return { layerO, chips, visible };
    });
    expect(state.chips, JSON.stringify(state)).toBeGreaterThan(0);
    expect(state.visible, JSON.stringify(state)).toBeGreaterThan(0);
    expect(Number.isFinite(state.layerO) ? state.layerO : 0, JSON.stringify(state)).toBeGreaterThan(0.85);
  });

  test('item 7: prep page 1→2 uses fade-in (not pop at full opacity)', async ({ page }) => {
    let popObservations = 0;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await primeBoardForAnimation(page);
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(8100, 11));
      await page.waitForTimeout(400);
      // eslint-disable-next-line no-await-in-loop
      const r = await page.evaluate(() => {
        return new Promise((resolve) => {
          const layer = document.querySelector('.milksha-zone.prep .milksha-zone-numbers');
          if (!layer) {
            resolve({ ok: false, sawPopIn: false });
            return;
          }
          let sawPopIn = false;
          const check = () => {
            const o = Number.parseFloat(getComputedStyle(layer).opacity);
            const page2Chip = [...layer.querySelectorAll('.milksha-board-chip')].some((c) =>
              (c.textContent || '').includes('8110'),
            );
            if (page2Chip && Number.isFinite(o) && o >= 0.98) {
              sawPopIn = true;
            }
          };
          const id = setInterval(check, 12);
          window.QMS.runtime.advanceZonePageForTest('prep').finally(() => {
            setTimeout(() => {
              clearInterval(id);
              resolve({ ok: true, sawPopIn });
            }, 900);
          });
        });
      });
      if (r.sawPopIn) {
        popObservations += 1;
      }
    }
    expect(popObservations, 'page 2 numbers pop at full opacity without fade (4 attempts)').toBe(0);
  });

  test('item 8: UI overlap at rest is not orphan dual-chip (2113/2119 class)', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(2110, 12),
      ...readyRows(2100, 6),
    ]);
    await page.waitForTimeout(400);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(2110, 11),
      ...readyRows(2100, 5),
    ]);
    await page.waitForTimeout(400);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(2110, 10),
      ...readyRows(2100, 6),
    ]);
    await page.waitForTimeout(900);
    const snap = await getBoardIntegritySnapshot(page);
    expect(snap.violations, JSON.stringify(snap.violations)).toEqual([]);
    const overlaps = await findOverlappingChipPairs(page);
    expect(overlaps, JSON.stringify(overlaps)).toEqual([]);
  });
});
