/**
 * Milksha posReceiver signature: Base64(HMAC-SHA256(key, merchant|account|timeStmp|md5Hash))
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};
  const Md5 = QMS.Transport.MilkshaMd5;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatTimeStmp(d) {
    const date = d || new Date();
    const y = date.getFullYear();
    const mo = pad2(date.getMonth() + 1);
    const da = pad2(date.getDate());
    const h = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const s = pad2(date.getSeconds());
    const ms = String(date.getMilliseconds()).padStart(4, '0');
    return y + '-' + mo + '-' + da + '-' + h + '-' + mi + '-' + s + ':' + ms;
  }

  function md5ServiceJson(serviceSpecialData_Json) {
    const json = JSON.stringify(serviceSpecialData_Json);
    return Md5.md5Hex(json);
  }

  function canonicalString(body) {
    return (
      String(body.merchant_id || '') +
      '|' +
      String(body.account || '') +
      '|' +
      String(body.timeStmp || '') +
      '|' +
      String(body.serviceSpecialData_Json_Md5Hash || '')
    );
  }

  async function hmacSha256Base64(key, message) {
    const enc = new TextEncoder();
    const cryptoKey = await root.crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await root.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    const bytes = new Uint8Array(sig);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * @param {object} body partial milksha request
   * @param {string} secret
   */
  async function signPosBody(body, secret) {
    const copy = JSON.parse(JSON.stringify(body));
    if (!copy.timeStmp) {
      copy.timeStmp = formatTimeStmp();
    }
    copy.serviceSpecialData_Json_Md5Hash = md5ServiceJson(copy.serviceSpecialData_Json);
    const sig = await hmacSha256Base64(secret, canonicalString(copy));
    copy.signature = sig;
    return copy;
  }

  /**
   * @param {object} body
   * @param {string} secret
   * @param {boolean} wrong
   */
  async function applyPosSignature(body, secret, wrong) {
    const signed = await signPosBody(body, secret);
    if (wrong) {
      signed.signature = 'WRONG-' + (signed.signature || '').slice(0, 8);
    }
    return signed;
  }

  async function verifyPosBody(body, secret) {
    if (!body || !body.signature) {
      return false;
    }
    const expected = await hmacSha256Base64(secret, canonicalString(body));
    return body.signature === expected;
  }

  QMS.Transport.MilkshaPosSign = {
    formatTimeStmp: formatTimeStmp,
    md5ServiceJson: md5ServiceJson,
    canonicalString: canonicalString,
    signPosBody: signPosBody,
    applyPosSignature: applyPosSignature,
    verifyPosBody: verifyPosBody,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
