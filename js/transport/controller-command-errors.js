/**
 * Controller devCommand user-facing errors (Traditional Chinese).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const USER_MSG_401 = '登入已過期。請重新登入，再送出指令。';
  const USER_MSG_404 = '找不到這台機上盒。請檢查裝置編號。';
  const USER_MSG_400_INVALID = '指令內容不正確。請檢查欄位，再送出。';

  const SENSITIVE_KEY_RE =
    /(token|authorization|password|secret|apikey|api_key|signkey|sign_key|poskey|pos_key|signature|refreshtoken|idtoken|accesscode|access_code)/i;

  function isInvalidParamsStatus(status, response) {
    if (Number(status) !== 400) {
      return false;
    }
    const code = response && response.error != null ? String(response.error) : '';
    return code === 'invalid_command_params' || code === 'invalid_device_id';
  }

  /**
   * @param {{ status?: number, response?: object, message?: string }} err
   * @param {{ validationCode?: string }} [opts]
   * @returns {string}
   */
  function devCommandUserMessage(err, opts) {
    const status = err && err.status ? Number(err.status) : 0;
    const response = err && err.response ? err.response : null;
    if (status === 401) {
      return USER_MSG_401;
    }
    if (status === 404) {
      return USER_MSG_404;
    }
    if (isInvalidParamsStatus(status, response)) {
      return USER_MSG_400_INVALID;
    }
    const vCode = opts && opts.validationCode ? String(opts.validationCode) : '';
    if (vCode === 'invalid_command_params' || vCode === 'invalid_device_id') {
      return USER_MSG_400_INVALID;
    }
    if (status === 400) {
      return USER_MSG_400_INVALID;
    }
    if (response && response.message) {
      return String(response.message);
    }
    return err && err.message ? String(err.message) : '指令送出失敗，請稍後再試。';
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
    USER_MSG_404: USER_MSG_404,
    USER_MSG_400_INVALID: USER_MSG_400_INVALID,
    devCommandUserMessage: devCommandUserMessage,
    isInvalidParamsStatus: isInvalidParamsStatus,
    sanitizeForDetail: sanitizeForDetail,
    formatErrorDetailText: formatErrorDetailText,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
