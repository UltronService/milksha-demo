import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function expandedChipRect(rect, scale) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const w = rect.width * scale;
  const h = rect.height * scale;
  return {
    left: cx - w / 2,
    right: cx + w / 2,
    top: cy - h / 2,
    bottom: cy + h / 2,
    width: w,
    height: h,
  };
}

async function fillReadyGrid(page, prefix) {
  const batch = [];
  for (let i = 0; i < 10; i += 1) {
    batch.push({ source_type: 'From_Store_OK', number: String(prefix) + String(9000 + i).slice(-4) });
  }
  await page.evaluate((payload) => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload(payload);
  }, batch);
}

async function assertPulsingChipNoOverlap(page, pulseItemId) {
  const sample = await page.evaluate((id) => {
    const layer = document.querySelector('.milksha-zone.ready .milksha-zone-numbers');
    const cfg = window.QMS.MilkshaBoardAnimConfig.getEffectiveReadyScale(layer);
    const pulse = document.querySelector('.milksha-ready .milksha-board-chip[data-item-id="' + id + '"]');
    const chips = [...document.querySelectorAll('.milksha-ready .milksha-board-chip')];
    const zone = document.querySelector('.milksha-zone.ready').getBoundingClientRect();
    const pulseR = pulse ? pulse.getBoundingClientRect() : null;
    const others = chips
      .filter((el) => el.getAttribute('data-item-id') !== id)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
    return {
      cfg,
      pulse: pulseR
        ? { left: pulseR.left, top: pulseR.top, width: pulseR.width, height: pulseR.height }
        : null,
      others,
      zone: { left: zone.left, right: zone.right, top: zone.top, bottom: zone.bottom },
    };
  }, pulseItemId);

  expect(sample.pulse).toBeTruthy();
  const peak = sample.cfg.effective;
  const expanded = expandedChipRect(sample.pulse, peak);
  expect(expanded.left).toBeGreaterThanOrEqual(sample.zone.left - 2);
  expect(expanded.right).toBeLessThanOrEqual(sample.zone.right + 2);
  expect(expanded.top).toBeGreaterThanOrEqual(sample.zone.top - 2);
  expect(expanded.bottom).toBeLessThanOrEqual(sample.zone.bottom + 2);
  for (let j = 0; j < sample.others.length; j += 1) {
    const other = sample.others[j];
    expect(rectsOverlap(expanded, other)).toBe(false);
  }
}

test.describe('ready zone scale pulse bounds', () => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
    test(`widest 9999 full grid @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      test.setTimeout(120000);
      const ctx = await browser.newContext({ viewport });
      const page = await ctx.newPage();
      await primeBoardForAnimation(page);
      await fillReadyGrid(page, '9');
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '9999' },
          { source_type: 'From_Store_OK', number: '9999' },
        ]);
      });
      await page.waitForTimeout(200);
      await assertPulsingChipNoOverlap(page, 'store:9999');
      await ctx.close();
    });
  }
});
