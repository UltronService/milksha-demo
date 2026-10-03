/**
 * Controller-only secrets (browser localStorage). Never put in #cfg= hash or board.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const POS_SIGN_KEY = 'milksha:controller-pos-sign-key';

  function loadPosSignSecret(storage) {
    const s = storage || root.localStorage;
    try {
      return String(s.getItem(POS_SIGN_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function savePosSignSecret(value, storage) {
    const s = storage || root.localStorage;
    try {
      s.setItem(POS_SIGN_KEY, String(value || '').trim());
    } catch (e) {
      /* ignore */
    }
  }

  QMS.Transport.ControllerSecrets = {
    POS_SIGN_KEY: POS_SIGN_KEY,
    loadPosSignSecret: loadPosSignSecret,
    savePosSignSecret: savePosSignSecret,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
