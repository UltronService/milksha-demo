/** Shared probes for board-motion-7 diagnose (red on main). */

/**
 * @param {import('@playwright/test').Page} page
 * @param {'prep' | 'ready'} zoneKey
 */
export async function measurePageIndicatorInCream(page, zoneKey) {
  return page.evaluate((zk) => {
    const art = window.QMS?.Board?.LandscapeArtLayout;
    const canvas = document.getElementById('milksha-board-canvas');
    const zone = document.querySelector(zk === 'prep' ? '.milksha-zone.prep' : '.milksha-zone.ready');
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
    return {
      ok: true,
      insideCream,
      nearBottomRight,
      text: ind.textContent?.trim() || '',
      fontSize: style.fontSize,
      color: style.color,
      left,
      top,
      right,
      bottom,
      cream,
    };
  }, zoneKey);
}

/** @param {import('@playwright/test').Page} page */
export async function sampleChipMotionDuring(page, durationMs, intervalMs) {
  const samples = [];
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.milksha-board-chip')];
      return chips.map((el) => {
        const r = el.getBoundingClientRect();
        const o = getComputedStyle(el).opacity;
        const t = getComputedStyle(el).transform;
        return {
          id: el.getAttribute('data-item-id') || '',
          num: el.querySelector('.milksha-num')?.textContent?.trim() || '',
          left: r.left,
          top: r.top,
          opacity: o,
          transform: t,
          floating: el.classList.contains('milksha-board-chip--layer-float'),
          zone: el.closest('.milksha-zone')?.className || '',
        };
      });
    });
    samples.push({ t: Date.now(), chips: snap });
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(intervalMs);
  }
  return samples;
}

/** @param {import('@playwright/test').Page} page */
export async function findOverlappingChipPairs(page) {
  return page.evaluate(() => {
    const pairs = [];
    const zones = document.querySelectorAll('.milksha-zone');
    zones.forEach((zoneEl) => {
      const chips = [...zoneEl.querySelectorAll('.milksha-board-chip')].filter((el) => {
        const o = Number.parseFloat(getComputedStyle(el).opacity);
        return (Number.isFinite(o) ? o : 1) > 0.15;
      });
      for (let i = 0; i < chips.length; i += 1) {
        for (let j = i + 1; j < chips.length; j += 1) {
          const a = chips[i].getBoundingClientRect();
          const b = chips[j].getBoundingClientRect();
          const overlap =
            a.left < b.right - 4 &&
            a.right > b.left + 4 &&
            a.top < b.bottom - 4 &&
            a.bottom > b.top + 4;
          if (overlap) {
            pairs.push({
              zone: zoneEl.className,
              a: chips[i].querySelector('.milksha-num')?.textContent?.trim(),
              b: chips[j].querySelector('.milksha-num')?.textContent?.trim(),
              aFloat: chips[i].classList.contains('milksha-board-chip--layer-float'),
              bFloat: chips[j].classList.contains('milksha-board-chip--layer-float'),
            });
          }
        }
      }
    });
    return pairs;
  });
}

/**
 * @param {Array<{ t: number, chips: Array<object> }>} samples
 * @param {string} itemIdSubstring
 */
export function chipPositionDrift(samples, itemIdSubstring) {
  const points = [];
  for (const s of samples) {
    const c = s.chips.find((x) => x.id.includes(itemIdSubstring) || x.num.includes(itemIdSubstring));
    if (c) {
      points.push({ t: s.t, left: c.left, top: c.top, opacity: c.opacity, floating: c.floating });
    }
  }
  if (points.length < 2) {
    return { driftPx: 0, points };
  }
  let maxDrift = 0;
  const base = points[0];
  for (const p of points) {
    const d = Math.hypot(p.left - base.left, p.top - base.top);
    maxDrift = Math.max(maxDrift, d);
  }
  return { driftPx: maxDrift, points };
}

export function prepRows(start, count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({ source_type: 'From_Store_Preparing', number: String(start + i) });
  }
  return rows;
}

export function readyRows(start, count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({ source_type: 'From_Store_OK', number: String(start + i) });
  }
  return rows;
}
