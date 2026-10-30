import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';
import {
  applyPayload,
  prepPayload,
  readyPayload,
  sequentialNumbers,
} from './board-column-move-helpers.mjs';

const STRESS_MS = Number(process.env.PM_ANIM_STRESS_MS || 180_000);
const ADD_INTERVAL_MS = Number(process.env.PM_ANIM_STRESS_INTERVAL_MS || 750);

/**
 * @param {import('@playwright/test').Page} page
 */
async function assertZonesHealthy(page) {
  const health = await page.evaluate(() => {
    const rt = window.QMS?.runtime;
    const snap = rt?.getSnapshot?.();
    if (!snap) {
      return { ok: false, reason: 'no-snapshot' };
    }

    function zoneHealth(zoneKey) {
      const zone = document.querySelector(
        zoneKey === 'prep' ? '.milksha-prep' : '.milksha-ready',
      );
      if (!zone) {
        return { ok: false, reason: 'no-zone' };
      }
      const layer = zone.querySelector('.milksha-zone-numbers');
      if (!layer) {
        return { ok: false, reason: 'no-layer' };
      }
      const opacity = Number.parseFloat(getComputedStyle(layer).opacity);
      if (!Number.isFinite(opacity) || opacity < 0.85) {
        return { ok: false, reason: 'layer-faded', opacity };
      }
      const items = zoneKey === 'prep' ? snap.preparing : snap.ready;
      const pageSize = 10;
      const pages = Math.max(1, Math.ceil(items.length / pageSize));
      const ind = zone.querySelector('.milksha-pg-indicator');
      if (pages > 1) {
        const text = ind?.textContent?.trim() || '';
        if (!/^\d+\/\d+$/.test(text)) {
          return { ok: false, reason: 'missing-indicator', pages, text };
        }
      }
      const visibleNums = [...zone.querySelectorAll('.milksha-num-cell .milksha-num')]
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      if (items.length > 0 && visibleNums.length === 0) {
        return { ok: false, reason: 'blank-visible-page', itemCount: items.length };
      }
      return { ok: true, visible: visibleNums.length, indicator: ind?.textContent?.trim() || '' };
    }

    return { ok: true, prep: zoneHealth('prep'), ready: zoneHealth('ready') };
  });

  expect(health.ok, JSON.stringify(health)).toBe(true);
  expect(health.prep.ok, JSON.stringify(health.prep)).toBe(true);
  expect(health.ready.ok, JSON.stringify(health.ready)).toBe(true);
}

test('PM anim v1: dual-zone stress — no blank pages or missing indicators', async ({ page }) => {
  test.setTimeout(STRESS_MS + 60_000);
  await primeBoardForAnimation(page);

  let prep = sequentialNumbers(9101, 14);
  let ready = sequentialNumbers(9201, 14);
  await applyPayload(page, prepPayload(prep).concat(readyPayload(ready)));
  await page.waitForTimeout(400);
  await assertZonesHealthy(page);

  const started = Date.now();
  let tick = 0;
  while (Date.now() - started < STRESS_MS) {
    const loopStart = Date.now();
    const nextPrep = 9300 + tick;
    const nextReady = 9400 + tick;
    prep = prep.concat([nextPrep]);
    ready = ready.concat([nextReady]);
    await applyPayload(page, prepPayload(prep).concat(readyPayload(ready)));
    await assertZonesHealthy(page);
    tick += 1;
    const wait = Math.max(0, ADD_INTERVAL_MS - (Date.now() - loopStart));
    if (wait > 0) {
      await page.waitForTimeout(wait);
    }
  }

  const mem = await page.evaluate(() => {
    const perf = performance;
    if (!perf.memory) {
      return { supported: false };
    }
    return {
      supported: true,
      usedJSHeapSize: perf.memory.usedJSHeapSize,
      totalJSHeapSize: perf.memory.totalJSHeapSize,
    };
  });
  if (mem.supported) {
    expect(mem.usedJSHeapSize).toBeLessThan(120 * 1024 * 1024);
  }
});
