/**
 * Post-command board refresh: superseded in-flight Firestore reads are not failures.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {unknown} err
   * @returns {boolean}
   */
  function isSupersededInflightReadAbort(err) {
    if (!err || typeof err !== 'object') {
      return false;
    }
    if (err.name === 'AbortError') {
      return true;
    }
    const msg = err.message ? String(err.message) : '';
    return msg.indexOf('aborted') !== -1;
  }

  /**
   * @param {() => Promise<void>} refreshFn
   * @returns {Promise<void>}
   */
  async function refreshBoardIgnoringSupersededAbort(refreshFn) {
    try {
      await refreshFn();
    } catch (err) {
      if (isSupersededInflightReadAbort(err)) {
        return;
      }
      throw err;
    }
  }

  QMS.Transport.BoardRefreshAfterCommand = {
    isSupersededInflightReadAbort: isSupersededInflightReadAbort,
    refreshBoardIgnoringSupersededAbort: refreshBoardIgnoringSupersededAbort,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
