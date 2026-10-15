/**
 * Icons for uniform-font previews — proportional, shared cap height, no chip-scale.
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
    img.className =
      'source-icons-live__icon ' +
      (sourceKey === 'point' ? 'source-icons-live__icon--nidin' : 'source-icons-live__icon--square');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
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
  function injectIcons(boardRoot) {
    const doc = boardRoot.ownerDocument;
    boardRoot.querySelectorAll('.milksha-board-chip[data-item-id]').forEach(function (chip) {
      const sourceKey = parseSourceKey(chip.getAttribute('data-item-id') || '');
      const num = chip.querySelector('.milksha-num');
      if (!num) {
        return;
      }
      const icon = createIconEl(doc, sourceKey);
      if (!icon) {
        return;
      }
      chip.classList.add('milksha-board-chip--with-icon');
      const slot = doc.createElement('div');
      slot.className = 'source-icons-live__icon-slot';
      slot.appendChild(icon);
      chip.insertBefore(slot, num);
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
      const creamInner = {
        left: boardRect.left + (cream.left + inset) * scale,
        right: boardRect.left + (cream.right - inset) * scale,
        top: boardRect.top + (cream.top + inset) * scale,
        bottom: boardRect.top + (cream.bottom - inset) * scale,
      };
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
        const creamOverflow =
          r.left < creamInner.left - 1 ||
          r.right > creamInner.right + 1 ||
          r.top < creamInner.top - 1 ||
          r.bottom > creamInner.bottom + 1;
        const out = colOverflow || creamOverflow;
        if (!out) {
          return;
        }
        chip.classList.add('milksha-board-chip--overflow');
        const badge = boardRoot.ownerDocument.createElement('span');
        badge.className = 'source-icons-overflow-badge';
        badge.textContent = colOverflow ? '溢出' : '溢出';
        chip.style.position = 'relative';
        chip.appendChild(badge);
        const id = chip.getAttribute('data-item-id') || '?';
        overflowLabels.push(zoneKey + ' ' + id);
      });
    });
    return overflowLabels;
  }

  /**
   * @param {HTMLElement} boardRoot
   * @param {{ fontPx: number, markOverflow: boolean, label: string }} opts
   */
  function apply(boardRoot, opts) {
    const fontPx = opts.fontPx;
    boardRoot.style.setProperty('--milksha-num-font', fontPx + 'px');
    injectIcons(boardRoot);
    applyFoodpandaMockDisplay(boardRoot);
    const overflows = markCreamOverflow(boardRoot, opts.markOverflow);
    boardRoot.dataset.mockupLayoutReady = 'true';
    boardRoot.dataset.fontPreviewPx = String(fontPx);
    boardRoot.dataset.fontPreviewOverflowCount = String(overflows.length);
    return overflows;
  }

  root.MilkshaSourceIconsFontPreviewOverlay = {
    apply: apply,
    injectIcons: injectIcons,
    applyFoodpandaMockDisplay: applyFoodpandaMockDisplay,
    markCreamOverflow: markCreamOverflow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
