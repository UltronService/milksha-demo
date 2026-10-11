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
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zoneKey
 */
export async function measurePageIndicatorInCream(page, zoneKey) {
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
    const cream = art.creamRectForZone(zk);
    const ir = ind.getBoundingClientRect();
    const left = (ir.left - cRect.left) / scale;
    const top = (ir.top - cRect.top) / scale;
    const right = (ir.right - cRect.left) / scale;
    const bottom = (ir.bottom - cRect.top) / scale;
    const creamRight = cream.left + cream.width;
    const creamBottom = cream.top + cream.height;
    const marginR = 16;
    const marginB = 16;
    const insideCream =
      left >= cream.left - 2 &&
      top >= cream.top - 2 &&
      right <= creamRight + 2 &&
      bottom <= creamBottom + 2;
    const nearBottomRight =
      Math.abs(creamRight - right - marginR) <= 24 && Math.abs(creamBottom - bottom - marginB) <= 24;
    const style = getComputedStyle(ind);
    const parent = ind.parentElement;
    return {
      ok: true,
      insideCream,
      nearBottomRight,
      text: ind.textContent?.trim() || '',
      fontSize: style.fontSize,
      color: style.color,
      fontFamily: style.fontFamily,
      inNumbersLayer: Boolean(parent?.classList?.contains('milksha-zone-numbers')),
      left,
      top,
      right,
      bottom,
      cream,
    };
  }, zoneKey);
}
