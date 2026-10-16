/**
 * Uniform-font full-board preview (production board + mock icons, no chip-scale).
 */
(function (root) {
  'use strict';

  const QMS = root.QMS;

  /**
   * @returns {{ fontPx: number, markOverflow: boolean }}
   */
  function previewOptions() {
    const params = new URLSearchParams(root.location.search);
    const fontRaw = params.get('fontPx') || '81';
    const fontPx = Number.parseFloat(fontRaw);
    return {
      fontPx: Number.isFinite(fontPx) ? fontPx : 81,
      markOverflow: params.get('markOverflow') === '1',
    };
  }

  function boot() {
    if (!QMS || typeof QMS.loadSiteBrand !== 'function' || typeof QMS.bootMilkshaBoard !== 'function') {
      return;
    }
    document.body.classList.add('source-icons-font-preview', 'source-icons-uiux-preview');

    const opts = previewOptions();

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
        root.MilkshaSourceIconsFontPreviewOverlay.apply(rootEl, {
          fontPx: opts.fontPx,
          markOverflow: opts.markOverflow,
          label: '',
        });
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
