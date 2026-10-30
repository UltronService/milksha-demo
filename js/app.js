/**
 * Milksha call-board standalone bootstrap.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  function queryFlag(name) {
    if (!root.location) {
      return false;
    }
    const params = new URLSearchParams(root.location.search);
    return params.get(name) === '1' || params.get(name) === 'true';
  }

  function shouldMountWebBuildLabel() {
    if (!root.location || typeof root.location.pathname !== 'string') {
      return false;
    }
    return /\/pr-preview\/pr-\d+(?:\/|$)/.test(root.location.pathname);
  }

  function mountWebBuildLabel() {
    if (!shouldMountWebBuildLabel()) {
      return;
    }
    const doc = root.document;
    if (!doc || !doc.body) {
      return;
    }
    const label =
      typeof root.MILKSHA_BOARD_WEB_BUILD_LABEL === 'string'
        ? root.MILKSHA_BOARD_WEB_BUILD_LABEL.trim()
        : '';
    if (!label) {
      return;
    }
    if (doc.querySelector('.milksha-board-web-build')) {
      return;
    }
    const el = doc.createElement('div');
    el.className = 'milksha-board-web-build';
    el.textContent = label;
    el.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(el);
  }

  function showBootError(message) {
    const rootEl = root.document.getElementById('board-root');
    if (!rootEl) {
      return;
    }
    rootEl.className = 'boot-error-stage';
    rootEl.innerHTML =
      '<div class="boot-error-card"><h1>無法載入叫號看板</h1><p>' +
      String(message).replace(/</g, '&lt;') +
      '</p></div>';
  }

  function boot() {
    QMS.loadSiteBrand()
      .then(function (brand) {
        if (typeof QMS.bootMilkshaBoard !== 'function') {
          throw new Error('叫號看板模組未載入');
        }
        const runtime = QMS.bootMilkshaBoard(brand);
        if (queryFlag('demo') && typeof QMS.attachMilkshaDemo === 'function') {
          const base =
            brand.basePath ||
            (typeof QMS.detectSiteBase === 'function' ? QMS.detectSiteBase() : './');
          const scriptUrl =
            base === './'
              ? 'demo/milksha-demo-script.json'
              : base + 'demo/milksha-demo-script.json';
          QMS.attachMilkshaDemo(runtime, {
            scriptUrl: scriptUrl,
          });
        }
      })
      .catch(function (error) {
        showBootError(error && error.message ? error.message : String(error));
      });
  }

  QMS.boot = boot;
  QMS.showBootError = showBootError;

  if (root.document) {
    const onReady = function () {
      mountWebBuildLabel();
      boot();
    };
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
