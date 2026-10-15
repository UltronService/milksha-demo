/**
 * Boot live milksha-board for source-icon mockup (no cloud / no production changes).
 */
(function (root) {
  'use strict';

  const QMS = root.QMS;

  /**
   * @returns {boolean}
   */
  /**
   * @returns {'icons' | 'empty' | 'numbers'}
   */
  function mockMode() {
    if (!root.location) {
      return 'icons';
    }
    const params = new URLSearchParams(root.location.search);
    if (params.get('baseline') === '1') {
      return 'empty';
    }
    if (params.get('baseline') === 'numbers') {
      return 'numbers';
    }
    return 'icons';
  }

  function bootMockBoard() {
    if (!QMS || typeof QMS.loadSiteBrand !== 'function' || typeof QMS.bootMilkshaBoard !== 'function') {
      return;
    }
    document.body.classList.add('source-icons-live-mockup');

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

        const mode = mockMode();
        if (mode === 'empty') {
          runtime.applyPayload([], { silent: true });
          rootEl.dataset.mockupLayoutReady = 'true';
          rootEl.dataset.mockupMode = 'baseline-empty';
          return;
        }

        const payload = root.MilkshaSourceIconMockup.buildPayload();
        runtime.applyPayload(payload, { silent: true });

        if (mode === 'numbers') {
          rootEl.dataset.mockupLayoutReady = 'true';
          rootEl.dataset.mockupMode = 'baseline-numbers';
          return;
        }

        if (typeof root.MilkshaSourceIconsLiveOverlay !== 'object') {
          throw new Error('MilkshaSourceIconsLiveOverlay missing');
        }
        root.MilkshaSourceIconsLiveOverlay.apply(rootEl);
      })
      .catch(function (err) {
        const rootEl = document.getElementById('board-root');
        if (rootEl) {
          rootEl.textContent = String(err && err.message ? err.message : err);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootMockBoard);
  } else {
    bootMockBoard();
  }
})(typeof window !== 'undefined' ? window : globalThis);
