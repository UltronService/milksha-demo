import { test, expect } from '@playwright/test';
import { freshContext, urlsLocalHomePoc } from './harness.mjs';
import { REF_BOARD_NUMBERS, buildRefBoardPayload } from './board-ref-fixtures.mjs';

/** Same-batch tie-break uses payloadIndex DESC → newest array tail is top-left. */
const REF_BOARD_NUMBERS_DISPLAY = [...REF_BOARD_NUMBERS].reverse();

const CENTER_TOL_PX = 12;

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

async function applyRefPayload(page) {
  await page.evaluate(() => window.QMS.runtime.applyPayload([]));
  await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows), buildRefBoardPayload());
}

async function measureBoard(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(250);
  const scale = await readCanvasScale(page);
  return page.evaluate(({ scale: s, centerTol }) => {
    const art = window.QMS?.Board?.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    if (!art || !canvas) {
      return { ok: false, reason: 'missing-art' };
    }
    const cRect = canvas.getBoundingClientRect();

    function measureInk(el) {
      const style = getComputedStyle(el);
      const font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      const text = el.textContent || '';
      const mctx = document.createElement('canvas').getContext('2d');
      mctx.font = font;
      const m = mctx.measureText(text);
      const cap =
        (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
      const inkW = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
      const r = el.getBoundingClientRect();
      return {
        capHeight: cap,
        inkWidth: inkW,
        box: {
          left: (r.left - cRect.left) / s,
          top: (r.top - cRect.top) / s,
          width: r.width / s,
          height: r.height / s,
        },
        center: {
          cx: (r.left + r.width / 2 - cRect.left) / s,
          cy: (r.top + r.height / 2 - cRect.top) / s,
        },
        text,
      };
    }

    function checkZone(selector, zoneKey) {
      const cream = art.creamRectForZone(zoneKey);
      const cells = Array.from(document.querySelectorAll(selector + ' .milksha-num-cell'));
      if (cells.length !== 10) {
        return { ok: false, reason: 'cell-count', count: cells.length };
      }
      const inks = [];
      const colXs = [[], []];
      const rowYs = [[], []];
      for (let i = 0; i < 10; i += 1) {
        const numEl = cells[i].querySelector('.milksha-num');
        if (!numEl || !numEl.textContent) {
          return { ok: false, reason: 'empty-cell', index: i };
        }
        const ink = measureInk(numEl);
        const exp = art.cellCenterBoard(zoneKey, i);
        const dx = Math.abs(ink.center.cx - exp.cx);
        const dy = Math.abs(ink.center.cy - exp.cy);
        if (ink.box.top < art.TITLE_GUARD_MAX_Y) {
          return { ok: false, reason: 'title-overlap', index: i };
        }
        if (
          ink.box.left < cream.left - 2 ||
          ink.box.left + ink.box.width > cream.left + cream.width + 2 ||
          ink.box.top < cream.top - 2 ||
          ink.box.top + ink.box.height > cream.top + cream.height + 2
        ) {
          return { ok: false, reason: 'outside-cream', index: i, ink, cream };
        }
        if (dx > centerTol || dy > centerTol) {
          return { ok: false, reason: 'center-off', index: i, dx, dy, exp, ink };
        }
        const col = i < 5 ? 0 : 1;
        const row = i < 5 ? i : i - 5;
        colXs[col].push(ink.center.cx);
        rowYs[col].push(ink.center.cy);
        const capTol = art.REF_INK_CAP_HEIGHT_PX * art.INK_METRIC_TOL_RATIO;
        const wTol = art.REF_INK_WIDTH_1907_PX * art.INK_METRIC_TOL_RATIO;
        if (ink.text === art.REF_INK_SAMPLE_TEXT) {
          if (Math.abs(ink.capHeight - art.REF_INK_CAP_HEIGHT_PX) > capTol) {
            return {
              ok: false,
              reason: 'ink-cap',
              index: i,
              capHeight: ink.capHeight,
              ref: art.REF_INK_CAP_HEIGHT_PX,
            };
          }
          if (Math.abs(ink.inkWidth - art.REF_INK_WIDTH_1907_PX) > wTol) {
            return {
              ok: false,
              reason: 'ink-width',
              index: i,
              inkWidth: ink.inkWidth,
              ref: art.REF_INK_WIDTH_1907_PX,
            };
          }
        }
        inks.push({ index: i, ...ink, expected: exp });
      }
      for (let col = 0; col < 2; col += 1) {
        const xs = colXs[col];
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        if (maxX - minX > art.COL_X_TOL_PX) {
          return { ok: false, reason: 'col-x-drift', col, spread: maxX - minX, xs };
        }
      }
      for (let col = 0; col < 2; col += 1) {
        const ys = rowYs[col].slice().sort((a, b) => a - b);
        const pitches = [];
        for (let r = 1; r < ys.length; r += 1) {
          pitches.push(ys[r] - ys[r - 1]);
        }
        const minP = Math.min(...pitches);
        const maxP = Math.max(...pitches);
        if (maxP - minP > art.ROW_PITCH_TOL_PX) {
          return { ok: false, reason: 'row-pitch-drift', col, pitches };
        }
      }
      return { ok: true, inks };
    }

    const prep = checkZone('.milksha-zone.prep', 'prep');
    if (!prep.ok) {
      return { ok: false, zone: 'prep', ...prep };
    }
    const ready = checkZone('.milksha-zone.ready', 'ready');
    if (!ready.ok) {
      return { ok: false, zone: 'ready', ...ready };
    }

    const prepNums = prep.inks.map((x) => x.text);
    const readyNums = ready.inks.map((x) => x.text);
    return { ok: true, scale: s, prepNums, readyNums };
  }, { scale, centerTol: CENTER_TOL_PX });
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
    await applyRefPayload(board);
    const result = await measureBoard(board, viewport);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.prepNums).toEqual(REF_BOARD_NUMBERS_DISPLAY);
    expect(result.readyNums).toEqual(REF_BOARD_NUMBERS_DISPLAY);
    await ctx.close();
  });
}
