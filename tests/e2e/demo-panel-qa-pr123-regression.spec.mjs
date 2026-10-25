import { test, expect } from '@playwright/test';
import {
  PORT_SITE,
  PORT_CLOUD,
  installBundledCloudRouteShim,
  restartCloud,
  resetCloudState,
  startSite,
} from './harness.mjs';
import { blockNonLocalNetwork } from './helpers/block-non-local-network.mjs';

const BASE = `http://127.0.0.1:${PORT_SITE}`;
const CENTER_TOLERANCE_PX = 3;
const SAMPLE_INTERVAL_MS = 24;

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1920x1080' },
  { width: 3840, height: 2160, tag: '3840x2160' },
];

async function openDemoBoard(page) {
  await blockNonLocalNetwork(page, { sitePort: PORT_SITE, cloudPort: PORT_CLOUD });
  await installBundledCloudRouteShim(page);
  await page.goto(
    `${BASE}/?mode=cloud&store=zz-qa-store-a&motion=on&demo=1&testPageIntervalMs=60000&device=stb-01`,
  );
  await page.waitForFunction(() => window.QMS && window.QMS.runtime, undefined, { timeout: 45000 });
  await page.locator('.milksha-demo-handle').click();
}

test.describe('PR #123 QA regressions (demo panel)', () => {
  test.beforeAll(async () => {
    await restartCloud();
    await startSite();
  });

  test.beforeEach(async () => {
    await resetCloudState({ seedDevice: true });
  });

  for (const vp of VIEWPORTS) {
    test(`ready pulse: chip center stays on cell center @ ${vp.tag}`, async ({ browser }) => {
      test.setTimeout(120000);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await openDemoBoard(page);

      await page.evaluate(async () => {
        window.QMS.runtime.applyPayload([], { silent: true });
        window.QMS.runtime.applyPayload([], { silent: true });
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8102' }], {
          silent: true,
        });
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '8102' }]);
      });

      const pulseMs = await page.evaluate(() => {
        const cfg = window.QMS.MilkshaBoardAnimConfig.getConfig();
        return cfg.readyScaleInMs + cfg.readyScaleHoldMs + cfg.readyScaleOutMs;
      });

      const started = Date.now();
      let maxGap = 0;
      let worst = null;
      while (Date.now() - started < pulseMs + 80) {
        const sample = await page.evaluate((tol) => {
          const chip = document.querySelector(
            '.milksha-ready .milksha-board-chip[data-item-id="store:8102"]',
          );
          if (!chip) {
            return { ok: false, reason: 'no-chip' };
          }
          const cell = chip.closest('.milksha-num-cell');
          if (!cell) {
            return { ok: false, reason: 'no-cell' };
          }
          const cr = chip.getBoundingClientRect();
          const cellR = cell.getBoundingClientRect();
          const ccx = cr.left + cr.width / 2;
          const ccy = cr.top + cr.height / 2;
          const cellCx = cellR.left + cellR.width / 2;
          const cellCy = cellR.top + cellR.height / 2;
          const dx = ccx - cellCx;
          const dy = ccy - cellCy;
          const dist = Math.hypot(dx, dy);
          const tr = getComputedStyle(chip).transform;
          const m = tr.match(/matrix\(([^)]+)\)/);
          const scale = m ? Number.parseFloat(m[1].split(',')[0]) : 1;
          return {
            ok: true,
            dx,
            dy,
            dist,
            scale: Math.round(scale * 1000) / 1000,
            number: chip.querySelector('.milksha-num')?.textContent?.trim() || '',
          };
        }, CENTER_TOLERANCE_PX);
        if (sample.ok && sample.dist > maxGap) {
          maxGap = sample.dist;
          worst = sample;
        }
        if (sample.ok && sample.dist > CENTER_TOLERANCE_PX) {
          throw new Error(
            `${vp.tag} pulse center drift: dist=${sample.dist.toFixed(2)} dx=${sample.dx.toFixed(2)} dy=${sample.dy.toFixed(2)} scale=${sample.scale}`,
          );
        }
        await page.waitForTimeout(SAMPLE_INTERVAL_MS);
      }
      expect(worst?.number || '8102').toBe('8102');
      expect(maxGap).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);
      await ctx.close();
    });

    test(`rapid demo add: no chip bbox overlap (incl. float) @ ${vp.tag}`, async ({ browser }) => {
      test.setTimeout(120000);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      await openDemoBoard(page);

      const clickCount = 15;
      await page.evaluate((n) => {
        const btn = document.querySelector('#ms-demo-add');
        for (let i = 0; i < n; i += 1) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }, clickCount);

      const observeMs = 2200;
      const started = Date.now();
      const tracked = new Map();
      while (Date.now() - started < observeMs) {
        const snap = await page.evaluate(() => {
          function rectsOverlap(a, b) {
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          }
          function rectFromEl(el) {
            const r = el.getBoundingClientRect();
            if (r.width < 0.5 || r.height < 0.5) {
              return null;
            }
            const o = Number.parseFloat(getComputedStyle(el).opacity || '1');
            if (!Number.isFinite(o) || o < 0.08) {
              return null;
            }
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          }

          const zones = [...document.querySelectorAll('.milksha-zone.prep, .milksha-zone.ready')];
          const overlaps = [];
          const diagonal = [];

          for (let zi = 0; zi < zones.length; zi += 1) {
            const zone = zones[zi];
            const layer = zone.querySelector('.milksha-zone-numbers');
            if (!layer) {
              continue;
            }
            const cells = [...layer.querySelectorAll('.milksha-num-cell')];
            for (let ci = 0; ci < cells.length; ci += 1) {
              const cell = cells[ci];
              const cellRect = cell.getBoundingClientRect();
              const chips = [];
              cell.querySelectorAll('.milksha-board-chip').forEach((el) => {
                const r = rectFromEl(el);
                if (r) {
                  chips.push({
                    el,
                    rect: r,
                    id: el.getAttribute('data-item-id') || '',
                    num: el.querySelector('.milksha-num')?.textContent?.trim() || '',
                    float: el.classList.contains('milksha-board-chip--layer-float'),
                  });
                }
              });
              layer.querySelectorAll('.milksha-board-chip--layer-float').forEach((el) => {
                const r = rectFromEl(el);
                if (!r || !rectsOverlap(r, cellRect)) {
                  return;
                }
                const id = el.getAttribute('data-item-id') || '';
                if (chips.some((c) => c.el === el)) {
                  return;
                }
                chips.push({
                  el,
                  rect: r,
                  id,
                  num: el.querySelector('.milksha-num')?.textContent?.trim() || '',
                  float: true,
                });
              });
              for (let a = 0; a < chips.length; a += 1) {
                for (let b = a + 1; b < chips.length; b += 1) {
                  if (rectsOverlap(chips[a].rect, chips[b].rect)) {
                    overlaps.push({
                      cellIndex: ci,
                      a: chips[a].num || chips[a].id,
                      b: chips[b].num || chips[b].id,
                      floatPair: chips[a].float || chips[b].float,
                    });
                  }
                }
              }
              for (let c = 0; c < chips.length; c += 1) {
                const chip = chips[c];
                if (chip.float) {
                  continue;
                }
                const cr = chip.el.getBoundingClientRect();
                const ccx = cr.left + cr.width / 2;
                const ccy = cr.top + cr.height / 2;
                const cellCx = cellRect.left + cellRect.width / 2;
                const cellCy = cellRect.top + cellRect.height / 2;
                const dx = ccx - cellCx;
                const dy = ccy - cellCy;
                const dist = Math.hypot(dx, dy);
                if (dist > 3) {
                  diagonal.push({
                    num: chip.num,
                    dx,
                    dy,
                    dist,
                    cellIndex: ci,
                  });
                }
              }
            }
          }
          return { overlaps, diagonal };
        });

        for (const d of snap.diagonal) {
          const key = d.num || `cell-${d.cellIndex}`;
          const prev = tracked.get(key);
          if (!prev) {
            tracked.set(key, { dx: d.dx, dy: d.dy, dist: d.dist });
            continue;
          }
          const shiftX = Math.abs(d.dx - prev.dx);
          const shiftY = Math.abs(d.dy - prev.dy);
          if (shiftX > 2 && shiftY > 2) {
            throw new Error(
              `${vp.tag} diagonal drift on ${key}: dx=${d.dx.toFixed(1)} dy=${d.dy.toFixed(1)} (was dx=${prev.dx.toFixed(1)} dy=${prev.dy.toFixed(1)})`,
            );
          }
          tracked.set(key, { dx: d.dx, dy: d.dy, dist: d.dist });
        }

        if (snap.overlaps.length > 0) {
          throw new Error(`${vp.tag} chip overlap: ${JSON.stringify(snap.overlaps)}`);
        }
        await page.waitForTimeout(SAMPLE_INTERVAL_MS);
      }
      await ctx.close();
    });
  }
});
