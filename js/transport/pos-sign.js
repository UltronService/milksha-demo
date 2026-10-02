/**
 * POS request signature (pluggable; algorithm 待 milksha-cloud README).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {object} requestBody
   * @param {string} secret
   * @returns {string}
   */
  function signRequest(requestBody, secret) {
    const payload = JSON.stringify(requestBody.serviceSpecialData_Json || {});
    let hash = 0;
    const mix = payload + '|' + String(secret || '');
    for (let i = 0; i < mix.length; i += 1) {
      hash = (hash << 5) - hash + mix.charCodeAt(i);
      hash |= 0;
    }
    return 'DEV-SIGN-' + Math.abs(hash).toString(16);
  }

  /**
   * @param {object} requestBody
   * @param {string} secret
   * @param {boolean} wrong
   */
  function applySignature(requestBody, secret, wrong) {
    const copy = JSON.parse(JSON.stringify(requestBody));
    const sig = signRequest(copy, wrong ? 'wrong-secret' : secret);
    copy.signature = sig;
    return copy;
  }

  QMS.Transport.PosSign = {
    signRequest: signRequest,
    applySignature: applySignature,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
