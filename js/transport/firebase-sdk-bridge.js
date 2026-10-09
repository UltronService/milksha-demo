/**
 * Firebase compat (Auth + Firestore) for board onSnapshot. Optional when CDN scripts missing.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const SDK_VERSION = '10.14.1';

  let appInited = false;
  let firestoreEmulatorConnected = false;
  let authEmulatorConnected = false;
  /** @type {string|null} */
  let lastAuthSyncErrorCode = null;
  let authSyncWarned = false;

  function authErrorCode(err) {
    if (!err) {
      return 'unknown';
    }
    if (err.code != null && String(err.code).trim()) {
      return String(err.code);
    }
    if (err.message) {
      return String(err.message).slice(0, 120);
    }
    return 'unknown';
  }

  function firebaseGlobal() {
    return root.firebase;
  }

  function isSdkLoaded() {
    const fb = firebaseGlobal();
    return Boolean(fb && fb.app && fb.auth && fb.firestore);
  }

  function initApp(config) {
    if (!isSdkLoaded()) {
      return false;
    }
    const fb = firebaseGlobal();
    if (appInited) {
      return true;
    }
    const cfg = {
      apiKey: config.apiKey || '',
      projectId: config.projectId || 'milksha-qms-dev',
    };
    if (!fb.apps || !fb.apps.length) {
      fb.initializeApp(cfg);
    }
    const fsHost = String(config.firestoreEmulatorHost || config.emulatorHost || '').trim();
    if (fsHost && !firestoreEmulatorConnected) {
      const parts = fsHost.split(':');
      const hostname = parts[0] || '127.0.0.1';
      const port = Number(parts[1] || 8080);
      fb.firestore().useEmulator(hostname, port);
      firestoreEmulatorConnected = true;
    }
    const authHost = String(config.authEmulatorHost || '').trim();
    if (authHost && !authEmulatorConnected) {
      const parts = authHost.split(':');
      const hostname = parts[0] || '127.0.0.1';
      const port = Number(parts[1] || 9099);
      fb.auth().useEmulator('http://' + hostname + ':' + String(port));
      authEmulatorConnected = true;
    }
    appInited = true;
    return true;
  }

  /**
   * @param {object} config
   * @param {object} session
   * @returns {Promise<boolean>}
   */
  async function ensureFirebaseSignedIn(config, session) {
    if (!initApp(config)) {
      return false;
    }
    const auth = firebaseGlobal().auth();
    if (auth.currentUser) {
      return true;
    }
    if (session && session.ensureIdToken) {
      try {
        await session.ensureIdToken();
      } catch (e) {
        return false;
      }
      return Boolean(auth.currentUser);
    }
    if (!session || !session.devLogin) {
      return false;
    }
    try {
      const customToken = await session.devLogin();
      await auth.signInWithCustomToken(customToken);
      return Boolean(auth.currentUser);
    } catch (e) {
      return false;
    }
  }

  /**
   * Keep Firebase Auth in sync when REST sign-in already obtained a custom token.
   * @param {string} customToken
   * @param {object} config
   */
  async function syncCustomToken(customToken, config) {
    if (!customToken || !initApp(config)) {
      return;
    }
    const auth = firebaseGlobal().auth();
    if (auth.currentUser) {
      return;
    }
    try {
      await auth.signInWithCustomToken(customToken);
      lastAuthSyncErrorCode = null;
    } catch (e) {
      lastAuthSyncErrorCode = authErrorCode(e);
      if (!authSyncWarned) {
        authSyncWarned = true;
        root.console.warn(
          '[milksha] Firebase Auth sync failed (realtime may use REST polling):',
          lastAuthSyncErrorCode,
        );
      }
    }
  }

  function getLastAuthSyncError() {
    return lastAuthSyncErrorCode;
  }

  function firestoreDb() {
    if (!isSdkLoaded() || !appInited) {
      return null;
    }
    return firebaseGlobal().firestore();
  }

  QMS.Transport.FirebaseSdkBridge = {
    SDK_VERSION: SDK_VERSION,
    isSdkLoaded: isSdkLoaded,
    initApp: initApp,
    ensureFirebaseSignedIn: ensureFirebaseSignedIn,
    syncCustomToken: syncCustomToken,
    getLastAuthSyncError: getLastAuthSyncError,
    firestoreDb: firestoreDb,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
