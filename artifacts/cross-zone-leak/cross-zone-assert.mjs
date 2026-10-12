/**
 * Cross-zone leak: visible slot number not in that zone's runtime snapshot set.
 */

/** @param {import('@playwright/test').Page} board */
export async function readCrossZoneViolations(board) {
  return board.evaluate(() => {
    function snapSet(items) {
      const s = new Set();
      if (!Array.isArray(items)) {
        return s;
      }
      for (const it of items) {
        if (it && it.number != null) {
          s.add(String(it.number));
        }
      }
      return s;
    }
    const rt = window.QMS?.runtime;
    const snap = rt?.getSnapshot?.();
    if (!snap) {
      return { ok: false, reason: 'no-snapshot', violations: [] };
    }
    const prepAllowed = snapSet(snap.preparing);
    const readyAllowed = snapSet(snap.ready);
    const violations = [];
    function scan(zoneKey, allowed) {
      const root = document.querySelector(`.milksha-zone.${zoneKey}`);
      if (!root) {
        return;
      }
      const slots = [...root.querySelectorAll('.milksha-num-cell .milksha-num')].map((el) =>
        el.textContent.trim(),
      );
      const loose = [...root.querySelectorAll('.milksha-num')].map((el) => el.textContent.trim()).filter(Boolean);
      const ind = root.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
      for (const n of new Set([...slots, ...loose].filter(Boolean))) {
        if (!allowed.has(n)) {
          violations.push({ zone: zoneKey, number: n, indicator: ind, slots, loose });
        }
      }
    }
    scan('prep', prepAllowed);
    scan('ready', readyAllowed);

    const rootReady = document.querySelector('.milksha-zone.ready');
    const layer = rootReady?.querySelector('.milksha-zone-numbers');
    const opacity = layer ? Number.parseFloat(getComputedStyle(layer).opacity) : 0;
    const settled = opacity >= 0.99;
    if (settled) {
      const readySlots = [...(rootReady?.querySelectorAll('.milksha-num-cell .milksha-num') ?? [])].map((el) =>
        el.textContent.trim(),
      );
      for (const n of readySlots) {
        if (n && /^7\d{3}$/.test(n)) {
          violations.push({
            zone: 'ready',
            number: n,
            indicator: rootReady?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '',
            kind: 'prep-number-in-ready-slot',
            slots: readySlots,
          });
        }
      }
    }
    return { ok: violations.length === 0, violations };
  });
}
