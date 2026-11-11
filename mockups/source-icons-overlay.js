/**
 * Inject official source icons into live board chips (mockup only).
 */
(function (root) {
  'use strict';

  const ICON_SRC = {
    point: 'assets/source-icons/nidin.png',
    uber: 'assets/source-icons/ubereats.png',
    fp: 'assets/source-icons/foodpanda.png',
  };

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
   * @param {string} itemId
   * @returns {string}
   */
  function parseNumberFromItemId(itemId) {
    const idx = itemId.indexOf(':');
    if (idx < 0) {
      return '';
    }
    return itemId.slice(idx + 1);
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
      const digits = parseNumberFromItemId(chip.getAttribute('data-item-id') || '');
      num.textContent = mock.formatFoodpandaMockDisplay(digits);
      chip.classList.add('milksha-board-chip--fp-mock-hash');
    });
  }

  /**
   * @param {HTMLElement} boardRoot
   */
  function injectIcons(boardRoot) {
    const doc = boardRoot.ownerDocument;
    const chips = boardRoot.querySelectorAll('.milksha-board-chip[data-item-id]');
    chips.forEach(function (chip) {
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
   * @param {HTMLElement} zoneEl
   * @param {'prep' | 'ready'} zone
   */
  function fitZoneChipScale(zoneEl, zone) {
    const data = root.MilkshaSourceIconMockup;
    if (!data) {
      return 1;
    }
    const worstFp =
      typeof data.FP_WORST_CASE_DISPLAY === 'string' ? data.FP_WORST_CASE_DISPLAY : '#999999';
    zoneEl.style.setProperty('--source-icons-chip-scale', '1');
    const cream = data.creamRectPixel(zone);
    const inset = data.CREAM_EDGE_INSET_PX;
    const midX = (cream.left + cream.right) / 2;
    const halfGap = data.COLUMN_MID_GAP_PX / 2;
    const colInner = [
      { left: cream.left + inset, right: midX - halfGap },
      { left: midX + halfGap, right: cream.right - inset },
    ];

    let minScale = 1;
    const chips = zoneEl.querySelectorAll('.milksha-board-chip');
    chips.forEach(function (chip) {
      const cell = chip.closest('.milksha-num-cell');
      if (!cell) {
        return;
      }
      const cellRect = cell.getBoundingClientRect();
      const col = cellRect.left + cellRect.width / 2 < midX ? 0 : 1;
      const inner = colInner[col];
      const num = chip.querySelector('.milksha-num');
      const sourceKey = parseSourceKey(chip.getAttribute('data-item-id') || '');
      const useWorstFp =
        sourceKey === 'fp' && chip.classList.contains('milksha-board-chip--with-icon') && num;
      let savedText = '';
      if (useWorstFp && num) {
        savedText = num.textContent || '';
        num.textContent = worstFp;
      }

      const rect = chip.getBoundingClientRect();
      const cx = (rect.left + rect.right) / 2;
      const halfW = rect.width / 2;

      if (useWorstFp && num) {
        num.textContent = savedText;
      }

      if (halfW <= 0) {
        return;
      }
      const leftRoom = cx - inner.left;
      const rightRoom = inner.right - cx;
      const scaleLeft = leftRoom / halfW;
      const scaleRight = rightRoom / halfW;
      const scale = Math.min(scaleLeft, scaleRight, 1);
      if (scale < minScale) {
        minScale = scale;
      }
    });

    const safeScale = Math.max(minScale * 0.985, 0.5);
    zoneEl.style.setProperty('--source-icons-chip-scale', String(safeScale));
    return safeScale;
  }

  /**
   * @param {HTMLElement} boardRoot
   */
  function apply(boardRoot) {
    injectIcons(boardRoot);
    applyFoodpandaMockDisplay(boardRoot);
    const prepZone = boardRoot.querySelector('.milksha-zone.prep');
    const readyZone = boardRoot.querySelector('.milksha-zone.ready');
    let prepScale = 1;
    let readyScale = 1;
    if (prepZone) {
      prepScale = fitZoneChipScale(prepZone, 'prep');
    }
    if (readyZone) {
      readyScale = fitZoneChipScale(readyZone, 'ready');
    }
    if (prepZone) {
      prepScale = fitZoneChipScale(prepZone, 'prep');
    }
    if (readyZone) {
      readyScale = fitZoneChipScale(readyZone, 'ready');
    }
    applyFoodpandaMockDisplay(boardRoot);

    const art = root.QMS && root.QMS.Board && root.QMS.Board.LandscapeArtLayout;
    const liveFontPx = art && art.NUM_FONT_PX ? art.NUM_FONT_PX : 81;
    const prepNumEl = prepZone && prepZone.querySelector('.milksha-num');
    const readyNumEl = readyZone && readyZone.querySelector('.milksha-num');
    const prepAppliedFontPx = prepNumEl
      ? Number.parseFloat(root.getComputedStyle(prepNumEl).fontSize)
      : liveFontPx;
    const readyAppliedFontPx = readyNumEl
      ? Number.parseFloat(root.getComputedStyle(readyNumEl).fontSize)
      : liveFontPx;
    const prepShrinkPx = Math.max(0, liveFontPx - prepAppliedFontPx);
    const readyShrinkPx = Math.max(0, liveFontPx - readyAppliedFontPx);

    let readyPulseScale = 1.3;
    const animCfg =
      root.QMS && root.QMS.MilkshaBoardAnimConfig && root.QMS.MilkshaBoardAnimConfig.getEffectiveReadyScale;
    if (typeof animCfg === 'function') {
      readyPulseScale = animCfg().effective;
    }

    const mock = root.MilkshaSourceIconMockup;
    const worstFp =
      mock && typeof mock.FP_WORST_CASE_DISPLAY === 'string' ? mock.FP_WORST_CASE_DISPLAY : '#999999';

    boardRoot.dataset.mockupLayoutReady = 'true';
    boardRoot.dataset.mockupMode = 'icons';
    boardRoot.dataset.liveNumFontPx = String(liveFontPx);
    boardRoot.dataset.mockupPrepAppliedFontPx = String(prepAppliedFontPx);
    boardRoot.dataset.mockupReadyAppliedFontPx = String(readyAppliedFontPx);
    boardRoot.dataset.mockupPrepFontShrinkPx = String(prepShrinkPx);
    boardRoot.dataset.mockupReadyFontShrinkPx = String(readyShrinkPx);
    boardRoot.dataset.mockupIconFitStrategy =
      prepShrinkPx > 0.5 || readyShrinkPx > 0.5 ? 'font-shrink' : 'chip-scale';
    boardRoot.dataset.prepChipScale = String(prepScale);
    boardRoot.dataset.readyChipScale = String(readyScale);
    boardRoot.dataset.productionReadyPulseScale = String(readyPulseScale);
    boardRoot.dataset.mockupFpWorstCaseFitLabel = worstFp;
    boardRoot.dataset.mockupFoodpandaShowsHash = '1';
  }

  root.MilkshaSourceIconsLiveOverlay = {
    apply: apply,
    injectIcons: injectIcons,
    applyFoodpandaMockDisplay: applyFoodpandaMockDisplay,
    fitZoneChipScale: fitZoneChipScale,
  };
})(typeof window !== 'undefined' ? window : globalThis);
