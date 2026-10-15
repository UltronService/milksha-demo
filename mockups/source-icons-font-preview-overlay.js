/**
 * UI/UX uniform-font preview overlay (slot 1.0F, gap 0.2F, store spacer).
 */
(function (root) {
  'use strict';

  const ICON_SRC = {
    point: 'assets/source-icons/nidin.png',
    uber: 'assets/source-icons/ubereats.png',
    fp: 'assets/source-icons/foodpanda.png',
  };

  /**
   * @param {string} itemId
   * @returns {string}
   */
  function parseSourceKey(itemId) {
    if (!itemId) {
      return 'store';
    }
    const idx = itemId.indexOf(':');
    if (idx <= 0) {
      return 'store';
    }
    return itemId.slice(0, idx);
  }

  /**
   * @param {Document} doc
   * @param {string} sourceKey
   * @returns {HTMLImageElement | null}
   */
  function createIconEl(doc, sourceKey) {
    if (sourceKey === 'store') {
      return null;
    }
    const src = ICON_SRC[sourceKey];
    if (!src) {
      return null;
    }
    const img = doc.createElement('img');
    if (sourceKey === 'point') {
      img.className = 'source-icons-live__icon source-icons-live__icon--nidin';
    } else if (sourceKey === 'fp') {
      img.className = 'source-icons-live__icon source-icons-live__icon--fp';
    } else {
      img.className = 'source-icons-live__icon source-icons-live__icon--uber';
    }
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  /**
   * @param {Document} doc
   * @returns {HTMLDivElement}
   */
  function createSlot(doc) {
    const slot = doc.createElement('div');
    slot.className = 'source-icons-live__icon-slot';
    return slot;
  }

  /**
   * @param {HTMLElement} boardRoot
   */
  function applyFoodpandaMockDisplay(boardRoot) {
    const mock = root.MilkshaSourceIconMockup;
    if (!mock || typeof mock.formatFoodpandaMockDisplay !== 'function') {
      return;
    }
    boardRoot.querySelectorAll('.milksha-board-chip[data-item-id]').forEach(function (chip) {
      const sourceKey = parseSourceKey(chip.getAttribute('data-item-id') || '');
      if (sourceKey !== 'fp') {
        return;
      }
      const num = chip.querySelector('.milksha-num');
      if (!num) {
        return;
      }
      const id = chip.getAttribute('data-item-id') || '';
      const digits = id.indexOf(':') >= 0 ? id.slice(id.indexOf(':') + 1) : '';
      num.textContent = mock.formatFoodpandaMockDisplay(digits);
    });
  }

  /**
   * @param {HTMLElement} boardRoot
   */
  function injectUiuxRows(boardRoot) {
    const doc = boardRoot.ownerDocument;
    boardRoot.querySelectorAll('.milksha-board-chip[data-item-id]').forEach(function (chip) {
      const sourceKey = parseSourceKey(chip.getAttribute('data-item-id') || '');
      const num = chip.querySelector('.milksha-num');
      if (!num) {
        return;
      }
      chip.classList.add('milksha-board-chip--with-slot');
      if (chip.querySelector('.source-icons-live__icon-slot')) {
        return;
      }
      const slot = createSlot(doc);
      if (sourceKey === 'store') {
        slot.classList.add('source-icons-live__icon-slot--empty');
      } else {
        chip.classList.add('milksha-board-chip--with-icon');
        const icon = createIconEl(doc, sourceKey);
        if (icon) {
          slot.appendChild(icon);
        }
      }
      chip.insertBefore(slot, num);
    });
  }

  /**
   * @param {HTMLElement} boardRoot
   */
  function alignUiuxColumnNumbers(boardRoot) {
    const mock = root.MilkshaSourceIconMockup;
    if (!mock) {
      return;
    }
    const boardEl = boardRoot.querySelector('.milksha-board') || boardRoot;
    const boardRect = boardEl.getBoundingClientRect();
    const scale = boardRect.width > 0 ? boardRect.width / 1920 : 1;
    const inset = mock.CREAM_EDGE_INSET_PX;

    ['prep', 'ready'].forEach(function (zoneKey) {
      const zone = boardRoot.querySelector('.milksha-zone.' + zoneKey);
      if (!zone) {
        return;
      }
      const cream = mock.creamRectPixel(zoneKey);
      const midXScreen = boardRect.left + ((cream.left + cream.right) / 2) * scale;
      const halfGap = (mock.COLUMN_MID_GAP_PX / 2) * scale;
      const colInnerLeft = [
        boardRect.left + (cream.left + inset) * scale,
        midXScreen + halfGap,
      ];
      const fontPx = Number.parseFloat(
        root.getComputedStyle(boardRoot).getPropertyValue('--milksha-num-font') ||
          boardRoot.dataset.fontPreviewPx ||
          '81',
      );
      const numInset = fontPx * 1.2;
      zone.querySelectorAll('.milksha-board-chip--with-slot').forEach(function (chip) {
        const cell = chip.closest('.milksha-num-cell');
        if (!cell) {
          return;
        }
        const cellRect = cell.getBoundingClientRect();
        const col = cellRect.left + cellRect.width / 2 < midXScreen ? 0 : 1;
        const targetNumLeft = colInnerLeft[col] + numInset;
        const num = chip.querySelector('.milksha-num');
        if (!num) {
          return;
        }
        const shift = targetNumLeft - num.getBoundingClientRect().left;
        if (Math.abs(shift) < 0.05) {
          return;
        }
        const cur = Number.parseFloat(chip.style.marginLeft || '0') || 0;
        chip.style.marginLeft = cur + shift + 'px';
      });
    });
  }

  /**
   * @param {HTMLElement} boardRoot
   * @param {boolean} markOverflow
   */
  function markCreamOverflow(boardRoot, markOverflow) {
    if (!markOverflow) {
      return [];
    }
    const mock = root.MilkshaSourceIconMockup;
    if (!mock) {
      return [];
    }
    const inset = mock.CREAM_EDGE_INSET_PX;
    const overflowLabels = [];
    const boardEl = boardRoot.querySelector('.milksha-board') || boardRoot;
    const boardRect = boardEl.getBoundingClientRect();
    const designW = 1920;
    const scale = boardRect.width > 0 ? boardRect.width / designW : 1;

    ['prep', 'ready'].forEach(function (zoneKey) {
      const cream = mock.creamRectPixel(zoneKey);
      const midX = boardRect.left + ((cream.left + cream.right) / 2) * scale;
      const halfGap = (mock.COLUMN_MID_GAP_PX / 2) * scale;
      const colInner = [
        {
          left: boardRect.left + (cream.left + inset) * scale,
          right: midX - halfGap,
        },
        {
          left: midX + halfGap,
          right: boardRect.left + (cream.right - inset) * scale,
        },
      ];
      const zone = boardRoot.querySelector('.milksha-zone.' + zoneKey);
      if (!zone) {
        return;
      }
      zone.querySelectorAll('.milksha-board-chip').forEach(function (chip) {
        const cell = chip.closest('.milksha-num-cell');
        const r = chip.getBoundingClientRect();
        let col = 0;
        if (cell) {
          const cellRect = cell.getBoundingClientRect();
          col = cellRect.left + cellRect.width / 2 < midX ? 0 : 1;
        }
        const inner = colInner[col];
        const cx = (r.left + r.right) / 2;
        const halfW = r.width / 2;
        const colOverflow =
          halfW > 0 &&
          (cx - halfW < inner.left - 1 || cx + halfW > inner.right + 1);
        if (!colOverflow) {
          return;
        }
        chip.classList.add('milksha-board-chip--overflow');
        const badge = boardRoot.ownerDocument.createElement('span');
        badge.className = 'source-icons-overflow-badge';
        badge.textContent = '溢出';
        chip.style.position = 'relative';
        chip.appendChild(badge);
        overflowLabels.push(zoneKey + ' ' + (chip.getAttribute('data-item-id') || '?'));
      });
    });
    return overflowLabels;
  }

  /**
   * @param {HTMLElement} boardRoot
   * @returns {{ maxNumLeftDeltaPx: number, gapErrors: number }}
   */
  function measureUiuxAcceptance(boardRoot) {
    const fontPx = Number.parseFloat(
      root.getComputedStyle(boardRoot).getPropertyValue('--milksha-num-font') ||
        boardRoot.dataset.fontPreviewPx ||
        '81',
    );
    const tol = 1.5;
    const expectedGap = fontPx * 0.2;
    let maxNumLeftDelta = 0;
    let gapErrors = 0;

    const boardEl = boardRoot.querySelector('.milksha-board') || boardRoot;
    const boardRect = boardEl.getBoundingClientRect();
    const scale = boardRect.width > 0 ? boardRect.width / 1920 : 1;

    ['prep', 'ready'].forEach(function (zoneKey) {
      const zone = boardRoot.querySelector('.milksha-zone.' + zoneKey);
      if (!zone) {
        return;
      }
      const byCol = [[], []];
      const cream = root.MilkshaSourceIconMockup.creamRectPixel(zoneKey);
      const inset = root.MilkshaSourceIconMockup.CREAM_EDGE_INSET_PX;
      const midXScreen = boardRect.left + ((cream.left + cream.right) / 2) * scale;
      const halfGap = (root.MilkshaSourceIconMockup.COLUMN_MID_GAP_PX / 2) * scale;
      const colInnerLeft = [
        boardRect.left + (cream.left + inset) * scale,
        midXScreen + halfGap,
      ];
      zone.querySelectorAll('.milksha-board-chip--with-slot').forEach(function (chip) {
        const cell = chip.closest('.milksha-num-cell');
        if (!cell) {
          return;
        }
        const cellRect = cell.getBoundingClientRect();
        const col = cellRect.left + cellRect.width / 2 < midXScreen ? 0 : 1;
        const num = chip.querySelector('.milksha-num');
        const slot = chip.querySelector('.source-icons-live__icon-slot');
        if (!num || !slot) {
          return;
        }
        byCol[col].push(num.getBoundingClientRect().left);
        const gap = num.getBoundingClientRect().left - slot.getBoundingClientRect().right;
        if (Math.abs(gap - expectedGap) > tol) {
          gapErrors += 1;
        }
      });
      const fontPxLocal = fontPx;
      [0, 1].forEach(function (colIndex) {
        const lefts = byCol[colIndex];
        if (lefts.length < 1) {
          return;
        }
        const minL = Math.min.apply(null, lefts);
        const maxL = Math.max.apply(null, lefts);
        maxNumLeftDelta = Math.max(maxNumLeftDelta, maxL - minL);
        const expected = colInnerLeft[colIndex] + fontPxLocal * 1.2;
        lefts.forEach(function (l) {
          maxNumLeftDelta = Math.max(maxNumLeftDelta, Math.abs(l - expected));
        });
      });
    });
    return { maxNumLeftDeltaPx: maxNumLeftDelta, gapErrors: gapErrors, expectedGapPx: expectedGap };
  }

  /**
   * @param {HTMLElement} boardRoot
   * @param {{ fontPx: number, markOverflow: boolean, label: string }} opts
   */
  function apply(boardRoot, opts) {
    const fontPx = opts.fontPx;
    boardRoot.style.setProperty('--milksha-num-font', fontPx + 'px');
    injectUiuxRows(boardRoot);
    applyFoodpandaMockDisplay(boardRoot);
    alignUiuxColumnNumbers(boardRoot);
    const overflows = markCreamOverflow(boardRoot, opts.markOverflow);
    const acceptance = measureUiuxAcceptance(boardRoot);
    boardRoot.dataset.mockupLayoutReady = 'true';
    boardRoot.dataset.fontPreviewPx = String(fontPx);
    boardRoot.dataset.fontPreviewOverflowCount = String(overflows.length);
    boardRoot.dataset.uiuxNumLeftDeltaPx = String(acceptance.maxNumLeftDeltaPx);
    boardRoot.dataset.uiuxGapErrors = String(acceptance.gapErrors);
    return { overflows: overflows, acceptance: acceptance };
  }

  root.MilkshaSourceIconsFontPreviewOverlay = {
    apply: apply,
    injectUiuxRows: injectUiuxRows,
    applyFoodpandaMockDisplay: applyFoodpandaMockDisplay,
    markCreamOverflow: markCreamOverflow,
    measureUiuxAcceptance: measureUiuxAcceptance,
  };
})(typeof window !== 'undefined' ? window : globalThis);
