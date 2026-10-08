import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshContext, urlsLocalHomePoc } from './harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MEASURED = JSON.parse(
  readFileSync(
    join(ROOT, 'artifacts/board-background-self-qa/reference/measured-layout.json'),
    'utf8',
  ),
);

/** Reference art order: left col rows 0–4 then right col (1907..1898 per design). */
const REF_NUMBERS = ['1907', '1906', '1905', '1904', '1903', '1902', '1901', '1900', '1899', '1898'];

const CENTER_TOL_PX = 12;
const FONT_TOL_RATIO = 0.1;

function expectedCenters(zone) {
  const cells = zone === 'prep' ? MEASURED.prepCells : MEASURED.readyCells;
  const out = [];
  for (let i = 0; i < 10; i += 1) {
    const col = i < 5 ? 0 : 1;
    const row = i < 5 ? i : i - 5;
    const cell = cells.find((c) => c.row === row && c.col === col);
    if (!cell) {
      throw new Error('missing measured cell ' + zone + ' ' + i);
    }
    out.push({ cx: cell.cx, cy: cell.cy, refTextH: cell.textH > 80 ? 58 : cell.textH });
  }
  return out;
}

function refPayload() {
  const prep = REF_NUMBERS.map((number) => ({
    source_type: 'From_milksha_point_Preparing',
    number,
  }));
  const ready = REF_NUMBERS.map((number) => ({
    source_type: 'From_Store_OK',
    number,
  }));
  return [...prep, ...ready];
}

async function readCanvasScale(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('milksha-board-canvas');
    if (!canvas || !canvas.style.transform) {
      return 1;
    }
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    return m ? Number(m[1]) : 1;
  });
}

async function measureAlignment(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(250);
  const scale = await readCanvasScale(page);
  return page.evaluate(
    ({ scale, prepCenters, readyCenters, prepCream, readyCream, titleGuardY, refFontPx, centerTol, fontTol }) => {
      const canvas = document.getElementById('milksha-board-canvas');
      if (!canvas) {
        return { ok: false, reason: 'no-canvas' };
      }
      const cRect = canvas.getBoundingClientRect();
      const art = window.QMS?.Board?.LandscapeArtLayout;
      const fontPx = art ? art.NUM_FONT_PX : refFontPx;

      function boardPoint(el) {
        const r = el.getBoundingClientRect();
        return {
          cx: (r.left + r.width / 2 - cRect.left) / scale,
          cy: (r.top + r.height / 2 - cRect.top) / scale,
          top: (r.top - cRect.top) / scale,
          bottom: (r.bottom - cRect.top) / scale,
          left: (r.left - cRect.left) / scale,
          right: (r.right - cRect.left) / scale,
          textH: r.height / scale,
          fontSize: parseFloat(getComputedStyle(el).fontSize),
        };
      }

      function checkZone(selector, centers, cream) {
        const cells = Array.from(document.querySelectorAll(selector + ' .milksha-num-cell'));
        if (cells.length !== 10) {
          return { ok: false, reason: 'cell-count', count: cells.length };
        }
        const gaps = [];
        for (let i = 0; i < 10; i += 1) {
          const numEl = cells[i].querySelector('.milksha-num');
          if (!numEl) {
            return { ok: false, reason: 'empty-cell', index: i };
          }
          const pt = boardPoint(numEl);
          if (pt.top < titleGuardY) {
            return { ok: false, reason: 'title-overlap', index: i, top: pt.top };
          }
          if (
            pt.left < cream.left - 2 ||
            pt.right > cream.left + cream.width + 2 ||
            pt.top < cream.top - 2 ||
            pt.bottom > cream.top + cream.height + 2
          ) {
            return { ok: false, reason: 'outside-cream', index: i, pt, cream };
          }
          const exp = centers[i];
          const dx = Math.abs(pt.cx - exp.cx);
          const dy = Math.abs(pt.cy - exp.cy);
          gaps.push({
            index: i,
            number: numEl.textContent,
            dx,
            dy,
            textH: pt.textH,
            refTextH: exp.refTextH,
            fontSize: pt.fontSize,
          });
          if (dx > centerTol || dy > centerTol) {
            return { ok: false, reason: 'center-off', index: i, dx, dy, exp, pt };
          }
          if (Math.abs(pt.fontSize - fontPx) > fontPx * fontTol) {
            return { ok: false, reason: 'font-size', index: i, fontSize: pt.fontSize, fontPx };
          }
          if (Math.abs(pt.textH - exp.refTextH) > exp.refTextH * fontTol + 4) {
            return { ok: false, reason: 'text-height', index: i, textH: pt.textH, ref: exp.refTextH };
          }
        }
        return { ok: true, gaps };
      }

      const prep = checkZone('.milksha-zone.prep', prepCenters, prepCream);
      if (!prep.ok) {
        return { ok: false, zone: 'prep', ...prep };
      }
      const ready = checkZone('.milksha-zone.ready', readyCenters, readyCream);
      if (!ready.ok) {
        return { ok: false, zone: 'ready', ...ready };
      }
      return {
        ok: true,
        scale,
        gaps: { prep: prep.gaps, ready: ready.gaps },
      };
    },
    {
      scale,
      prepCenters: expectedCenters('prep'),
      readyCenters: expectedCenters('ready'),
      prepCream: MEASURED.prep,
      readyCream: MEASURED.ready,
      titleGuardY: 330,
      refFontPx: 62,
      centerTol: CENTER_TOL_PX,
      fontTol: FONT_TOL_RATIO,
    },
  );
}

for (const viewport of [
  { width: 1920, height: 1080, label: '1920' },
  { width: 3840, height: 2160, label: '3840' },
]) {
  test(`landscape art grid aligns to reference at ${viewport.label}`, async ({ browser }) => {
    const ctx = await freshContext(browser);
    const board = await ctx.newPage();
    const { board: boardUrl } = urlsLocalHomePoc();
    await board.goto(boardUrl);
    await board.waitForFunction(() => window.QMS?.runtime?.applyPayload, { timeout: 25000 });
    await board.evaluate((rows) => window.QMS.runtime.applyPayload(rows), refPayload());
    const result = await measureAlignment(board, viewport);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    await ctx.close();
  });
}
