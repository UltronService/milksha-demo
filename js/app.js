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

  function showHomeBoardStoreSetup() {
    const gate = root.document.getElementById('board-store-setup');
    const rootEl = root.document.getElementById('board-root');
    const HomeBoardStore = QMS.Receiver && QMS.Receiver.HomeBoardStore;
    const message =
      HomeBoardStore && HomeBoardStore.SETUP_MESSAGE
        ? HomeBoardStore.SETUP_MESSAGE
        : '請設定店編號';
    if (gate) {
      const text = gate.querySelector('p');
      if (text) {
        text.textContent = message;
      }
      gate.hidden = false;
    }
    if (rootEl) {
      rootEl.hidden = true;
    }
  }

  function boot() {
    const rootEl = root.document.getElementById('board-root');
    if (rootEl) {
      const HomeBoardStore = QMS.Receiver && QMS.Receiver.HomeBoardStore;
      if (HomeBoardStore && typeof HomeBoardStore.needsStoreSetup === 'function') {
        const params = new URLSearchParams(root.location.search);
        if (HomeBoardStore.needsStoreSetup(params)) {
          showHomeBoardStoreSetup();
          return;
        }
      }
    }
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
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
