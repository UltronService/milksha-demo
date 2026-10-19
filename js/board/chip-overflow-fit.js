/**
 * Per-chip column overflow fit (PR #95): one-step scale on add / page turn only.
 * Icon slot 1.0F, gap 0.2F, icon box 0.8F — all scale together (PR #74).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const MIN_SCALE = 0.75;
  /** DOM ink can exceed canvas measureText slightly (subpixel / rounding). */
  const FIT_SAFETY_INSET_PX = 2;
  const SLOT_RATIO = 1;
  const GAP_RATIO = 0.2;
  const LETTER_SPACING_EM = 0.02;
  const NUM_FONT_FAMILY = 'Arial, Arimo, sans-serif';

  let scaleInvocationCount = 0;
  /** @type {Set<string>} */
  const failureLoggedIds = new Set();

  /**
   * @param {string} number
   * @param {number} fontPx
   * @returns {number}
   */
  function measureTextWidthPx(number, fontPx) {
    const text = String(number || '');
    if (!text) {
      return 0;
    }
    const doc = root.document;
    if (!doc || typeof doc.createElement !== 'function') {
      return text.length * fontPx * 0.58;
    }
    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return text.length * fontPx * 0.58;
    }
    ctx.font = '400 ' + fontPx + 'px ' + NUM_FONT_FAMILY;
    const base = ctx.measureText(text).width;
    const tracking = text.length > 1 ? (text.length - 1) * fontPx * LETTER_SPACING_EM : 0;
    return base + tracking;
  }

  /**
   * @param {string} number
   * @param {number} baseFontPx
   * @returns {number}
   */
  function naturalContentWidthPx(number, baseFontPx) {
    const f = baseFontPx;
    return f * SLOT_RATIO + f * GAP_RATIO + measureTextWidthPx(number, f);
  }

  /**
   * @param {number} availablePx
   * @param {number} naturalPx
   * @returns {{ scale: number, atMinScale: boolean, stillOverflows: boolean }}
   */
  function computeFitScale(availablePx, naturalPx) {
    if (!Number.isFinite(availablePx) || availablePx <= 0 || !Number.isFinite(naturalPx) || naturalPx <= 0) {
      return { scale: 1, atMinScale: false, stillOverflows: false };
    }
    const budgetPx = Math.max(0, availablePx - FIT_SAFETY_INSET_PX);
    if (naturalPx <= budgetPx + 0.5) {
      return { scale: 1, atMinScale: false, stillOverflows: false };
    }
    const raw = budgetPx / naturalPx;
    if (raw >= 1) {
      return { scale: 1, atMinScale: false, stillOverflows: false };
    }
    const scale = raw < MIN_SCALE ? MIN_SCALE : raw;
    const stillOverflows = naturalPx * scale > availablePx + 1;
    return { scale, atMinScale: scale <= MIN_SCALE + 0.0001 && raw < MIN_SCALE, stillOverflows };
  }

  /**
   * @param {Element} chip
   */
  function clearChipFit(chip) {
    chip.classList.remove('milksha-board-chip--overflow-fit');
    chip.style.removeProperty('--milksha-chip-fit-scale');
    chip.style.removeProperty('--milksha-chip-overflow-scale');
    const cell = chip.closest('.milksha-num-cell');
    if (cell) {
      cell.classList.remove('milksha-num-cell--overflow-fit');
      cell.style.removeProperty('max-width');
    }
  }

  /**
   * @param {Element} chip
   * @param {number} scale
   * @param {number} columnWidthPx
   */
  function applyChipFit(chip, scale, columnWidthPx) {
    if (scale >= 0.9995) {
      clearChipFit(chip);
      return;
    }
    chip.classList.add('milksha-board-chip--overflow-fit');
    const scaleStr = String(scale);
    chip.style.setProperty('--milksha-chip-fit-scale', scaleStr);
    chip.style.setProperty('--milksha-chip-overflow-scale', scaleStr);
    const cell = chip.closest('.milksha-num-cell');
    if (cell && Number.isFinite(columnWidthPx) && columnWidthPx > 0) {
      cell.classList.add('milksha-num-cell--overflow-fit');
      cell.style.maxWidth = columnWidthPx + 'px';
    }
  }

  /**
   * @param {string} itemId
   * @param {{ zoneKey: string, number: string, scale: number, availablePx: number, naturalPx: number }} detail
   */
  function logOverflowFailureOnce(itemId, detail) {
    const key = itemId || detail.number;
    if (!key || failureLoggedIds.has(key)) {
      return;
    }
    failureLoggedIds.add(key);
    if (root.console && typeof root.console.warn === 'function') {
      root.console.warn('[milksha-chip-overflow] exceeds column at min scale 0.75', detail);
    }
  }

  /**
   * @param {Element} zoneEl
   * @param {'prep' | 'ready'} zoneKey
   * @param {object} artLayout
   * @param {number} baseFontPx
   */
  function applyZoneOverflowFit(zoneEl, zoneKey, artLayout, baseFontPx) {
    const inners = artLayout.columnInnerRectsBoard(zoneKey);
    const cells = zoneEl.querySelectorAll('.milksha-num-cell');
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const chip = cell.querySelector('.milksha-board-chip');
      if (!chip) {
        continue;
      }
      const numEl = chip.querySelector('.milksha-num');
      const number = numEl ? String(numEl.textContent || '').trim() : '';
      if (!number) {
        clearChipFit(chip);
        continue;
      }
      const col = i < 5 ? 0 : 1;
      const available = inners[col].right - inners[col].left;
      const natural = naturalContentWidthPx(number, baseFontPx);
      const fit = computeFitScale(available, natural);
      const itemId = chip.getAttribute('data-item-id') || number;
      if (fit.stillOverflows) {
        logOverflowFailureOnce(itemId, {
          zoneKey: zoneKey,
          number: number,
          scale: fit.scale,
          availablePx: available,
          naturalPx: natural,
        });
      }
      applyChipFit(chip, fit.scale, available);
    }
  }

  /**
   * @param {Element | null | undefined} boardEl
   */
  function applyBoardOverflowFit(boardEl) {
    if (!boardEl || !boardEl.classList || !boardEl.classList.contains('milksha-board--landscape-art')) {
      return;
    }
    const art = QMS.Board && QMS.Board.LandscapeArtLayout;
    if (!art) {
      return;
    }
    const doc = root.document;
    const stage =
      (boardEl.closest && boardEl.closest('.milksha-stage')) ||
      (doc && doc.querySelector ? doc.querySelector('.milksha-stage') : null);
    let baseFontPx = art.NUM_FONT_PX;
    if (stage && root.getComputedStyle) {
      const raw = root.getComputedStyle(stage).getPropertyValue('--milksha-num-font');
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        baseFontPx = parsed;
      }
    }
    scaleInvocationCount += 1;
    const prep = boardEl.querySelector('.milksha-zone.prep');
    const ready = boardEl.querySelector('.milksha-zone.ready');
    if (prep) {
      applyZoneOverflowFit(prep, 'prep', art, baseFontPx);
    }
    if (ready) {
      applyZoneOverflowFit(ready, 'ready', art, baseFontPx);
    }
  }

  QMS.Board = QMS.Board || {};
  QMS.Board.ChipOverflowFit = {
    MIN_SCALE: MIN_SCALE,
    measureTextWidthPx: measureTextWidthPx,
    naturalContentWidthPx: naturalContentWidthPx,
    computeFitScale: computeFitScale,
    applyBoardOverflowFit: applyBoardOverflowFit,
    getScaleInvocationCount: function () {
      return scaleInvocationCount;
    },
    resetScaleInvocationCount: function () {
      scaleInvocationCount = 0;
    },
    resetFailureLog: function () {
      failureLoggedIds.clear();
    },
    getFailureLoggedIds: function () {
      return Array.from(failureLoggedIds);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
