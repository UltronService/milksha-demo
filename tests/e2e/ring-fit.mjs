/** Shared ring overlay fit helpers for e2e. */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const E2E_FONTCONFIG_ROBOTO = join(dirname(fileURLToPath(import.meta.url)), 'fonts/fontconfig-e2e.conf');

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

/** Non-1920 viewports: side margins must track 1920 reference ±2 percentage points. */
export const RING_MARGIN_OTHER_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 2560, height: 1080 },
  { width: 2560, height: 1440 },
];

export const RING_MARGIN_REF_VIEWPORT = RING_VIEWPORT_1920;
export const RING_MARGIN_TOLERANCE_PP = 2;

/** Side margin % from white box inner edge (inside border) to glyph edge. */
export async function measureRingGlyphSideMargins(page) {
  return page.evaluate(() => {
    const box = document.getElementById('rcv-ring-box');
    const num = document.getElementById('rcv-ring-num');
    if (!box || !num) {
      return null;
    }
    const boxR = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const borL = parseFloat(cs.borderLeftWidth);
    const borR = parseFloat(cs.borderRightWidth);
    const whiteInnerL = boxR.left + borL;
    const whiteInnerR = boxR.right - borR;
    const range = document.createRange();
    range.selectNodeContents(num);
    const numR = range.getBoundingClientRect();
    return {
      leftPct: ((numR.left - whiteInnerL) / boxR.width) * 100,
      rightPct: ((whiteInnerR - numR.right) / boxR.width) * 100,
    };
  });
}

/** @type {{ id: string, css: string|null, label: string, setupLogName: string, requirePlatformFamily?: RegExp }[]} */
export const RING_FONT_SETUPS = [
  {
    id: 'dejavu',
    css: 'DejaVu Sans, sans-serif',
    label: 'DejaVu Sans (CI Linux)',
    setupLogName: 'DejaVu',
  },
  {
    id: 'default',
    css: null,
    label: 'local default stack',
    setupLogName: 'local-stack',
  },
  {
    id: 'roboto',
    css: 'Roboto, sans-serif',
    label: 'Roboto (Android system)',
    setupLogName: 'Roboto',
    requirePlatformFamily: /^Roboto/i,
  },
];

/** Playwright init script body; use via applyRingFontSetup(context, font). */
export function ringFontOverrideInit({ css }) {
  const install = () => {
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
        const parent = document.head || document.documentElement;
        if (parent) {
          parent.appendChild(el);
        }
      }
      el.textContent =
        '#rcv-ring-ov, #rcv-ring-ov .rcv-ring-num, #rcv-ring-ov .rcv-ring-label { font-family: ' +
        css +
        ' !important; }';
    } catch {
      /* ignore */
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ css: string|null }} font
 */
export async function applyRingFontSetup(context, font) {
  if (font.css) {
    await context.addInitScript(ringFontOverrideInit, { css: font.css });
  }
}

/**
 * Roboto must resolve to the apt font file (not sans-serif fallback); use isolated fontconfig.
 * @param {import('@playwright/test').Browser} defaultBrowser
 * @param {{ id: string }} font
 */
export async function browserForRingFontSetup(defaultBrowser, font) {
  if (font.id !== 'roboto') {
    return { browser: defaultBrowser, owned: false };
  }
  const browser = await chromium.launch({
    headless: true,
    env: {
      ...process.env,
      FONTCONFIG_FILE: process.env.FONTCONFIG_FILE || E2E_FONTCONFIG_ROBOTO,
    },
  });
  return { browser, owned: true };
}

/**
 * Primary platform font family for ring digits (CDP CSS.getPlatformFontsForNode).
 * @param {import('@playwright/test').Page} page
 */
export async function getRingNumRenderedFontFamily(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#rcv-ring-num',
  });
  if (!nodeId) {
    throw new Error('#rcv-ring-num not found for platform font probe');
  }
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  if (!fonts || fonts.length === 0) {
    return '(none)';
  }
  let primary = fonts[0];
  for (const entry of fonts) {
    if (entry.glyphCount > primary.glyphCount) {
      primary = entry;
    }
  }
  return primary.familyName || '(unknown)';
}

/**
 * @param {import('@playwright/test').Page} page
 */
/** True when four-digit text fits at CSS design size (inline font cleared). */
export async function ringNumFitsAtDesignFontSize(page) {
  return page.evaluate(() => {
    const num = document.getElementById('rcv-ring-num');
    const box = document.getElementById('rcv-ring-box');
    if (!num || !box) {
      return false;
    }
    const savedFontSize = num.style.fontSize;
    num.style.fontSize = '';
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
    const textW = range.getBoundingClientRect().width;
    const fits = textW <= innerW + 1;
    num.style.fontSize = savedFontSize;
    return fits;
  });
}

export async function ringNumFitPasses(page) {
  const fit = await measureRingNumFit(page);
  if (!fit) {
    return false;
  }
  return (
    fit.scrollWidth <= fit.clientWidth + 0.5 &&
    fit.numWidth <= fit.innerWidth + 0.5 &&
    fit.centerDeltaPx <= 1
  );
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
