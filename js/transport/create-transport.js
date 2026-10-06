/**
 * Transport factory: local | firestore
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {'local' | 'firestore' | 'cloud'} mode
   * @param {object} options
   */
  function createTransport(mode, options) {
    if (mode === 'firestore' || mode === 'cloud') {
      const session = QMS.Transport.createAuthSession(options.config, {
        storeId: options.storeId,
        role: options.role || 'device',
        deviceId: options.deviceId,
        storage: options.storage,
        onAuthSuccess: options.onAuthSuccess,
      });
      return QMS.Transport.Firestore.createFirestoreTransport({
        storeId: options.storeId,
        config: options.config,
        session: session,
      });
    }
    return QMS.Transport.Local.createLocalTransport(options);
  }

  QMS.Transport.createTransport = createTransport;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
