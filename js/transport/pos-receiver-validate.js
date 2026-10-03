/**
 * posReceiver (入口 A) validation — mirrors milksha-cloud rules for fake cloud / local shim.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const ENTRY_A_OFF_MSG = '入口 A 未啟用';
  const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

  function milkshaTargetForAccount(account) {
    return 'milksha' + String(account || '');
  }

  /**
   * @param {string} ts milksha timeStmp
   * @returns {Date|null}
   */
  function parseTimeStmp(ts) {
    if (!ts || typeof ts !== 'string') {
      return null;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2}):(\d+)$/.exec(ts);
    if (!m) {
      return null;
    }
    const ms = Number(String(m[7]).slice(0, 3)) || 0;
    const y = m[1];
    const mo = m[2];
    const da = m[3];
    const h = m[4];
    const mi = m[5];
    const s = m[6];
    const ms3 = String(ms).padStart(3, '0');
    return new Date(`${y}-${mo}-${da}T${h}:${mi}:${s}.${ms3}+08:00`);
  }

  function md5ServiceJson(serviceSpecialData_Json, md5Fn) {
    const json = JSON.stringify(serviceSpecialData_Json);
    return md5Fn(json);
  }

  /**
   * @param {object} body
   * @param {object} opts
   * @param {(text: string) => string} opts.md5Hex
   * @param {boolean} [opts.entryAEnabled]
   * @param {number} [opts.maxAgeMs]
   * @param {Date} [opts.now]
   */
  function validatePosReceiverBody(body, opts) {
    const md5Hex = opts.md5Hex;
    const now = opts.now || new Date();
    const maxAgeMs = typeof opts.maxAgeMs === 'number' ? opts.maxAgeMs : DEFAULT_MAX_AGE_MS;

    if (opts.entryAEnabled === false) {
      return { ok: false, information: ENTRY_A_OFF_MSG };
    }
    if (!body || !body.serviceSpecialData_Json) {
      return { ok: false, information: '叫號資料格式錯誤' };
    }
    const rawInner =
      typeof opts.serviceSpecialDataJsonRaw === 'string' ? opts.serviceSpecialDataJsonRaw : null;
    const jsonStr = rawInner !== null ? rawInner : JSON.stringify(body.serviceSpecialData_Json);
    const expectedHash = md5Hex(jsonStr);
    if (!body.serviceSpecialData_Json_Md5Hash || body.serviceSpecialData_Json_Md5Hash !== expectedHash) {
      return { ok: false, information: 'Md5Hash 不符' };
    }
    const parsed = parseTimeStmp(body.timeStmp);
    if (!parsed) {
      return { ok: false, information: 'timeStmp 格式錯誤' };
    }
    const age = now.getTime() - parsed.getTime();
    if (age > maxAgeMs || age < -60000) {
      return { ok: false, information: 'timeStmp 已過期' };
    }
    const account = String(body.account || '');
    const expectedTarget = milkshaTargetForAccount(account);
    const target = body.serviceSpecialData_Json.target || '';
    if (target !== expectedTarget) {
      return { ok: false, information: '找不到目標叫號機' };
    }
    return { ok: true, information: '' };
  }

  QMS.Transport.PosReceiverValidate = {
    ENTRY_A_OFF_MSG: ENTRY_A_OFF_MSG,
    DEFAULT_MAX_AGE_MS: DEFAULT_MAX_AGE_MS,
    milkshaTargetForAccount: milkshaTargetForAccount,
    parseTimeStmp: parseTimeStmp,
    md5ServiceJson: md5ServiceJson,
    validatePosReceiverBody: validatePosReceiverBody,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
