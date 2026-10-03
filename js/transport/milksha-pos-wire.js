/**
 * Build posReceiver HTTP body with byte-identical embedded serviceSpecialData_Json text.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};
  const PosSign = QMS.Transport.MilkshaPosSign;
  const Md5 = QMS.Transport.MilkshaMd5;

  function buildPosReceiverWire(draft, signature) {
    const innerText = JSON.stringify(draft.serviceSpecialData_Json);
    const timeStmp = draft.timeStmp || PosSign.formatTimeStmp();
    const md5Hash = Md5.md5Hex(innerText);
    const isEncrypt = draft.isEncrypt === true;
    const wireText =
      '{"isEncrypt":' +
      (isEncrypt ? 'true' : 'false') +
      ',"serviceSpecialData_Json":' +
      innerText +
      ',"merchant_id":' +
      JSON.stringify(String(draft.merchant_id || '')) +
      ',"account":' +
      JSON.stringify(String(draft.account || '')) +
      ',"timeStmp":' +
      JSON.stringify(timeStmp) +
      ',"serviceSpecialData_Json_Md5Hash":' +
      JSON.stringify(md5Hash) +
      ',"signature":' +
      JSON.stringify(String(signature || '')) +
      '}';
    return {
      wireText: wireText,
      innerText: innerText,
      md5Hash: md5Hash,
      timeStmp: timeStmp,
    };
  }

  /**
   * @param {object} draft partial posReceiver body (serviceSpecialData_Json object required)
   * @param {string} secret POS sign key
   * @param {boolean} [wrongSign]
   */
  async function signPosWire(draft, secret, wrongSign) {
    const innerText = JSON.stringify(draft.serviceSpecialData_Json);
    const timeStmp = draft.timeStmp || PosSign.formatTimeStmp();
    const md5Hash = Md5.md5Hex(innerText);
    const canonical =
      String(draft.merchant_id || '') +
      '|' +
      String(draft.account || '') +
      '|' +
      timeStmp +
      '|' +
      md5Hash;
    let signature = await PosSign.hmacSha256Base64(secret, canonical);
    if (wrongSign) {
      signature = 'WRONG-' + (signature || '').slice(0, 8);
    }
    const built = buildPosReceiverWire(
      Object.assign({}, draft, { timeStmp: timeStmp }),
      signature,
    );
    return built;
  }

  QMS.Transport.MilkshaPosWire = {
    buildPosReceiverWire: buildPosReceiverWire,
    signPosWire: signPosWire,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
