/**
 * Controller-only secrets (browser localStorage). Never put in #cfg= hash or board.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const POS_SIGN_KEY = 'milksha:controller-pos-sign-key';

  function bundledPosSignSecret() {
    const b = root.MILKSHA_FIREBASE_CONFIG || {};
    return String(b.posSignSecret || '').trim();
  }

  function loadPosSignSecret(storage) {
    const s = storage || root.localStorage;
    try {
      const stored = String(s.getItem(POS_SIGN_KEY) || '').trim();
      if (stored) {
        return stored;
      }
    } catch (e) {
      /* ignore */
    }
    return bundledPosSignSecret();
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
