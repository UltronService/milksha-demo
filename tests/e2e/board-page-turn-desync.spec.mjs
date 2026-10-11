import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  primeBoardForAnimation,
  assertEachCellSingleNumber,
  getBoardIntegritySnapshot,
} from './board-animation-helpers.mjs';
import { prepRows, readyRows } from './board-page-indicator-helpers.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'p2-snaps-compact.json');
const VIEW_1080 = { width: 1920, height: 1080 };
const VIEW_4K = { width: 3840, height: 2160 };

/** @param {string} n */
function isReadyNumber(n) {
  return n.startsWith('41') || n === '3112';
}

/** @param {string[]} nos */
function toPayload(nos) {
  return nos.map((n) => ({
    source_type: isReadyNumber(n) ? 'From_Store_OK' : 'From_Store_Preparing',
    number: n,
  }));
}

/** @param {import('@playwright/test').Page} page */
async function visibleReadyNumbers(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.milksha-ready .milksha-num')].map((e) => e.textContent.trim()),
  );
}

/** @param {import('@playwright/test').Page} page */
async function zoneIndicatorText(page, zoneKey) {
  return page.evaluate((zk) => {
    const zone = document.querySelector(zk === 'prep' ? '.milksha-prep' : '.milksha-ready');
    return zone?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
  }, zoneKey);
}

/** @param {import('@playwright/test').Page} page */
async function pageNumbersMatchIndicator(page, zoneKey) {
  return page.evaluate((zk) => {
    const rt = window.QMS?.runtime;
    const snap = rt?.getSnapshot?.();
    if (!snap) {
      return { ok: false, reason: 'no-snapshot' };
    }
    const zone = document.querySelector(zk === 'prep' ? '.milksha-prep' : '.milksha-ready');
    const ind = zone?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
    const m = ind.match(/^(\d+)\/(\d+)$/);
    if (!m) {
      return { ok: true, skipped: true };
    }
    const pageIndex = Number(m[1]) - 1;
    const items = zk === 'prep' ? snap.preparing : snap.ready;
    const pageSize = 10;
    const start = pageIndex * pageSize;
    const expected = items.slice(start, start + pageSize).map((it) => it.number);
    const dom = [...zone.querySelectorAll('.milksha-num-cell .milksha-num')].map((e) =>
      e.textContent.trim(),
    );
    let ok = true;
    for (let i = 0; i < pageSize; i += 1) {
      const want = expected[i] || '';
      const got = dom[i] || '';
      if (want !== got) {
        ok = false;
      }
    }
    return { ok, ind, expected, dom };
  }, zoneKey);
}

