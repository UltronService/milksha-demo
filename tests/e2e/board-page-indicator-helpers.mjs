/** Page indicator placement probes (1080p design canvas coords). */

export function prepRows(start, count) {
  return Array.from({ length: count }, (_, i) => ({
    source_type: 'From_Store_Preparing',
    number: String(start + i),
  }));
}

export function readyRows(start, count) {
  return Array.from({ length: count }, (_, i) => ({
    source_type: 'From_Store_OK',
    number: String(start + i),
  }));
}

/**
 * @param {DOMRect} a board-space rect
 * @param {DOMRect} b board-space rect
 * @returns {number} min edge gap in px (0 if overlap)
 */
export function minRectGap(a, b) {
  const hSep = a.left >= b.right ? a.left - b.right : b.left >= a.right ? b.left - a.right : 0;
  const vSep = a.top >= b.bottom ? a.top - b.bottom : b.top >= a.bottom ? b.top - a.bottom : 0;
  if (hSep === 0 && vSep === 0) {
    return 0;
  }
  if (hSep === 0) {
    return vSep;
  }
  if (vSep === 0) {
    return hSep;
  }
  return Math.hypot(hSep, vSep);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zoneKey
 */
export async function measurePageIndicatorPlayout(page, zoneKey) {
  return page.evaluate((zk) => {
    const art = window.QMS?.Board?.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const zone = document.querySelector(
      zk === 'prep' ? '.milksha-zone.milksha-prep' : '.milksha-zone.milksha-ready',
    );
    const ind = zone?.querySelector('.milksha-pg-indicator');
    if (!art || !canvas || !zone || !ind) {
      return { ok: false, reason: 'missing-dom' };
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
    const cream = art.creamRectForZone(zk);
    const creamRect = {
      left: cream.left,
      top: cream.top,
      right: cream.left + cream.width,
      bottom: cream.top + cream.height,
    };
    const ir = toBoard(ind.getBoundingClientRect());
    const inset = 16;
    const marginRight = creamRect.right - ir.right;
    const marginBottom = creamRect.bottom - ir.bottom;
    const style = getComputedStyle(ind);
    const chips = [...zone.querySelectorAll('.milksha-board-chip')];
    let minChipGap = chips.length ? Infinity : 999;
    for (let i = 0; i < chips.length; i += 1) {
      const cr = toBoard(chips[i].getBoundingClientRect());
      const hSep = ir.left >= cr.right ? ir.left - cr.right : cr.left >= ir.right ? cr.left - ir.right : 0;
      const vSep = ir.top >= cr.bottom ? ir.top - cr.bottom : cr.top >= ir.bottom ? cr.top - ir.bottom : 0;
      const gap = hSep === 0 && vSep === 0 ? 0 : hSep === 0 ? vSep : vSep === 0 ? hSep : Math.hypot(hSep, vSep);
      minChipGap = Math.min(minChipGap, gap);
    }
    const insideCream =
      ir.left >= creamRect.left - 1 &&
      ir.top >= creamRect.top - 1 &&
      ir.right <= creamRect.right + 1 &&
      ir.bottom <= creamRect.bottom + 1;
    return {
      ok: true,
      insideCream,
      marginRight,
      marginBottom,
      minChipGap,
      text: ind.textContent?.trim() || '',
      fontSize: style.fontSize,
      color: style.color,
      inNumbersLayer: Boolean(ind.parentElement?.classList?.contains('milksha-zone-numbers')),
      indicator: ir,
      cream: creamRect,
    };
  }, zoneKey);
}

/** @deprecated use measurePageIndicatorPlayout */
export async function measurePageIndicatorInCream(page, zoneKey) {
  const m = await measurePageIndicatorPlayout(page, zoneKey);
  if (!m.ok) {
    return m;
  }
  return {
    ...m,
    nearBottomRight: Math.abs(m.marginRight - 16) <= 3 && Math.abs(m.marginBottom - 16) <= 3,
    left: m.indicator.left,
    top: m.indicator.top,
    right: m.indicator.right,
    bottom: m.indicator.bottom,
  };
}

export function assertCreamInsets(m, tolPx = 3) {
  const errors = [];
  if (!m.insideCream) {
    errors.push('outside visible cream rect');
  }
  if (Math.abs(m.marginRight - 16) > tolPx) {
    errors.push(`marginRight ${m.marginRight} (want 16±${tolPx})`);
  }
  if (Math.abs(m.marginBottom - 16) > tolPx) {
    errors.push(`marginBottom ${m.marginBottom} (want 16±${tolPx})`);
  }
  return errors;
}
