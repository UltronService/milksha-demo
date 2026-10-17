import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const STORE_FOUR = '1234';
/** Widest valid 6-char Uber alnum on Arial tabular (overflows column band at 1080p/4K). */
export const UBER_SIX = 'WWWWWW';

export const OVERFLOW_VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1920x1080' },
  { width: 3840, height: 2160, tag: '3840x2160' },
];

/** @returns {string} */
export function pr95OverflowArtifactsDir() {
  const dir =
    process.env.MILKSHA_PR95_OVERFLOW_ARTIFACTS ||
    process.env.MILKSHA_E2E_ARTIFACTS ||
    join(process.cwd(), 'artifacts', 'pr95-overflow');
  mkdirSync(join(dir, 'screenshots'), { recursive: true });
  return dir;
}

export function buildUberSixCharOverflowPayload() {
  return [
    { source_type: 'From_Store_OK', number: STORE_FOUR },
    { source_type: 'From_UberEat_OK', number: UBER_SIX },
  ];
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zoneKey
 */
export async function readCanvasScale(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('milksha-board-canvas');
    if (!canvas || !canvas.style.transform) {
      return 1;
    }
    const m = canvas.style.transform.match(/scale\(([^)]+)\)/);
    return m ? Number(m[1]) : 1;
  });
}

/**
 * Measure left-column chips for store 4-char vs uber 6-char (ready zone).
 * @param {import('@playwright/test').Page} page
 */
export async function measureReadyLeftColumnChips(page) {
  const scale = await readCanvasScale(page);
  return page.evaluate(
    ({ scale: s, storeFour, uberSix }) => {
      const art = window.QMS?.Board?.LandscapeArtLayout;
      const canvas = document.getElementById('milksha-board-canvas');
      const zone = document.querySelector('.milksha-zone.ready');
      if (!art || !canvas || !zone) {
        return { ok: false, reason: 'missing-dom' };
      }
      const zoneLeft = Number.parseFloat(zone.style.left || '0') || 0;
      const cRect = canvas.getBoundingClientRect();
      const inner = art.columnInnerRectsBoard('ready')[0];

      function boardX(px) {
        return (px - cRect.left) / s;
      }

      function findChipByNumber(num) {
        const nums = [...document.querySelectorAll('.milksha-ready .milksha-num')].filter(
          (el) => (el.textContent || '').trim() === num,
        );
        if (nums.length !== 1) {
          return { ok: false, reason: 'num-count', num, count: nums.length };
        }
        const numEl = nums[0];
        const chip = numEl.closest('.milksha-board-chip');
        const cell = numEl.closest('.milksha-num-cell');
        if (!chip || !cell) {
          return { ok: false, reason: 'missing-chip', num };
        }
        const iconBox = chip.querySelector('.milksha-board-icon-box');
        const iconSlot = chip.querySelector('.milksha-board-icon-slot');
        const chipR = chip.getBoundingClientRect();
        const numR = numEl.getBoundingClientRect();
        const iconR = iconBox ? iconBox.getBoundingClientRect() : null;
        const slotR = iconSlot ? iconSlot.getBoundingClientRect() : null;
        const numStyle = getComputedStyle(numEl);
        const fontPx = Number.parseFloat(numStyle.fontSize) || 0;
        const chipStyle = getComputedStyle(chip);
        const chipScale = Number.parseFloat(chipStyle.getPropertyValue('--milksha-chip-overflow-scale')) || 1;
        const contentLeft = Math.min(
          boardX(chipR.left),
          boardX(numR.left),
          slotR ? boardX(slotR.left) : boardX(chipR.left),
        );
        const contentRight = Math.max(
          boardX(chipR.right),
          boardX(numR.right),
          iconR ? boardX(iconR.right) : boardX(chipR.right),
        );

        return {
          ok: true,
          num,
          fontPx,
          chipScale,
          whiteSpace: numStyle.whiteSpace,
          scrollWidth: numEl.scrollWidth,
          clientWidth: numEl.clientWidth,
          text: (numEl.textContent || '').trim(),
          content: { left: contentLeft, right: contentRight },
          chip: {
            left: boardX(chipR.left),
            right: boardX(chipR.right),
            top: (chipR.top - cRect.top) / s,
            bottom: (chipR.bottom - cRect.top) / s,
            width: chipR.width / s,
            height: chipR.height / s,
          },
          numBox: {
            left: boardX(numR.left),
            right: boardX(numR.right),
          },
          iconBox: iconR
            ? {
                left: boardX(iconR.left),
                right: boardX(iconR.right),
                height: iconR.height / s,
              }
            : null,
          slotBox: slotR
            ? {
                left: boardX(slotR.left),
                right: boardX(slotR.right),
              }
            : null,
          gapPx: iconR ? boardX(numR.left) - boardX(iconR.right) : null,
          cellIndex: [...zone.querySelectorAll('.milksha-num-cell')].indexOf(cell),
        };
      }

      const four = findChipByNumber(storeFour);
      const six = findChipByNumber(uberSix);
      const baseFont =
        Number.parseFloat(getComputedStyle(document.querySelector('.milksha-stage')).getPropertyValue('--milksha-num-font')) ||
        0;

      const fitApi = window.QMS?.Board?.ChipOverflowFit;
      const scaleCalls =
        fitApi && typeof fitApi.getScaleInvocationCount === 'function'
          ? fitApi.getScaleInvocationCount()
          : null;

      return {
        ok: four.ok && six.ok,
        reason: !four.ok ? four.reason : !six.ok ? six.reason : null,
        zoneLeft,
        columnInner: inner,
        baseFontPx: baseFont,
        four,
        six,
        scaleInvocationCount: scaleCalls,
        hasFitApi: Boolean(fitApi && typeof fitApi.getScaleInvocationCount === 'function'),
      };
    },
    { scale, storeFour: STORE_FOUR, uberSix: UBER_SIX },
  );
}