test.describe('board page-turn desync @1080p', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEW_1080);
    await primeBoardForAnimation(page);
  });

  test('p2-snaps offline replay: new ready numbers visible within 1.5s', async ({ page }) => {
    test.setTimeout(180_000);
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const scale = Number(process.env.P2_REPLAY_SCALE || 0.04);
    let prev = [];
    let t0 = Date.now();
    for (let i = 0; i < raw.length; i += 1) {
      const [ms, nos] = raw[i];
      const target = t0 + ms * scale;
      const wait = Math.max(0, target - Date.now());
      if (wait > 0) {
        await page.waitForTimeout(wait);
      }
      await page.evaluate((nc) => window.QMS.runtime.applyPayload(nc, { silent: false }), toPayload(nos));
      const added = nos.filter((n) => !prev.includes(n) && n.startsWith('41'));
      for (const n of added) {
        const deadline = Date.now() + 1500;
        let seen = false;
        while (Date.now() < deadline) {
          const vis = await visibleReadyNumbers(page);
          if (vis.includes(n)) {
            seen = true;
            break;
          }
          await page.waitForTimeout(30);
        }
        expect(seen, `ready ${n} must appear within 1.5s of apply`).toBe(true);
      }
      prev = nos;
    }
  });

  test('payload during page-turn offsets: indicator matches visible page after settle', async ({ page }) => {
    test.setTimeout(90_000);
    const offsets = [0, 150, 300, 450, 600, 900];
    for (const offsetMs of offsets) {
      await page.reload();
      await primeBoardForAnimation(page);
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([], { silent: true });
        window.QMS.runtime.applyPayload([], { silent: true });
      });
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
        ...prepRows(3101, 11),
        ...readyRows(4102, 20),
      ]);
      await page.waitForTimeout(400);
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
      await page.waitForTimeout(offsetMs);
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
        ...prepRows(3101, 11),
        ...readyRows(4102, 21),
      ]);
      await page.waitForFunction(
        () => {
          const rt = window.QMS?.runtime;
          const snap = rt?.getSnapshot?.();
          if (!snap) {
            return false;
          }
          const zones = [
            { key: 'ready', sel: '.milksha-ready', items: snap.ready },
            { key: 'prep', sel: '.milksha-prep', items: snap.preparing },
          ];
          const pageSize = 10;
          for (let z = 0; z < zones.length; z += 1) {
            const { sel, items } = zones[z];
            const zone = document.querySelector(sel);
            const ind = zone?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
            const m = ind.match(/^(\d+)\/(\d+)$/);
            if (!m) {
              continue;
            }
            const pageIndex = Number(m[1]) - 1;
            const start = pageIndex * pageSize;
            const expected = items.slice(start, start + pageSize).map((it) => it.number);
            const dom = [...zone.querySelectorAll('.milksha-num-cell .milksha-num')].map((e) =>
              e.textContent.trim(),
            );
            for (let i = 0; i < pageSize; i += 1) {
              if ((expected[i] || '') !== (dom[i] || '')) {
                return false;
              }
            }
          }
          return true;
        },
        undefined,
        { timeout: 4000 },
      );
    }
  });

  test('page indicator opacity tracks numbers layer during turn', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(8100, 11),
      ...readyRows(7200, 16),
    ]);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
    await page.waitForTimeout(80);
    const sample = await page.evaluate(() => {
      const layer = document.querySelector('.milksha-ready .milksha-zone-numbers');
      const ind = layer?.querySelector('.milksha-pg-indicator');
      if (!layer || !ind) {
        return null;
      }
      return {
        layerOpacity: parseFloat(getComputedStyle(layer).opacity),
        indOpacity: parseFloat(getComputedStyle(ind).opacity),
      };
    });
    expect(sample).not.toBeNull();
    expect(Math.abs(sample.layerOpacity - sample.indOpacity)).toBeLessThan(0.08);
  });

  test('dropping to one page never shows empty second page', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(9100, 11));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    await page.waitForTimeout(300);
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), prepRows(9100, 10));
    await page.waitForTimeout(800);
    const blankSecond = await page.evaluate(() => {
      const ind = document.querySelector('.milksha-prep .milksha-pg-indicator');
      if (ind) {
        return false;
      }
      const nums = [...document.querySelectorAll('.milksha-prep .milksha-num')].map((e) => e.textContent.trim());
      return nums.length === 0;
    });
    expect(blankSecond).toBe(false);
    const vis = await page.evaluate(() =>
      [...document.querySelectorAll('.milksha-prep .milksha-num')].map((e) => e.textContent.trim()).filter(Boolean),
    );
    expect(vis.length).toBeGreaterThan(0);
  });

  test('cell integrity and settled opacity after desync stress', async ({ page }) => {
    await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [
      ...prepRows(3101, 11),
      ...readyRows(4102, 18),
    ]);
    for (let i = 0; i < 6; i += 1) {
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
      await page.waitForTimeout(120);
      await page.evaluate(
        (n) =>
          window.QMS.runtime.applyPayload([
            ...Array.from({ length: 11 }, (_, j) => ({
              source_type: 'From_Store_Preparing',
              number: String(3101 + j),
            })),
            ...Array.from({ length: n }, (_, j) => ({
              source_type: 'From_Store_OK',
              number: String(4102 + j),
            })),
          ]),
        18 + i,
      );
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(800);
    await assertEachCellSingleNumber(page);
    const integrity = await getBoardIntegritySnapshot(page);
    expect(integrity.violations, JSON.stringify(integrity.violations)).toEqual([]);
    const opacities = await page.evaluate(() =>
      [...document.querySelectorAll('.milksha-board-chip:not(.milksha-board-chip--layer-float)')].map((el) =>
        parseFloat(getComputedStyle(el).opacity),
      ),
    );
    for (const o of opacities) {
      expect(o).toBeGreaterThanOrEqual(0.99);
    }
  });
});

test.describe('board page-turn desync @4K', () => {
  test('p2 critical ready 4119/4120 visible after replay tail', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(VIEW_4K);
    await primeBoardForAnimation(page);
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const scale = Number(process.env.P2_REPLAY_SCALE || 0.04);
    let t0 = Date.now();
    let prev = [];
    for (let i = 0; i < raw.length; i += 1) {
      const [ms, nos] = raw[i];
      const target = t0 + ms * scale;
      const wait = Math.max(0, target - Date.now());
      if (wait > 0) {
        await page.waitForTimeout(wait);
      }
      await page.evaluate((nc) => window.QMS.runtime.applyPayload(nc, { silent: false }), toPayload(nos));
      prev = nos;
    }
    for (const n of ['4119', '4120']) {
      const vis = await visibleReadyNumbers(page);
      expect(vis, `4K must show ${n}`).toContain(n);
    }
    await assertEachCellSingleNumber(page);
  });
});
