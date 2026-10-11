#!/usr/bin/env node
/**
 * QA animation acceptance (uploads/board-animation-acceptance.md) — tolerance 0 frame audit.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'page-turn-desync', 'acceptance');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

const SCENARIOS = [
  {
    id: '4-page-turn',
    ms: 900,
    run: async (page) => {
      const batch = [];
      for (let i = 1; i <= 11; i += 1) {
        batch.push({ source_type: 'From_Store_Preparing', number: String(8200 + i) });
      }
      await page.evaluate((p) => window.QMS.runtime.applyPayload(p), batch);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    },
  },
  {
    id: 'page-turn-desync',
    ms: 1400,
    run: async (page) => {
      const prep = Array.from({ length: 11 }, (_, i) => ({
        source_type: 'From_Store_Preparing',
        number: String(3101 + i),
      }));
      const ready20 = Array.from({ length: 20 }, (_, i) => ({
        source_type: 'From_Store_OK',
        number: String(4102 + i),
      }));
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [...prep, ...ready20]);
      await page.waitForTimeout(400);
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('ready'));
      await page.waitForTimeout(200);
      const ready21 = ready20.concat([
        { source_type: 'From_Store_OK', number: '4122' },
      ]);
      await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), [...prep, ...ready21]);
    },
  },
  {
    id: '2-call-ready-pulse',
    ms: 3800,
    run: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8102' }]);
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '8102' },
          { source_type: 'From_Store_OK', number: '8102' },
        ]);
      });
    },
  },
];

const AUDIT_FN = () => {
  const art = window.QMS?.Board?.LandscapeArtLayout;
  const canvas = document.getElementById('milksha-board-canvas');
  if (!art || !canvas) {
    return { ok: false, reason: 'missing-art' };
  }
  const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
  const scale = m ? Number(m[1]) : 1;
  const cRect = canvas.getBoundingClientRect();
  const toBoard = (r) => ({
    left: (r.left - cRect.left) / scale,
    top: (r.top - cRect.top) / scale,
    right: (r.right - cRect.left) / scale,
    bottom: (r.bottom - cRect.top) / scale,
  });
  const violations = [];
  for (const zoneKey of ['prep', 'ready']) {
    const zone = document.querySelector('.milksha-zone.' + zoneKey);
    if (!zone) {
      continue;
    }
    const cream = art.creamRectForZone(zoneKey);
    const titleEl = zone.querySelector('.milksha-ztitle');
    const titleRect = titleEl ? toBoard(titleEl.getBoundingClientRect()) : null;
    const chips = [...zone.querySelectorAll('.milksha-board-chip')];
    const rects = [];
    for (let i = 0; i < chips.length; i += 1) {
      const chip = chips[i];
      const id = chip.getAttribute('data-item-id') || 'float-' + i;
      const r = toBoard(chip.getBoundingClientRect());
      rects.push({ id, r });
      if (
        r.left < cream.left - 0.01 ||
        r.right > cream.left + cream.width + 0.01 ||
        r.top < cream.top - 0.01 ||
        r.bottom > cream.top + cream.height + 0.01
      ) {
        violations.push({ kind: 'outside-cream', zone: zoneKey, id, r, cream });
      }
      if (titleRect && r.top < titleRect.bottom + 0.01 && r.bottom > titleRect.top - 0.01) {
        if (r.left < titleRect.right && r.right > titleRect.left) {
          violations.push({ kind: 'title-overlap', zone: zoneKey, id, r, titleRect });
        }
      }
    }
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        const A = rects[a].r;
        const B = rects[b].r;
        const overlap =
          A.left < B.right && A.right > B.left && A.top < B.bottom && A.bottom > B.top;
        if (overlap) {
          violations.push({
            kind: 'chip-overlap',
            zone: zoneKey,
            a: rects[a].id,
            b: rects[b].id,
          });
        }
      }
    }
  }
  return { ok: violations.length === 0, violations };
};

async function runScenario(page, viewport, scenario) {
  const dir = join(ART, viewport.tag, scenario.id);
  mkdirSync(dir, { recursive: true });
  await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  const prevPos = {};
  const frameViolations = [];
  let frameIdx = 0;
  const sample = async () => {
    const audit = await page.evaluate(AUDIT_FN);
    const motion = await page.evaluate(() => {
      const out = {};
      const chips = document.querySelectorAll('.milksha-board-chip[data-item-id]');
      for (let i = 0; i < chips.length; i += 1) {
        const chip = chips[i];
        const id = chip.getAttribute('data-item-id');
        if (!id) {
          continue;
        }
        const r = chip.getBoundingClientRect();
        out[id] = { left: r.left, top: r.top };
      }
      return out;
    });
    for (const id of Object.keys(motion)) {
      const prev = prevPos[id];
      if (prev) {
        const dx = Math.abs(motion[id].left - prev.left);
        const dy = Math.abs(motion[id].top - prev.top);
        if (dx > 0.5 && dy > 0.5) {
          frameViolations.push({ frame: frameIdx, kind: 'diagonal-move', id, dx, dy });
        }
      }
      prevPos[id] = motion[id];
    }
    if (!audit.ok) {
      for (let v = 0; v < audit.violations.length; v += 1) {
        frameViolations.push({ frame: frameIdx, ...audit.violations[v] });
      }
    }
    const shot = join(dir, `f-${String(frameIdx).padStart(4, '0')}.jpg`);
    await page.screenshot({ path: shot, type: 'jpeg', quality: 75 });
    frameIdx += 1;
  };
  await sample();
  await scenario.run(page);
  const end = Date.now() + scenario.ms;
  while (Date.now() < end) {
    await page.waitForTimeout(50);
    await sample();
  }
  return { scenario: scenario.id, viewport: viewport.tag, frames: frameIdx, violations: frameViolations };
}

async function main() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  for (const viewport of [
    { width: 1920, height: 1080, tag: '1920x1080' },
    { width: 3840, height: 2160, tag: '3840x2160' },
  ]) {
    const ctx = await browser.newContext({ viewport, recordVideo: { dir: join(ART, 'video', viewport.tag) } });
    const page = await ctx.newPage();
    for (const sc of SCENARIOS) {
      results.push(await runScenario(page, viewport, sc));
    }
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(ART, 'acceptance-results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.violations.length > 0);
  console.log(JSON.stringify({ scenarios: results.length, failed: failed.length, results }, null, 2));
  process.exit(failed.some((r) => r.scenario === 'page-turn-desync') ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
