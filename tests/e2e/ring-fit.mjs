/** Shared ring overlay fit helpers for e2e. */

export const RING_LAYOUT_VW_MIN = 1900;
export const RING_LAYOUT_VW_MAX = 1940;

export const RING_VIEWPORT_1920 = { width: 1920, height: 1080 };

/** Fit/center checks at all QA sizes. */
export const RING_FIT_VIEWPORTS = [
  RING_VIEWPORT_1920,
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1080 },
  { width: 2560, height: 1440 },
];

/** Side margin % bounds (8888); 1920 uses fixed 6975672 box, not this band. */
export const RING_MARGIN_VIEWPORTS = [
  { width: 1366, height: 768, minSide: 0.04, maxSide: 0.1 },
  { width: 1280, height: 720, minSide: 0.04, maxSide: 0.1 },
  { width: 2560, height: 1080, minSide: 0.04, maxSide: 0.1 },
  { width: 2560, height: 1440, minSide: 0.04, maxSide: 0.1 },
];

/** @type {{ id: string, css: string|null, label: string }[]} */
export const RING_FONT_SETUPS = [
  { id: 'dejavu', css: 'DejaVu Sans, sans-serif', label: 'DejaVu Sans (CI Linux)' },
  { id: 'default', css: null, label: 'local default stack' },
  { id: 'roboto', css: 'Roboto, sans-serif', label: 'Roboto (Android system)' },
];

export function ringFontInitScript(fontFamily) {
  const css = fontFamily;
  return () => {
    try {
      const styleId = 'e2e-ring-font-override';
      let el = document.getElementById(styleId);
      if (!css) {
        if (el) {
          el.remove();
        }
        return;
      }
      if (!el) {
        el = document.createElement('style');
        el.id = styleId;
        document.head.appendChild(el);
      }
      el.textContent =
        '#rcv-ring-ov, #rcv-ring-ov .rcv-ring-num, #rcv-ring-ov .rcv-ring-label { font-family: ' +
        css +
        ' !important; }';
    } catch {
      /* ignore */
    }
  };
}

/**
 * @param {import('@playwright/test').Page} page
 */
export async function findWidestFourDigit(page) {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'e2e-ring-width-probe';
    probe.className = 'rcv-ring-num';
    probe.style.cssText =
      'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-weight:900;line-height:1.05;letter-spacing:clamp(2px, 0.5vw, 8px);font-variant-numeric:tabular-nums;';
    const numEl = document.getElementById('rcv-ring-num');
    if (numEl) {
      const cs = getComputedStyle(numEl);
      probe.style.fontSize = cs.fontSize;
      probe.style.fontFamily = cs.fontFamily;
      probe.style.letterSpacing = cs.letterSpacing;
    }
    document.body.appendChild(probe);
    const measure = (text) => {
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    };
    let bestText = '0000';
    let bestW = measure('0000');
    for (let n = 0; n <= 9999; n += 1) {
      const text = String(n).padStart(4, '0');
      const w = measure(text);
      if (w > bestW) {
        bestW = w;
        bestText = text;
      }
    }
    probe.remove();
    return { text: bestText, width: bestW };
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
export async function measureRingNumFit(page) {
  return page.evaluate(() => {
    const box = document.getElementById('rcv-ring-box');
    const num = document.getElementById('rcv-ring-num');
    if (!box || !num) {
      return null;
    }
    const boxR = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const padL = parseFloat(cs.paddingLeft);
    const padR = parseFloat(cs.paddingRight);
    const borL = parseFloat(cs.borderLeftWidth);
    const borR = parseFloat(cs.borderRightWidth);
    const innerL = boxR.left + padL + borL;
    const innerR = boxR.right - padR - borR;
    const innerW = innerR - innerL;
    const range = document.createRange();
    range.selectNodeContents(num);
    const numR = range.getBoundingClientRect();
    const marginL = numR.left - innerL;
    const marginR = innerR - numR.right;
    return {
      scrollWidth: num.scrollWidth,
      clientWidth: num.clientWidth,
      innerWidth: innerW,
      numWidth: numR.width,
      marginLeftPx: marginL,
      marginRightPx: marginR,
      centerDeltaPx: Math.abs(marginL - marginR),
    };
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').expect} expect
 */
export async function expectRingNumFitsAndCentered(page, expect) {
  const fit = await measureRingNumFit(page);
  expect(fit).not.toBeNull();
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth + 0.5);
  expect(fit.numWidth).toBeLessThanOrEqual(fit.innerWidth + 0.5);
  expect(fit.centerDeltaPx).toBeLessThanOrEqual(1);
}
