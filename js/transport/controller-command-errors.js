/**
 * Controller devCommand user-facing errors (Traditional Chinese).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const USER_MSG_401 = '登入已過期。請重新登入，再送出指令。';
  const USER_MSG_403 =
    '這個帳號沒有這間店的權限。請檢查店號。';
  const USER_MSG_CONNECT_ACCESS = '登入失敗。請稍後再按連線。';
  const USER_MSG_CONNECT_FORBIDDEN = USER_MSG_403;
  const USER_MSG_STORE_NOT_ALLOWED = '這家店不能用控制端測試，請用 s120030';
  const USER_MSG_CONNECT_CLOUD = '雲端暫時出錯。請稍後再連線。';
  const USER_MSG_DEVICE_NOT_FOUND = '請先打開看板';
  const USER_MSG_404 = USER_MSG_DEVICE_NOT_FOUND;
  const USER_MSG_400_INVALID = '指令內容不正確。請檢查欄位，再送出。';
  const USER_MSG_INVALID_DEVICE_ID = '裝置編號格式不對。請檢查後再送出。';
  const USER_MSG_INTERNAL_ERROR = '雲端暫時出錯。請稍後再送一次。';

  const SENSITIVE_KEY_RE =
    /(token|authorization|password|secret|apikey|api_key|signkey|sign_key|poskey|pos_key|signature|refreshtoken|idtoken|accesscode|access_code)/i;

  /**
   * @param {{ status?: number, response?: object }} err
   * @param {{ validationCode?: string }} [opts]
   * @returns {string}
   */
  function resolveErrorCode(err, opts) {
    const response = err && err.response ? err.response : null;
    if (response && response.code != null && String(response.code)) {
      return String(response.code);
    }
    if (opts && opts.validationCode) {
      return String(opts.validationCode);
    }
    const status = err && err.status ? Number(err.status) : 0;
    if (status === 404) {
      return 'device_not_found';
    }
    if (status === 500) {
      return 'internal_error';
    }
    return '';
  }

  /**
   * @param {{ status?: number, response?: object, message?: string }} err
   * @param {{ validationCode?: string }} [opts]
   * @returns {string}
   */
  /**
   * @param {{ status?: number, response?: object }} err
   * @returns {string}
   */
  function connectUserMessage(err) {
    const status = err && err.status ? Number(err.status) : 0;
    const code = resolveErrorCode(err, {});
    if (code === 'invalid_token' || code === 'unauthorized' || status === 401) {
      return USER_MSG_CONNECT_ACCESS;
    }
    if (code === 'store_not_allowed') {
      return USER_MSG_STORE_NOT_ALLOWED;
    }
    if (status === 403 || code === 'forbidden') {
      return USER_MSG_CONNECT_FORBIDDEN;
    }
    return USER_MSG_CONNECT_CLOUD;
  }

  function devCommandUserMessage(err, opts) {
    const status = err && err.status ? Number(err.status) : 0;
    const response = err && err.response ? err.response : null;
    const code = resolveErrorCode(err, opts);

    if (status === 403 || code === 'forbidden') {
      return USER_MSG_403;
    }
    if (status === 401 || code === 'invalid_token') {
      return USER_MSG_401;
    }
    if (code === 'device_not_found') {
      return USER_MSG_404;
    }
    if (code === 'invalid_device_id') {
      return USER_MSG_INVALID_DEVICE_ID;
    }
    if (code === 'invalid_command_params' || code === 'invalid_body' || code === 'payload_too_large') {
      return USER_MSG_400_INVALID;
    }
    if (code === 'internal_error' || status === 500) {
      return USER_MSG_INTERNAL_ERROR;
    }
    if (status === 400 || status === 413) {
      return USER_MSG_400_INVALID;
    }
    return USER_MSG_INTERNAL_ERROR;
  }

  function redactValue(key, value) {
    if (SENSITIVE_KEY_RE.test(String(key || ''))) {
      return '[已隱藏]';
    }
    return value;
  }

  function sanitizeForDetail(value, depth) {
    const d = depth || 0;
    if (d > 8) {
      return '[…]';
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > 2048) {
        return value.slice(0, 2048) + '…';
      }
      return value;
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return sanitizeForDetail(item, d + 1);
      });
    }
    const out = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      out[k] = sanitizeForDetail(redactValue(k, value[k]), d + 1);
    }
    return out;
  }

  /**
   * @param {number} status
   * @param {object|null|undefined} response
   * @returns {string}
   */
  function formatErrorDetailText(status, response) {
    const payload = {
      httpStatus: status || 0,
      response: sanitizeForDetail(response || {}),
    };
    try {
      return JSON.stringify(payload, null, 2);
    } catch (e) {
      return JSON.stringify({ httpStatus: status || 0, response: '[無法序列化]' });
    }
  }

  QMS.Transport.ControllerCommandErrors = {
    USER_MSG_401: USER_MSG_401,
    USER_MSG_403: USER_MSG_403,
    USER_MSG_404: USER_MSG_404,
    USER_MSG_400_INVALID: USER_MSG_400_INVALID,
    USER_MSG_INVALID_DEVICE_ID: USER_MSG_INVALID_DEVICE_ID,
    USER_MSG_INTERNAL_ERROR: USER_MSG_INTERNAL_ERROR,
    USER_MSG_CONNECT_ACCESS: USER_MSG_CONNECT_ACCESS,
    USER_MSG_CONNECT_FORBIDDEN: USER_MSG_CONNECT_FORBIDDEN,
    USER_MSG_CONNECT_CLOUD: USER_MSG_CONNECT_CLOUD,
    USER_MSG_STORE_NOT_ALLOWED: USER_MSG_STORE_NOT_ALLOWED,
    connectUserMessage: connectUserMessage,
    devCommandUserMessage: devCommandUserMessage,
    resolveErrorCode: resolveErrorCode,
    sanitizeForDetail: sanitizeForDetail,
    formatErrorDetailText: formatErrorDetailText,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
