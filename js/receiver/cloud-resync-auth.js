/**
 * Cloud resync auth: poll board/device without redundant devLogin when session cache is valid.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  /**
   * @param {object} session transport.session
   * @param {(force?: boolean) => Promise<void>} runEnsureIdTokenForce cloud-boot runEnsureIdToken
   * @param {() => void} afterAuth poll board/device/heartbeat
   */
  function runResyncAuthStep(session, runEnsureIdTokenForce, afterAuth) {
    const poll = typeof afterAuth === 'function' ? afterAuth : function () {};

    if (!session || !session.ensureIdToken) {
      poll();
      return Promise.resolve();
    }

    return session
      .ensureIdToken()
      .then(function () {
        poll();
      })
      .catch(function () {
        if (session.hasUsableCachedIdToken && session.hasUsableCachedIdToken()) {
          poll();
          return;
        }
        if (typeof runEnsureIdTokenForce === 'function') {
          return runEnsureIdTokenForce(true).then(function () {
            poll();
          });
        }
        poll();
      });
  }

  QMS.Receiver.runResyncAuthStep = runResyncAuthStep;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
