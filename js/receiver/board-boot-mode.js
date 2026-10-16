/**
 * Home board (?store / ?mode) boot mode resolution.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  /**
   * @param {URLSearchParams} params
   * @param {{ prefersDefaultCloudMode?: boolean }} [options]
   * @returns {'local'|'cloud'|'firestore'|string}
   */
  function resolveHomeBoardBootMode(params, options) {
    const opts = options || {};
    const modeParam = String(params.get('mode') || '').toLowerCase();
    if (modeParam === 'local' || modeParam === 'cloud' || modeParam === 'firestore') {
      return modeParam;
    }
    if (modeParam) {
      return modeParam;
    }
    const store = params.get('store');
    if (store !== null && String(store).trim() !== '') {
      return 'cloud';
    }
    return opts.prefersDefaultCloudMode ? 'cloud' : 'local';
  }

  QMS.Receiver.resolveHomeBoardBootMode = resolveHomeBoardBootMode;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
