/**
 * Uniform-font full-board preview (production board + mock icons, no chip-scale).
 */
(function (root) {
  'use strict';

  const QMS = root.QMS;

  /**
   * @returns {{ fontPx: number, markOverflow: boolean, label: string }}
   */
  function previewOptions() {
    const params = new URLSearchParams(root.location.search);
    const fontRaw = params.get('fontPx') || '81';
    const fontPx = Number.parseFloat(fontRaw);
    return {
      fontPx: Number.isFinite(fontPx) ? fontPx : 81,
      markOverflow: params.get('markOverflow') !== '0',
      label: params.get('label') || '字級預覽',
    };
  }

  function boot() {
    if (!QMS || typeof QMS.loadSiteBrand !== 'function' || typeof QMS.bootMilkshaBoard !== 'function') {
      return;
    }
    document.body.classList.add('source-icons-font-preview', 'source-icons-live-mockup');

    const opts = previewOptions();
    const legend = document.getElementById('font-preview-legend');
    if (legend) {
      legend.innerHTML =
        '<strong>' +
        opts.label +
        '</strong><br/>' +
        '1920×1080 · 兩區同字級 <strong>' +
        opts.fontPx +
        'px</strong> · 無 chip-scale · 熊貓含 #<br/>' +
        '背景 <code>assets/milksha-board-bg-1007.jpg</code> · 正式看板號碼排版';
    }

    QMS.loadSiteBrand({
      fetchFn: function fetchBrandFromSiteRoot(url, init) {
        const href = String(url || '');
        if (href.indexOf('brand.json') >= 0) {
          return root.fetch('/brand.json', init);
        }
        return root.fetch(url, init);
      },
    })
      .then(function (brand) {
        const runtime = QMS.bootMilkshaBoard(brand, { orientation: 'landscape' });
        runtime.setMuted(true);
        const rootEl = document.getElementById('board-root');
        if (!rootEl) {
          return;
        }
        const payload = root.MilkshaSourceIconMockup.buildPayload();
        runtime.applyPayload(payload, { silent: true });
        rootEl.style.setProperty('--milksha-num-font', opts.fontPx + 'px');

        if (typeof root.MilkshaSourceIconsFontPreviewOverlay !== 'object') {
          throw new Error('MilkshaSourceIconsFontPreviewOverlay missing');
        }
        const overflows = root.MilkshaSourceIconsFontPreviewOverlay.apply(rootEl, opts);
        if (legend && overflows.length > 0) {
          legend.innerHTML +=
            '<br/><span style="color:#c62828">溢出 ' +
            overflows.length +
            ' 列（紅框）：</span> ' +
            overflows.slice(0, 6).join(' · ') +
            (overflows.length > 6 ? ' …' : '');
        } else if (legend && opts.markOverflow) {
          legend.innerHTML += '<br/>cream 內：全部列未標溢出';
        }
      })
      .catch(function (err) {
        const rootEl = document.getElementById('board-root');
        if (rootEl) {
          rootEl.textContent = String(err && err.message ? err.message : err);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
