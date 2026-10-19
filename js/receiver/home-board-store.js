/**
 * Home board (index.html): resolve ?store= before boot / cloud connect.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  const SETUP_MESSAGE = '請設定店編號';

  /**
   * @param {URLSearchParams|string} input
   * @returns {{ status: 'ready', storeId: string } | { status: 'setup', reason: 'missing' | 'empty' | 'invalid' }}
   */
  function resolveStoreFromUrlParams(input) {
    const params =
      input instanceof URLSearchParams
        ? input
        : new URLSearchParams(typeof input === 'string' ? input : '');
    const raw = params.get('store');
    if (raw === null) {
      return { status: 'setup', reason: 'missing' };
    }
    const trimmed = String(raw).trim();
    if (!trimmed) {
      return { status: 'setup', reason: 'empty' };
    }
    const StoreId = QMS.StoreId;
    const valid =
      StoreId && typeof StoreId.isValidStoreIdFormat === 'function'
        ? StoreId.isValidStoreIdFormat(trimmed)
        : false;
    if (!valid) {
      return { status: 'setup', reason: 'invalid' };
    }
    return { status: 'ready', storeId: trimmed };
  }

  /**
   * @param {URLSearchParams|string} input
   * @returns {boolean}
   */
  function needsStoreSetup(input) {
    return resolveStoreFromUrlParams(input).status === 'setup';
  }

  QMS.Receiver.HomeBoardStore = {
    SETUP_MESSAGE: SETUP_MESSAGE,
    resolveStoreFromUrlParams: resolveStoreFromUrlParams,
    needsStoreSetup: needsStoreSetup,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
