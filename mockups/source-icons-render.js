/**
 * DOM helpers for static source-icon mockup pages.
 */
(function (root) {
  'use strict';

  const ICON_SRC = {
    point: '../assets/source-icons/nidin.png',
    uber: '../assets/source-icons/ubereats.png',
    fp: '../assets/source-icons/foodpanda.png',
  };

  /**
   * @param {Document} doc
   * @param {'store' | 'point' | 'uber' | 'fp'} source
   * @returns {HTMLImageElement | null}
   */
  function createIconEl(doc, source) {
    if (source === 'store') {
      return null;
    }
    const src = ICON_SRC[source];
    if (!src) {
      return null;
    }
    const img = doc.createElement('img');
    img.className =
      'source-icons-mockup__icon ' +
      (source === 'point' ? 'source-icons-mockup__icon--nidin' : 'source-icons-mockup__icon--square');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  /**
   * @param {Document} doc
   * @param {{ source: string, number: string }} item
   * @param {boolean} readyZone
   * @returns {HTMLElement}
   */
  function createChipRow(doc, item, readyZone) {
    const row = doc.createElement('div');
    row.className =
      'source-icons-mockup__row' + (readyZone ? ' source-icons-mockup__row--ready' : '');

    const slot = doc.createElement('div');
    slot.className = 'source-icons-mockup__icon-slot';
    slot.setAttribute('aria-hidden', item.source === 'store' ? 'true' : 'false');
    const icon = createIconEl(doc, item.source);
    if (icon) {
      slot.appendChild(icon);
    }
    row.appendChild(slot);

    const num = doc.createElement('span');
    num.className = 'source-icons-mockup__num';
    num.textContent = item.number;
    row.appendChild(num);

    return row;
  }

  /**
   * @param {HTMLElement} row
   * @param {number} maxWidthPx
   */
  function fitRowWidth(row, maxWidthPx) {
    const ready = row.classList.contains('source-icons-mockup__row--ready');
    row.style.transform = 'none';
    const natural = row.getBoundingClientRect().width;
    if (natural <= 0) {
      row.style.transform = ready ? 'scale(var(--mockup-ready-scale))' : 'none';
      return;
    }
    let shrink = 1;
    const readyScale = ready ? 1.3 : 1;
    if (natural * readyScale > maxWidthPx) {
      shrink = maxWidthPx / (natural * readyScale);
    }
    const total = readyScale * shrink;
    if (Math.abs(total - 1) < 0.002) {
      row.style.transform = ready ? 'scale(var(--mockup-ready-scale))' : 'none';
      return;
    }
    row.style.transform = 'scale(' + total + ')';
  }

  /**
   * @param {Document} doc
   * @returns {number}
   */
  function readCellMaxWidth(doc) {
    const raw = getComputedStyle(doc.documentElement).getPropertyValue('--mockup-cell-w');
    const pl = getComputedStyle(doc.documentElement).getPropertyValue('--mockup-cell-pl');
    const w = Number.parseFloat(raw);
    const pad = Number.parseFloat(pl);
    if (!Number.isFinite(w)) {
      return 368;
    }
    return w - (Number.isFinite(pad) ? pad : 0);
  }

  /**
   * @param {HTMLElement} layer
   * @param {'prep' | 'ready'} zone
   * @param {Array<{ source: string, number: string }>} samples
   */
  function renderZoneLayer(layer, zone, samples) {
    const data = root.MilkshaSourceIconMockup;
    const doc = layer.ownerDocument;
    const maxW = readCellMaxWidth(doc);

    for (let i = 0; i < 10; i += 1) {
      const center = data.cellCenter(zone, i);
      const cell = doc.createElement('div');
      cell.className = 'source-icons-mockup__cell';
      cell.style.left = center.cx + 'px';
      cell.style.top = center.cy + 'px';

      const sample = samples[i];
      if (sample) {
        const row = createChipRow(doc, sample, zone === 'ready');
        cell.appendChild(row);
        layer.appendChild(cell);
        fitRowWidth(row, maxW);
      }
    }
  }

  /**
   * @param {HTMLElement} layer
   */
  function refitLayerRows(layer) {
    const doc = layer.ownerDocument;
    const maxW = readCellMaxWidth(doc);
    const rows = layer.querySelectorAll('.source-icons-mockup__row');
    rows.forEach(function (row) {
      fitRowWidth(row, maxW);
    });
  }

  /**
   * @param {HTMLElement} boardRoot
   */
  function renderFullBoard(boardRoot) {
    const data = root.MilkshaSourceIconMockup;
    const doc = boardRoot.ownerDocument;

    const prepLayer = doc.createElement('div');
    prepLayer.className = 'source-icons-mockup__layer';
    prepLayer.setAttribute('aria-label', '準備中');
    renderZoneLayer(prepLayer, 'prep', data.PREP_SAMPLES);

    const readyLayer = doc.createElement('div');
    readyLayer.className = 'source-icons-mockup__layer';
    readyLayer.setAttribute('aria-label', '請取餐');
    renderZoneLayer(readyLayer, 'ready', data.READY_SAMPLES);

    boardRoot.replaceChildren(prepLayer, readyLayer);
    requestAnimationFrame(function () {
      refitLayerRows(prepLayer);
      refitLayerRows(readyLayer);
      requestAnimationFrame(function () {
        refitLayerRows(prepLayer);
        refitLayerRows(readyLayer);
      });
    });
  }

  /**
   * @param {HTMLElement} zoomRoot
   */
  function renderZoomPanel(zoomRoot) {
    const data = root.MilkshaSourceIconMockup;
    const doc = zoomRoot.ownerDocument;
    zoomRoot.replaceChildren();

    data.ZOOM_SAMPLES.forEach(function (sample) {
      const panel = doc.createElement('div');
      panel.className = 'source-icons-zoom__panel';

      const label = doc.createElement('div');
      label.className = 'source-icons-zoom__label';
      label.textContent = sample.label;
      panel.appendChild(label);

      const chip = doc.createElement('div');
      chip.className = 'source-icons-zoom__chip';
      chip.appendChild(createChipRow(doc, sample, false));
      panel.appendChild(chip);

      zoomRoot.appendChild(panel);
    });
  }

  root.MilkshaSourceIconRender = {
    renderFullBoard: renderFullBoard,
    renderZoomPanel: renderZoomPanel,
    fitRowWidth: fitRowWidth,
  };
})(typeof window !== 'undefined' ? window : globalThis);
