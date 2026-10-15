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
   * @returns {HTMLElement}
   */
  function createChipRow(doc, item) {
    const row = doc.createElement('div');
    row.className = 'source-icons-mockup__row';

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
   * @param {HTMLElement} layer
   * @param {'prep' | 'ready'} zone
   */
  function applyUniformZoneScale(layer, zone) {
    const data = root.MilkshaSourceIconMockup;
    const cols = data.columnRects(zone);
    const isReady = zone === 'ready';
    const baseScale = isReady ? data.READY_BASE_SCALE : 1;
    const cells = layer.querySelectorAll('.source-icons-mockup__cell');

    cells.forEach(function (cell) {
      const row = cell.querySelector('.source-icons-mockup__row');
      if (row) {
        row.style.transform = 'none';
      }
    });

    let shrink = 1;
    cells.forEach(function (cell) {
      const colIdx = Number(cell.dataset.col);
      const col = cols[colIdx];
      if (!col || !Number.isFinite(colIdx)) {
        return;
      }
      const row = cell.querySelector('.source-icons-mockup__row');
      if (!row) {
        return;
      }
      const natural = row.getBoundingClientRect().width;
      if (natural <= 0) {
        return;
      }
      const maxW = col.width - 6;
      if (natural * baseScale > maxW) {
        shrink = Math.min(shrink, maxW / (natural * baseScale));
      }
    });

    const displayScale = baseScale * shrink;
    layer.style.setProperty('--mockup-zone-display-scale', String(displayScale));

    cells.forEach(function (cell) {
      const row = cell.querySelector('.source-icons-mockup__row');
      if (row) {
        row.style.transform = '';
      }
    });
  }

  /**
   * @param {HTMLElement} layer
   * @param {'prep' | 'ready'} zone
   * @param {Array<{ source: string, number: string }>} samples
   */
  function renderZoneLayer(layer, zone, samples) {
    const data = root.MilkshaSourceIconMockup;
    const doc = layer.ownerDocument;
    const cols = data.columnRects(zone);
    layer.dataset.zone = zone;

    for (let i = 0; i < 10; i += 1) {
      const meta = data.cellCenter(zone, i);
      const colRect = cols[meta.col];
      const cell = doc.createElement('div');
      cell.className = 'source-icons-mockup__cell';
      cell.dataset.col = String(meta.col);
      cell.dataset.row = String(meta.row);
      cell.style.left = colRect.left + 'px';
      cell.style.top = meta.cy + 'px';
      cell.style.width = colRect.width + 'px';

      const sample = samples[i];
      if (sample) {
        cell.appendChild(createChipRow(doc, sample));
      }
      layer.appendChild(cell);
    }
  }

  /**
   * @param {HTMLElement} boardRoot
   */
  function renderFullBoard(boardRoot) {
    const data = root.MilkshaSourceIconMockup;
    const doc = boardRoot.ownerDocument;
    delete boardRoot.dataset.mockupLayoutReady;

    const prepLayer = doc.createElement('div');
    prepLayer.className = 'source-icons-mockup__layer';
    prepLayer.setAttribute('aria-label', '準備中');
    renderZoneLayer(prepLayer, 'prep', data.PREP_SAMPLES);

    const readyLayer = doc.createElement('div');
    readyLayer.className = 'source-icons-mockup__layer';
    readyLayer.setAttribute('aria-label', '請取餐');
    renderZoneLayer(readyLayer, 'ready', data.READY_SAMPLES);

    boardRoot.replaceChildren(prepLayer, readyLayer);

    function finalize() {
      applyUniformZoneScale(prepLayer, 'prep');
      applyUniformZoneScale(readyLayer, 'ready');
      boardRoot.dataset.mockupLayoutReady = 'true';
    }

    requestAnimationFrame(function () {
      finalize();
      requestAnimationFrame(finalize);
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
      chip.appendChild(createChipRow(doc, sample));
      panel.appendChild(chip);

      zoomRoot.appendChild(panel);
    });
  }

  root.MilkshaSourceIconRender = {
    renderFullBoard: renderFullBoard,
    renderZoomPanel: renderZoomPanel,
    applyUniformZoneScale: applyUniformZoneScale,
  };
})(typeof window !== 'undefined' ? window : globalThis);
