/** QA PR #123 agent method — 50ms sampling, bbox diagonal rule, CELL_AUDIT (matches qa-pr123-recheck-readonly.mjs). */

export const QA_SAMPLE_INTERVAL_MS = 50;
export const QA_DIAGONAL_EPSILON_PX = 0.5;
export const QA_MIN_CHIP_OPACITY = 0.08;

export function buildDiagonalMotionTracker() {
  const prevPos = {};
  return {
    track(motionById) {
      const violations = [];
      for (const id of Object.keys(motionById)) {
        const cur = motionById[id];
        const prev = prevPos[id];
        if (prev) {
          const dx = Math.abs(cur.left - prev.left);
          const dy = Math.abs(cur.top - prev.top);
          if (dx > QA_DIAGONAL_EPSILON_PX && dy > QA_DIAGONAL_EPSILON_PX) {
            violations.push({
              kind: 'diagonal-move',
              id,
              num: cur.num,
              dx,
              dy,
            });
          }
        }
        prevPos[id] = cur;
      }
      return violations;
    },
    reset() {
      for (const k of Object.keys(prevPos)) {
        delete prevPos[k];
      }
    },
  };
}

export function qaChipMotionSnapshot() {
  const chips = document.querySelectorAll('.milksha-board-chip[data-item-id]');
  const m = {};
  for (const chip of chips) {
    const id = chip.getAttribute('data-item-id');
    if (!id) {
      continue;
    }
    const r = chip.getBoundingClientRect();
    m[id] = {
      left: r.left,
      top: r.top,
      num: chip.querySelector('.milksha-num')?.textContent?.trim() || '',
    };
  }
  return m;
}

export function qaCellAuditSnapshot() {
  function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  function rectFromEl(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return null;
    const o = Number.parseFloat(getComputedStyle(el).opacity || '1');
    if (!Number.isFinite(o) || o < 0.08) {
      return null;
    }
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }
  const overlaps = [];
  const zones = [...document.querySelectorAll('.milksha-zone.prep, .milksha-zone.ready')];
  for (const zone of zones) {
    const layer = zone.querySelector('.milksha-zone-numbers');
    if (!layer) continue;
    const zoneKey = zone.classList.contains('milksha-prep') ? 'prep' : 'ready';
    const cells = [...layer.querySelectorAll('.milksha-num-cell')];
    for (let ci = 0; ci < cells.length; ci += 1) {
      const cell = cells[ci];
      const cellRect = cell.getBoundingClientRect();
      const chips = [];
      cell.querySelectorAll('.milksha-board-chip').forEach((el) => {
        const r = rectFromEl(el);
        if (r) {
          chips.push({
            id: el.getAttribute('data-item-id') || '',
            num: el.querySelector('.milksha-num')?.textContent?.trim() || '',
            rect: r,
          });
        }
      });
      layer.querySelectorAll('.milksha-board-chip--layer-float').forEach((el) => {
        const r = rectFromEl(el);
        if (!r || !rectsOverlap(r, cellRect)) return;
        const id = el.getAttribute('data-item-id') || el.getAttribute('data-motion-fade-item-id') || '';
        const num = el.querySelector('.milksha-num')?.textContent?.trim() || '';
        if (chips.some((c) => c.id === id && c.num === num)) return;
        chips.push({ id, num, rect: r });
      });
      for (let a = 0; a < chips.length; a += 1) {
        for (let b = a + 1; b < chips.length; b += 1) {
          if (rectsOverlap(chips[a].rect, chips[b].rect)) {
            overlaps.push({
              kind: 'in-cell-overlap',
              zone: zoneKey,
              cellIndex: ci,
              a: chips[a].num || chips[a].id,
              b: chips[b].num || chips[b].id,
            });
          }
        }
      }
    }
  }
  return overlaps;
}

export function qaMixed40Snap() {
  const bad = [];
  document.querySelectorAll('.milksha-num-cell').forEach((cell) => {
    const chips = cell.querySelectorAll('.milksha-board-chip');
    if (chips.length > 1) bad.push('stacked');
  });
  const prep = [...document.querySelectorAll('.milksha-prep .milksha-num')].map((e) => e.textContent.trim());
  const ready = [...document.querySelectorAll('.milksha-ready .milksha-num')].map((e) => e.textContent.trim());
  const dup = (arr) => arr.length !== new Set(arr).size;
  return { bad, dupPrep: dup(prep), dupReady: dup(ready) };
}

export async function qaSampleMotionAndCells(page, motionTracker) {
  const cellOverlaps = await page.evaluate(qaCellAuditSnapshot);
  const motion = await page.evaluate(qaChipMotionSnapshot);
  const diagonal = motionTracker.track(motion);
  return [...cellOverlaps, ...diagonal];
}
