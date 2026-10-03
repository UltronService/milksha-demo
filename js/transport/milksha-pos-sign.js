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
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    function pick(type) {
      const p = parts.find(function (x) {
        return x.type === type;
      });
      return p ? p.value : '00';
    }
    const y = pick('year');
    const mo = pick('month');
    const da = pick('day');
    const h = pick('hour');
    const mi = pick('minute');
    const s = pick('second');
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
    const Wire = QMS.Transport.MilkshaPosWire;
    if (Wire && Wire.signPosWire) {
      const built = await Wire.signPosWire(body, secret, false);
      const parsed = JSON.parse(built.wireText);
      parsed.__wireText = built.wireText;
      parsed.__innerText = built.innerText;
      return parsed;
    }
    const copy = JSON.parse(JSON.stringify(body));
    if (!copy.timeStmp) {
      copy.timeStmp = formatTimeStmp();
    }
    const innerText = JSON.stringify(copy.serviceSpecialData_Json);
    copy.serviceSpecialData_Json_Md5Hash = Md5.md5Hex(innerText);
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
    const Wire = QMS.Transport.MilkshaPosWire;
    if (Wire && Wire.signPosWire) {
      const built = await Wire.signPosWire(body, secret, wrong);
      return {
        wireText: built.wireText,
        innerText: built.innerText,
        parsed: JSON.parse(built.wireText),
      };
    }
    const signed = await signPosBody(body, secret);
    if (wrong) {
      signed.signature = 'WRONG-' + (signed.signature || '').slice(0, 8);
    }
    return { wireText: null, innerText: null, parsed: signed };
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
    hmacSha256Base64: hmacSha256Base64,
    signPosBody: signPosBody,
    applyPosSignature: applyPosSignature,
    verifyPosBody: verifyPosBody,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