/**
 * @param {ReturnType<typeof measureReadyLeftColumnChips> extends Promise<infer T> ? T : never} m
 */
export function assertChipOverflowRules(m, viewportTag) {
  const errors = [];
  if (!m || !m.ok) {
    errors.push(`${viewportTag}: measure failed (${m?.reason || 'unknown'})`);
    return errors;
  }
  const col = m.columnInner;
  const tol = 1.5;

  function columnFit(chip, label) {
    if (!chip || !chip.ok) {
      errors.push(`${viewportTag} ${label}: chip missing`);
      return;
    }
    if (chip.whiteSpace !== 'nowrap') {
      errors.push(`${viewportTag} ${label}: white-space is ${chip.whiteSpace}`);
    }
    if (chip.text !== label) {
      errors.push(`${viewportTag} ${label}: truncated text ${chip.text}`);
    }
    if (chip.scrollWidth > chip.clientWidth + 2) {
      errors.push(`${viewportTag} ${label}: horizontal truncation`);
    }
    const content = chip.content || chip.chip;
    if (content.left < col.left - tol) {
      errors.push(`${viewportTag} ${label}: content left ${content.left} < col ${col.left}`);
    }
    if (content.right > col.right + tol) {
      errors.push(
        `${viewportTag} ${label}: content right ${content.right.toFixed(1)} > col ${col.right} (overflow)`,
      );
    }
    if (chip.iconBox && chip.numBox.left < chip.iconBox.right - 1) {
      errors.push(`${viewportTag} ${label}: number overlaps icon`);
    }
  }

  columnFit(m.four, STORE_FOUR);
  columnFit(m.six, UBER_SIX);

  const base = m.baseFontPx || m.four.fontPx;
  const minFont = base * 0.75;

  const sixRight = (m.six.content || m.six.chip).right;
  if (sixRight > col.right + tol) {
    if (m.four.fontPx < base - 0.5 || m.four.fontPx > base + 0.5) {
      errors.push(`${viewportTag}: four-char font should stay at base ${base}, got ${m.four.fontPx}`);
    }
    if (m.six.fontPx >= m.four.fontPx - 0.25) {
      errors.push(
        `${viewportTag}: six-char should shrink alone (${m.six.fontPx} vs four ${m.four.fontPx})`,
      );
    }
    if (m.six.fontPx < minFont - 0.5) {
      errors.push(`${viewportTag}: six-char below 75% min (${m.six.fontPx} < ${minFont})`);
    }
  }

  if (m.six.iconBox && m.six.fontPx > 0) {
    const expectedIconH = m.six.fontPx * 0.8;
    if (Math.abs(m.six.iconBox.height - expectedIconH) > 2.5) {
      errors.push(
        `${viewportTag}: icon height ${m.six.iconBox.height.toFixed(1)} != font*0.8 (${expectedIconH.toFixed(1)})`,
      );
    }
    const expectedGap = m.six.fontPx * 0.2;
    if (m.six.gapPx !== null && Math.abs(m.six.gapPx - expectedGap) > 2.5) {
      errors.push(
        `${viewportTag}: icon gap ${m.six.gapPx.toFixed(1)} != font*0.2 (${expectedGap.toFixed(1)})`,
      );
    }
  }

  return errors;
}
